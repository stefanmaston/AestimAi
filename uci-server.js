/**
 * AestimAi — UCI Värderingsserver
 * Port 3004
 *
 * Endpoints:
 *   POST /api/uci/value          → Claude-värdering
 *   POST /api/uci/vote           → Respondentröst
 *   GET  /api/uci/result/:id     → Aggregerat resultat (Bayesian)
 *   GET  /api/uci/history        → Historisk kursdata
 *   GET  /api/uci/health         → Hälsokoll
 *   POST /api/uci/camera-analyze → AI-kameraanalys (Vision → identifiering + kontrollfrågor)
 */

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const cron      = require('node-cron');
const Anthropic = require('@anthropic-ai/sdk');

const app    = express();
const PORT   = process.env.PORT || process.env.API_PORT || 3004;
const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors({ origin: true })); // Tillåt alla localhost-portar
app.use(express.json({ limit: '10mb' })); // Bilder som base64 kan vara flera MB

// ── In-memory survey store ─────────────────────────────────
// { [itemId]: { priorMean, priorWeight, votes: [number], createdAt } }
const surveys = new Map();

// ── Supabase-aggregering ───────────────────────────────────
// Hämtar verklig värderingsstatistik (alla användares värderingar från
// appen) via en security-definer-RPC. Cachas 60s för att inte belasta DB.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
let _pfCache = { data: null, ts: 0 };

async function fetchPortfolioStats() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  if (_pfCache.data && Date.now() - _pfCache.ts < 60_000) return _pfCache.data;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/aestimai_portfolio_stats`, {
      method:  'POST',
      headers: {
        apikey:          SUPABASE_KEY,
        Authorization:   `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
      },
      body: '{}',
    });
    if (!r.ok) throw new Error('rpc ' + r.status);
    _pfCache = { data: await r.json(), ts: Date.now() };
    return _pfCache.data;
  } catch (e) {
    console.warn('[Portfolio] kunde inte hämta Supabase-stats:', e.message);
    return _pfCache.data; // ev. tidigare cachad data
  }
}

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
app.get('/api/uci/history', async (req, res) => {
  const history = generateHistoricalData();
  const stats   = calcStats(history);

  // Slå in VERKLIG värderingsstatistik från Supabase (appens värderingar)
  const pf = await fetchPortfolioStats();
  if (pf) {
    stats.volumeTotal   = pf.total_valuations;
    stats.volumeToday   = pf.valuations_today;
    stats.totalSearches = pf.total_valuations;
    stats.searchCap     = Math.round(pf.total_sek || 0); // total portföljvärde i SEK
    stats.portfolioUci  = pf.total_uci;
    stats.portfolioSek  = pf.total_sek;
    stats.cameraCount   = pf.camera_count;
    stats.manualCount   = pf.manual_count;
  }

  res.json({ history, stats });
});

// ── GET /api/uci/portfolio-stats ───────────────────────────
// Ren aggregerad värderingsdata + totalt portföljvärde i flera valutor.
app.get('/api/uci/portfolio-stats', async (req, res) => {
  const pf = await fetchPortfolioStats();
  if (!pf) return res.status(503).json({ error: 'portfolio-stats ej tillgänglig (saknar Supabase-konfiguration)' });

  // Räkna om totalt UCI till valutor med aktuella kurser (kurs = valuta per 1 UCI)
  const rate = calcStats(generateHistoricalData()).current;
  const uci  = pf.total_uci || 0;
  res.json({
    ...pf,
    value_uci: uci,
    value_sek: Math.round(uci * rate.SEK),
    value_eur: Math.round(uci * rate.EUR),
    value_usd: Math.round(uci * rate.USD),
    rates: rate,
  });
});

// ── Daglig UCI-kommentar (8 teman) ─────────────────────────
const COMMENTARY_THEMES = [
  'Inflation & köpkraft',
  'Centralbankspolitik',
  'Valuta & FX',
  'Råvaror & reala tillgångar',
  'Krypto & tokenisering',
  'Cirkulär ekonomi',
  'Kooperativ & ägande',
  'Beteende & folkvärdering',
];

let _commentary = { date: null, items: [] };

