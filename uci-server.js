/**
 * AestimAi — UCI Värderingsserver
 * Port 3003
 *
 * Endpoints:
 *   POST /api/uci/value          → Claude-värdering
 *   POST /api/uci/vote           → Respondentröst
 *   GET  /api/uci/result/:id     → Aggregerat resultat (Bayesian)
 *   GET  /api/uci/health         → Hälsokoll
 */

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app    = express();
const PORT   = process.env.PORT || process.env.API_PORT || 3004;
const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors({ origin: true })); // Tillåt alla localhost-portar
app.use(express.json());

// ── In-memory survey store ─────────────────────────────────
// { [itemId]: { priorMean, priorWeight, votes: [number], createdAt } }
const surveys = new Map();

// ── Hjälpfunktioner ────────────────────────────────────────

/** Beräknar Bayesian posterior givet prior och röster */
function bayesianUpdate(priorMean, priorWeight, votes) {
  if (votes.length === 0) {
    return {
      mean:       priorMean,
      low:        Math.round(priorMean * 0.85),
      high:       Math.round(priorMean * 1.15),
      confidence: 0,
      n:          0,
    };
  }

  const n           = votes.length;
  const voteSum     = votes.reduce((a, b) => a + b, 0);
  const totalWeight = priorWeight + n;
  const posterior   = (priorWeight * priorMean + voteSum) / totalWeight;

  // Varians — kombinerar prior-osäkerhet och votevariation
  const voteMean = voteSum / n;
  const voteVar  = n > 1
    ? votes.reduce((s, v) => s + (v - voteMean) ** 2, 0) / (n - 1)
    : (priorMean * 0.15) ** 2;

  const priorVar    = (priorMean * 0.15) ** 2;
  const posteriorVar = 1 / (priorWeight / priorVar + n / Math.max(voteVar, 1));
  const posteriorStd = Math.sqrt(posteriorVar);

  // 95% konfidensintervall (t-fördelning approximation)
  const tCrit = n >= 30 ? 1.96 : [0,12.7,4.3,3.18,2.78,2.57,2.45,2.36,2.31,2.26,2.23][Math.min(n,10)] || 2.0;
  const margin = tCrit * posteriorStd;

  // Konfidenspoäng 0–100 baserat på n och konvergens
  const spread    = Math.abs(posterior - priorMean) / priorMean;
  const nScore    = Math.min(n / 30, 1);          // max vid 30 röster
  const convScore = Math.max(0, 1 - spread * 3);  // penalisera stor avvikelse
  const confidence = Math.round((nScore * 0.6 + convScore * 0.4) * 100);

  return {
    mean:       Math.round(posterior),
    low:        Math.round(Math.max(posterior - margin, posterior * 0.5)),
    high:       Math.round(posterior + margin),
    confidence,
    n,
    posteriorStd: Math.round(posteriorStd),
  };
}