function todayStr() { return new Date().toISOString().slice(0, 10); }

// Hämtar dagens finansnyhetsrubriker från news-tjänsten (best-effort).
async function fetchNewsHeadlines() {
  try {
    const url = process.env.NEWS_URL || 'https://news-production-370c.up.railway.app/api/news?cat=all';
    const r = await fetch(url);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.articles || []).map(a => a.title).filter(Boolean).slice(0, 12);
  } catch { return []; }
}

async function generateCommentary() {
  const today = todayStr();
  const themeList = COMMENTARY_THEMES.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const headlines = await fetchNewsHeadlines();
  const newsBlock = headlines.length
    ? `\n\nDAGENS FINANSNYHETER (förankra kommentarerna i dessa där det passar temat – tvinga inte in en rubrik som inte hör hemma):\n${headlines.map(h => '- ' + h).join('\n')}`
    : '';

  const prompt =
`Du är finansredaktör för AestimAi och UCI (Universal Coin Index) – ett valutaoberoende, nyttobaserat bytesvärdesindex som ägs av en ekonomisk förening där användarna är delägare.

Skriv åtta korta dagliga kommentarer (2–3 meningar var) för datumet ${today}, en för varje tema nedan. Varje kommentar ska:
- förankras i dagens nyheter nedan där det är relevant för temat,
- knyta temat till UCI:s perspektiv (realt bytevärde, valutaoberoende, folkvaliderat, kooperativt ägt),
- kännas aktuell och engagerande, på svenska,
- INTE ge finansiell rådgivning.

Teman (behåll exakt denna ordning och dessa rubriker):
${themeList}${newsBlock}

Svara ENBART med giltig JSON, en array med åtta objekt i samma ordning, inga kodblock:
[{"title":"<rubrik>","text":"<kommentar>"}]`;

  const message = await client.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 1600,
    messages:   [{ role: 'user', content: prompt }],
  });
  const raw  = message.content[0].text.trim();
  const json = raw.match(/\[[\s\S]*\]/);
  if (!json) throw new Error('Claude returnerade inte giltig JSON');
  const items = JSON.parse(json[0]);
  _commentary = { date: today, items };
  console.log(`[Commentary] genererade ${items.length} kommentarer för ${today}`);
  return _commentary;
}

async function getCommentary() {
  if (_commentary.date !== todayStr() || !_commentary.items.length) {
    try { await generateCommentary(); }
    catch (e) { console.warn('[Commentary] generering misslyckades:', e.message); }
  }
  return _commentary;
}

// ── GET /api/uci/commentary ────────────────────────────────
app.get('/api/uci/commentary', async (req, res) => {
  const c = await getCommentary();
  if (!c.items.length) return res.status(503).json({ error: 'kommentarer ej tillgängliga än' });
  res.json(c);
});

// Generera om automatiskt varje dag kl 06:00 (server-tid)
cron.schedule('0 6 * * *', () => { generateCommentary().catch(() => {}); });

// ── POST /api/uci/clientlog (TILLFÄLLIG klient-felloggning) ─
// Webbsidan skickar hit JS-fel så de syns i Railway-loggen vid felsökning.
app.post('/api/uci/clientlog', (req, res) => {
  try { console.log('[CLIENTLOG]', JSON.stringify(req.body)); } catch {}
  res.status(204).end();
});