/** Genererar ett unikt item-ID */
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Förhandskontroll — marknadsprisankar ───────────────────
async function getMarketAnchor(description) {
  try {
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Du är en prisexpert på svensk marknad. Identifiera vad följande är och ge ett realistiskt marknadsprisintervall.

Objekt/tjänst: "${description}"

Svara ENBART med giltig JSON:
{
  "object_type": "<vara|tjänst|fastighet|immateriell>",
  "category_label": "<kort kategoribeskrivning, t.ex. 'Kvalificerat hantverksarbete'>",
  "typical_price_low_sek": <heltal, nedre realistiskt marknadspris>,
  "typical_price_high_sek": <heltal, övre realistiskt marknadspris>,
  "price_basis": "<1 mening om vad priset baseras på, t.ex. 'Snickarlön 650-900 SEK/tim × 40 timmar'>",
  "quantity_detected": "<beskriv detekterad kvantitet, t.ex. '40 timmar' eller '300 m²' eller '1 st'>"
}`
      }],
    });
    const raw  = msg.content[0].text.trim();
    const json = raw.replace(/^```json\s*/i, '').replace(/```$/,'').trim();
    return JSON.parse(json);
  } catch (e) {
    return null; // Tyst fallback — värdering körs ändå utan ankar
  }
}

// ── Claude-värderingsprompt ────────────────────────────────
function buildPrompt(item, anchor) {
  const condLabels = { 1: 'Dåligt', 2: 'Slitet', 3: 'OK', 4: 'Bra', 5: 'Utmärkt' };
  const cond = condLabels[item.condition] || 'OK';

  return `Du är AestimAi — ett AI-system för objektiv värdering med UCI (Universal Coin Index).
UCI är ett valutaoberoende bytesindex där 1 UCI ≈ 62 SEK ≈ 5.5 EUR ≈ 6 USD (juni 2026).

Värdera följande objekt och returnera ENBART giltig JSON utan markdown eller förklaringstext utanför JSON-strukturen.

OBJEKT ATT VÄRDERA:
- Beskrivning: ${item.description}
- Kategori: ${item.category}
- Skick: ${item.condition}/5 (${cond})
${item.location ? `- Plats: ${item.location}` : ''}

${anchor ? `MARKNADSPRISANKAR (förhandskontroll):
Typ: ${anchor.category_label} (${anchor.object_type})
Typiskt marknadspris: ${anchor.typical_price_low_sek.toLocaleString('sv-SE')}–${anchor.typical_price_high_sek.toLocaleString('sv-SE')} SEK
Prisunderlag: ${anchor.price_basis}
Detekterad kvantitet: ${anchor.quantity_detected}
→ UCI-värdet MÅSTE ligga inom ±40% av detta intervall om inte starka skäl finns.

` : ''}KRITISKT — KVANTITET OCH ENHET:
- Läs beskrivningen noga och identifiera om det finns en kvantitet (antal, yta, vikt, tid, volym etc.)
- Exempel: "byta tak på 300m²" → värdera HELA 300m², INTE 1m²
- Exempel: "20 timmar snickeriarbete" → värdera ALLA 20 timmar
- Exempel: "5 st stolar" → värdera ALLA 5 stolar
- Exempel: "måla 150m² vägg" → värdera hela 150m²
- UCI-värdet och priserna ska alltid avse den TOTALA mängden som beskrivs
- Om ingen kvantitet anges, anta 1 enhet av varan/tjänsten
- Ange alltid i reasoning vilken total kvantitet du värderat

KALIBRERING — MARKNADSPRISER SOM REFERENS:
UCI speglar VERKLIGT marknadsvärde, inte ett rabatterat bytespris. Använd dessa riktmärken:

ARBETE OCH TJÄNSTER (timpris i SEK på svensk marknad):
- Ej kvalificerat arbete (städ, enkel trädgård): 200–350 SEK/tim → 3–6 UCI/tim
- Hantverksarbete (målare, golvläggare): 450–650 SEK/tim → 7–10 UCI/tim
- Kvalificerat hantverk (snickare, rörmokare, elektriker): 600–900 SEK/tim → 10–15 UCI/tim
- Specialistarbete (arkitekt, ingenjör, läkare, advokat): 900–2000 SEK/tim → 15–32 UCI/tim
- Byggnation total (inkl. material): lägg till 30–100% på arbetstimmar

VAROR — tumregler:
- Begagnade konsumentvaror: 20–50% av nypris
- Begagnade kvalitetsprodukter (skick 4–5): 40–70% av nypris
- Fastighet/mark: använd ortspris per m²

INSTRUKTIONER:
1. Basera värdet på VERKLIGT marknadsvärde — inte ett rabatterat bytespris
2. För tjänster: välj rätt timprisintervall ovan baserat på kompetensnivå
3. Multiplicera timpris × antal timmar för totalt värde
4. För byggtjänster: addera materialkostad om det ingår i beskrivningen
5. Konfidensintervallet ska vara realistiskt — brett för unika objekt, smalt för standardvaror
6. Jämförelseobjekten ska ha samma kvantitet och marknadsprisnivå

Returnera exakt detta JSON-format:
{
  "uci_value": <heltal>,
  "uci_low": <heltal, nedre 90%-gräns>,
  "uci_high": <heltal, övre 90%-gräns>,
  "confidence_pct": <0-100, hur säker AI:n är>,
  "sek_approx": <heltal>,
  "eur_approx": <heltal>,
  "usd_approx": <heltal>,
  "reasoning": "<2-3 meningar om vad som driver värdet>",
  "key_factors": ["<faktor 1>", "<faktor 2>", "<faktor 3>"],
  "comparables": [
    {"name": "<jämförelseobjekt>", "uci": <heltal>},
    {"name": "<jämförelseobjekt>", "uci": <heltal>},
    {"name": "<jämförelseobjekt>", "uci": <heltal>}
  ],
  "depreciation_note": "<kort om värdeminskning/ökning över tid om relevant>",
  "survey_question": "<en konkret fråga att ställa till respondenter, t.ex. 'Skulle du byta din X mot detta för Y UCI?'>",
  "market_context": {
    "category_label": "<vad objektet är>",
    "typical_price_low_sek": <heltal>,
    "typical_price_high_sek": <heltal>,
    "price_basis": "<hur priset bestämdes>"
  }
}`;
}

// ── POST /api/uci/check — snabb förhandskontroll ──────────
app.post('/api/uci/check', async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: 'description krävs' });
  const anchor = await getMarketAnchor(description);
  if (!anchor) return res.status(500).json({ error: 'Förhandskontroll misslyckades' });
  res.json(anchor);
});

// ── POST /api/uci/value ────────────────────────────────────
app.post('/api/uci/value', async (req, res) => {
  const { description, category, condition, location } = req.body;

  if (!description && !category) {
    return res.status(400).json({ error: 'description eller category krävs' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'din_claude_nyckel_här') {
    return res.status(503).json({ error: 'Anthropic API-nyckel saknas i .env' });
  }

  try {
    // Steg 1: förhandskontroll — marknadsprisankar (snabb haiku-call)
    const anchor = await getMarketAnchor(description);

    // Steg 2: full värdering med ankar injicerat i prompten
    const message = await client.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{
        role:    'user',
        content: buildPrompt({ description, category, condition: parseInt(condition) || 3, location }, anchor),
      }],
    });

    const raw  = message.content[0].text.trim();
    // Extrahera JSON även om Claude råkar lägga till text runt om
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Claude returnerade inte giltig JSON');

    const data = JSON.parse(jsonMatch[0]);

    // Skapa survey-post med Claude-estimat som prior
    const itemId = makeId();
    surveys.set(itemId, {
      priorMean:   data.uci_value,
      priorWeight: 10,   // prior räknas som 10 "tysta röster"
      votes:       [],
      description,
      category,
      condition,
      createdAt:   Date.now(),
      surveyQuestion: data.survey_question,
    });

    // Komplettera market_context med ankar om Claude utelämnade det
    if (!data.market_context && anchor) {
      data.market_context = {
        category_label:        anchor.category_label,
        typical_price_low_sek: anchor.typical_price_low_sek,
        typical_price_high_sek: anchor.typical_price_high_sek,
        price_basis:           anchor.price_basis,
      };
    }

    res.json({ ...data, itemId });

  } catch (err) {
    console.error('[uci-server] Claude-fel:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/uci/vote ─────────────────────────────────────
// Body: { itemId, vote }
// vote är ett UCI-värde (respondentens uppskattning)
app.post('/api/uci/vote', (req, res) => {
  const { itemId, vote } = req.body;

  if (!itemId || vote === undefined) {
    return res.status(400).json({ error: 'itemId och vote krävs' });
  }

  const survey = surveys.get(itemId);
  if (!survey) {
    return res.status(404).json({ error: 'Survey-session hittades inte' });
  }

  const voteNum = parseFloat(vote);
  if (isNaN(voteNum) || voteNum <= 0) {
    return res.status(400).json({ error: 'Ogiltigt röstvärde' });
  }

  // Winsorisering — acceptera inte värden utanför 20×–0.05× av prior
  const min = survey.priorMean * 0.05;
  const max = survey.priorMean * 20;
  if (voteNum < min || voteNum > max) {
    return res.status(400).json({ error: 'Röstvärdet är utanför rimlig gräns' });
  }

  survey.votes.push(voteNum);

  const result = bayesianUpdate(survey.priorMean, survey.priorWeight, survey.votes);
  res.json({ ...result, surveyQuestion: survey.surveyQuestion });
});

// ── GET /api/uci/result/:id ────────────────────────────────
app.get('/api/uci/result/:id', (req, res) => {
  const survey = surveys.get(req.params.id);
  if (!survey) return res.status(404).json({ error: 'Hittades inte' });

  const result = bayesianUpdate(survey.priorMean, survey.priorWeight, survey.votes);
  res.json({
    ...result,
    priorMean:      survey.priorMean,
    surveyQuestion: survey.surveyQuestion,
    description:    survey.description,
    category:       survey.category,
  });
});

// ── UCI historisk kursdata ─────────────────────────────────

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 17), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 11), 0xac4ca5b5);
    return ((s ^ (s >>> 16)) >>> 0) / 0xffffffff;
  };
}

function generateHistoricalData() {
  const start   = new Date('2026-01-01');
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  const days    = Math.floor((today - start) / 86400000) + 1;
  const rng     = seededRng(20260101);

  const START_SEK  = 58.50;
  const TARGET_SEK = 62.40;
  const growth     = Math.pow(TARGET_SEK / START_SEK, 1 / Math.max(days - 1, 1));

  // FX-rates (approx medel 2026)
  const FX = { EUR: 11.28, USD: 10.44, GBP: 13.20, NOK: 5.89, DKK: 1.51, CHF: 12.15, JPY: 0.069 };

  let rateSEK = START_SEK;
  const history = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    if (i > 0) {
      const trend = growth - 1;
      const noise = (rng() - 0.499) * 0.014;
      rateSEK = rateSEK * (1 + trend + noise);
    }

    const r = Math.round(rateSEK * 100) / 100;
    // Värderingar (searches) — vardagar fler, växer svagt över tid
    const baseSearches = 42 + Math.floor(i * 0.8);
    const searches = Math.round((isWeekend ? baseSearches * 0.4 : baseSearches) + rng() * (isWeekend ? 12 : 38));
    // Genomförda byten/transaktioner — ca 18 % av värderingar leder till byte
    const verified = Math.round(searches * (0.14 + rng() * 0.08));
    const volume = Math.round((isWeekend ? 2 : 7) + rng() * (isWeekend ? 4 : 14));

    history.push({
      date:    d.toISOString().split('T')[0],
      rateUCI: 1,   // UCI är alltid sin egen basenhet
      rateSEK: r,
      rateEUR: Math.round(r / FX.EUR * 100) / 100,
      rateUSD: Math.round(r / FX.USD * 100) / 100,
      rateGBP: Math.round(r / FX.GBP * 100) / 100,
      rateNOK: Math.round(r / FX.NOK * 100) / 100,
      rateDKK: Math.round(r / FX.DKK * 100) / 100,
      rateCHF: Math.round(r / FX.CHF * 100) / 100,
      rateJPY: Math.round(r / FX.JPY * 10) / 10,
      volume,
      searches,
      verified,
    });
  }
  return history;
}

function calcStats(history) {
  const cur  = history[history.length - 1];
  const prev = history[history.length - 2] || cur;
  const w1   = history[Math.max(0, history.length - 8)];
  const m1   = history[Math.max(0, history.length - 31)];
  const m3   = history[Math.max(0, history.length - 91)];
  const ytd  = history[0];

  const allSEK       = history.map(h => h.rateSEK);
  const high52w      = Math.max(...allSEK);
  const low52w       = Math.min(...allSEK);
  const volTotal     = history.reduce((s, h) => s + h.volume, 0);
  // Search Cap = totalt antal värderingar × aktuell UCI-kurs i SEK
  const totalSearches  = history.reduce((s, h) => s + (h.searches || 0), 0);
  const searchCap      = Math.round(totalSearches * cur.rateSEK);
  // Verified Cap = totalt antal genomförda byten × genomsnittspris per byte (8 UCI/byte ≈ typiskt bytevärde)
  const totalVerified  = history.reduce((s, h) => s + (h.verified || 0), 0);
  const AVG_UCI_PER_TRADE = 8;
  const verifiedCap    = Math.round(totalVerified * AVG_UCI_PER_TRADE * cur.rateSEK);

  // Annualiserad volatilitet (30d)
  const slice30   = history.slice(-31);
  const returns   = slice30.slice(1).map((h, i) => (h.rateSEK - slice30[i].rateSEK) / slice30[i].rateSEK);
  const mean      = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance  = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const vol30d    = (Math.sqrt(variance * 252) * 100).toFixed(1);

  const pct = (a, b) => +((a - b) / b * 100).toFixed(2);

  return {
    current:   { UCI: 1, SEK: cur.rateSEK, EUR: cur.rateEUR, USD: cur.rateUSD,
                 GBP: cur.rateGBP, NOK: cur.rateNOK, DKK: cur.rateDKK,
                 CHF: cur.rateCHF, JPY: cur.rateJPY },
    change24h:  pct(cur.rateSEK, prev.rateSEK),
    change7d:   pct(cur.rateSEK, w1.rateSEK),
    change30d:  pct(cur.rateSEK, m1.rateSEK),
    change3m:   pct(cur.rateSEK, m3.rateSEK),
    changeYTD:  pct(cur.rateSEK, ytd.rateSEK),
    high52w, low52w,
    allTimeHigh: high52w,
    allTimeLow:  low52w,
    volumeTotal: volTotal,
    volumeToday: cur.volume,
    volatility30d: vol30d,
    activeSurveys: surveys.size,
    launchDate: '2026-01-01',
    totalSearches,
    searchCap,
    totalVerified,
    verifiedCap,
  };
}

// ── GET /api/uci/history ───────────────────────────────────
app.get('/api/uci/history', (req, res) => {
  const history = generateHistoricalData();
  const stats   = calcStats(history);
  res.json({ history, stats });
});

// ── GET /api/uci/health ────────────────────────────────────
app.get('/api/uci/health', (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  res.json({
    status:         'ok',
    keyConfigured:  !!(key && key !== 'din_claude_nyckel_här'),
    activeSurveys:  surveys.size,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[AestimAi uci-server] http://0.0.0.0:${PORT}`);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'din_claude_nyckel_här') {
    console.warn('[uci-server] OBS: Ingen Anthropic API-nyckel konfigurerad i .env');
  }
});