// ── POST /api/uci/camera-analyze ──────────────────────────
//
// Flöde:
//   Runda 1 — appen skickar { image, mediaType }
//             AI identifierar objektet och returnerar antingen:
//             a) kontrollfrågor om den är osäker  → { status: 'questions', questions: [...] }
//             b) identifierat objekt om säker      → { status: 'ready', valuationData: {...} }
//
//   Runda 2 — appen skickar { image, mediaType, answers: [{question, answer}, ...] }
//             AI bekräftar med svaren och returnerar alltid { status: 'ready', valuationData: {...} }
//
// valuationData matchar fälten i buildPrompt: { description, category, condition }
//
app.post('/api/uci/camera-analyze', async (req, res) => {
  const { image, mediaType, answers } = req.body;

  if (!image) return res.status(400).json({ error: 'image (base64) krävs' });

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const imgType = validTypes.includes(mediaType) ? mediaType : 'image/jpeg';

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'din_claude_nyckel_här') {
    return res.status(503).json({ error: 'Anthropic API-nyckel saknas i .env' });
  }

  try {
    // Bygg meddelandelistan — vid runda 2 läggs svaren in i kontexten
    const userContent = [];

    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: imgType, data: image },
    });

    if (answers && answers.length > 0) {
      const answersText = answers
        .map(a => `Fråga: ${a.question}\nSvar: ${a.answer}`)
        .join('\n\n');
      userContent.push({
        type: 'text',
        text: `Jag har svarat på dina kontrollfrågor:\n\n${answersText}\n\nGe nu en slutgiltig identifiering. Svara ENBART med giltig JSON (inga kodblockar):\n{\n  "status": "ready",\n  "confidence": <80-100>,\n  "valuationData": {\n    "description": "<detaljerad beskrivning inkl. märke, modell, skick, ålder>",\n    "category": "<en av: Elektronik|Möbler|Fordon|Kläder & accessoarer|Konst & samlarvärde|Verktyg & maskiner|Sport & fritid|Vitvaror|Musik & instrument|Övrigt>",\n    "condition": <1-5>,\n    "condition_reasoning": "<varför detta skick-betyg>"\n  }\n}`,
      });
    } else {
      userContent.push({
        type: 'text',
        text: `Analysera bilden och identifiera objektet för värdering i AestimAi (UCI-systemet).

Om du är tillräckligt säker på vad objektet är (>80% säker), svara med status "ready".
Om du behöver mer information, ställ max 3 kortfattade kontrollfrågor och svara med status "questions".

Svara ENBART med giltig JSON i ett av dessa två format:

FORMAT A — osäker, behöver svar:
{
  "status": "questions",
  "identified_as": "<vad du tror det är, eller tom sträng>",
  "confidence": <0-79>,
  "questions": [
    "<konkret kontrollfråga 1>",
    "<konkret kontrollfråga 2>"
  ]
}

FORMAT B — säker, redo för värdering:
{
  "status": "ready",
  "confidence": <80-100>,
  "valuationData": {
    "description": "<detaljerad beskrivning av objektet inkl. märke, modell, skick, ålder om synligt>",
    "category": "<en av: Elektronik|Möbler|Fordon|Kläder & accessoarer|Konst & samlarvärde|Verktyg & maskiner|Sport & fritid|Vitvaror|Musik & instrument|Övrigt>",
    "condition": <1-5>,
    "condition_reasoning": "<varför detta skick-betyg>"
  }
}`,
      });
    }

    const msg = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 600,
      messages:   [{ role: 'user', content: userContent }],
    });

    const raw       = msg.content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI returnerade inte giltig JSON');

    const parsed = JSON.parse(jsonMatch[0]);

    // Validera att obligatoriska fält finns
    if (!parsed.status) throw new Error('Saknar status-fält i AI-svar');
    if (parsed.status === 'questions' && (!parsed.questions || parsed.questions.length === 0)) {
      throw new Error('status=questions men inga frågor returnerades');
    }
    if (parsed.status === 'ready' && !parsed.valuationData) {
      throw new Error('status=ready men valuationData saknas');
    }

    res.json(parsed);

  } catch (err) {
    console.error('[uci-server] camera-analyze-fel:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/uci/health ────────────────────────────────────
app.get('/api/uci/health', (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  res.json({
    status:         'ok',
    keyConfigured:  !!(key && key !== 'din_claude_nyckel_här'),
    activeSurveys:  surveys.size,
    endpoints: [
      'POST /api/uci/value',
      'POST /api/uci/vote',
      'GET  /api/uci/result/:id',
      'GET  /api/uci/history',
      'POST /api/uci/check',
      'POST /api/uci/camera-analyze',
    ],
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[AestimAi uci-server] http://0.0.0.0:${PORT}`);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'din_claude_nyckel_här') {
    console.warn('[uci-server] OBS: Ingen Anthropic API-nyckel konfigurerad i .env');
  }
});
