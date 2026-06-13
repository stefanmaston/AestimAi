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

const CATEGORY_VALUES =
  'Elektronik|Möbler|Fordon|Kläder & accessoarer|Konst & samlarvärde|Verktyg & maskiner|Sport & fritid|Vitvaror|Musik & instrument|Övrigt';

const SUPPORTED_LANGUAGES = ['sv', 'en', 'de', 'fr', 'it', 'es'];
const AI_LANGUAGE_NAMES = {
  sv: 'Swedish',
  en: 'English',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  es: 'Spanish',
};

function normalizeLanguage(lang) {
  return SUPPORTED_LANGUAGES.includes(lang) ? lang : 'sv';
}

function categoryFieldInstruction(language) {
  const list = CATEGORY_VALUES.replace(/\|/g, ', ');
  if (language === 'sv') {
    return `Fältet "category" måste vara exakt ett av: ${list}.`;
  }
  return `The "category" field must use one of these exact Swedish labels: ${list}.`;
}

function textLanguageInstruction(language) {
  if (language === 'sv') return 'Skriv alla textfält på svenska.';
  return `Write all user-facing text fields in ${AI_LANGUAGE_NAMES[language] || 'English'}.`;
}

function answerLabels(language) {
  if (language === 'sv') return { q: 'Fråga', a: 'Svar' };
  return { q: 'Question', a: 'Answer' };
}

function buildCameraAnalyzeRound2Text(answersText, language) {
  if (language === 'sv') {
    return `Jag har svarat på dina kontrollfrågor:\n\n${answersText}\n\nGe nu en slutgiltig identifiering. Svara ENBART med giltig JSON (inga kodblockar):\n{\n  "status": "ready",\n  "confidence": <80-100>,\n  "valuationData": {\n    "description": "<detaljerad beskrivning inkl. märke, modell, skick, ålder>",\n    "category": "<en av: ${CATEGORY_VALUES}>",\n    "condition": <1-5>,\n    "condition_reasoning": "<varför detta skick-betyg>"\n  }\n}`;
  }
  return `I have answered your follow-up questions:\n\n${answersText}\n\nProvide a final identification. Reply ONLY with valid JSON (no code fences):\n{\n  "status": "ready",\n  "confidence": <80-100>,\n  "valuationData": {\n    "description": "<detailed description incl. brand, model, condition, age>",\n    "category": "<one of: ${CATEGORY_VALUES}>",\n    "condition": <1-5>,\n    "condition_reasoning": "<why this condition score>"\n  }\n}\n\n${textLanguageInstruction(language)}\n${categoryFieldInstruction(language)}`;
}

function buildCameraAnalyzeRound1Text(language) {
  if (language === 'sv') {
    return `Analysera bilden och identifiera objektet för värdering i AestimAi (UCI-systemet).

Om du är tillräckligt säker på vad objektet är (>80% säker), svara med status "ready".
Om du behöver mer information, ställ max 3 kortfattade kontrollfrågor och svara med status "questions".

${textLanguageInstruction(language)}
${categoryFieldInstruction(language)}

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
    "category": "<en av: ${CATEGORY_VALUES}>",
    "condition": <1-5>,
    "condition_reasoning": "<varför detta skick-betyg>"
  }
}`;
  }

  return `Analyze the image and identify the object for valuation in AestimAi (UCI system).

If you are confident enough (>80%), reply with status "ready".
If you need more information, ask up to 3 short follow-up questions and reply with status "questions".

${textLanguageInstruction(language)}
${categoryFieldInstruction(language)}

Reply ONLY with valid JSON in one of these formats:

FORMAT A — uncertain, need answers:
{
  "status": "questions",
  "identified_as": "<what you think it is, or empty string>",
  "confidence": <0-79>,
  "questions": [
    "<concrete follow-up question 1>",
    "<concrete follow-up question 2>"
  ]
}

FORMAT B — confident, ready for valuation:
{
  "status": "ready",
  "confidence": <80-100>,
  "valuationData": {
    "description": "<detailed description incl. brand, model, condition, age if visible>",
    "category": "<one of: ${CATEGORY_VALUES}>",
    "condition": <1-5>,
    "condition_reasoning": "<why this condition score>"
  }
}`;
}

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
function buildPrompt(item, anchor, language = 'sv') {
  const lang = normalizeLanguage(language);
  const condLabels = lang === 'sv'
    ? { 1: 'Dåligt', 2: 'Slitet', 3: 'OK', 4: 'Bra', 5: 'Utmärkt' }
    : { 1: 'Poor', 2: 'Worn', 3: 'OK', 4: 'Good', 5: 'Excellent' };
  const cond = condLabels[item.condition] || 'OK';

  if (lang !== 'sv') {
    return `${textLanguageInstruction(lang)}

You are AestimAi — an AI system for objective valuation using UCI (Universal Coin Index).
UCI is a currency-neutral barter index where 1 UCI ≈ 62 SEK ≈ 5.5 EUR ≈ 6 USD (June 2026).

Value the following item and return ONLY valid JSON with no markdown or text outside the JSON structure.

ITEM TO VALUE:
- Description: ${item.description}
- Category: ${item.category}
- Condition: ${item.condition}/5 (${cond})
${item.location ? `- Location: ${item.location}` : ''}

${anchor ? `MARKET PRICE ANCHOR (pre-check):
Type: ${anchor.category_label} (${anchor.object_type})
Typical market price: ${anchor.typical_price_low_sek.toLocaleString('en-US')}–${anchor.typical_price_high_sek.toLocaleString('en-US')} SEK
Price basis: ${anchor.price_basis}
Detected quantity: ${anchor.quantity_detected}
→ UCI value MUST be within ±40% of this range unless strong reasons exist.

` : ''}CRITICAL — QUANTITY AND UNIT:
- Read the description carefully and identify any quantity (count, area, weight, time, volume, etc.)
- UCI value and prices must always reflect the TOTAL amount described
- If no quantity is given, assume 1 unit
- Always state in reasoning which total quantity you valued

Return exactly this JSON format:
{
  "uci_value": <integer>,
  "uci_low": <integer>,
  "uci_high": <integer>,
  "confidence_pct": <0-100>,
  "sek_approx": <integer>,
  "eur_approx": <integer>,
  "usd_approx": <integer>,
  "reasoning": "<2-3 sentences on what drives the value>",
  "key_factors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "comparables": [
    {"name": "<comparable>", "uci": <integer>},
    {"name": "<comparable>", "uci": <integer>},
    {"name": "<comparable>", "uci": <integer>}
  ],
  "depreciation_note": "<brief note on depreciation/appreciation if relevant>",
  "survey_question": "<one concrete survey question>",
  "market_context": {
    "category_label": "<what the item is>",
    "typical_price_low_sek": <integer>,
    "typical_price_high_sek": <integer>,
    "price_basis": "<how the price was determined>"
  }
}`;
  }

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
  const { description, category, condition, location, language } = req.body;
  const lang = normalizeLanguage(language);

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
        content: buildPrompt({ description, category, condition: parseInt(condition) || 3, location }, anchor, lang),
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

// Synka FX-data dagligen kl 18 (efter att europeiska marknader stängt)
cron.schedule('0 18 * * *', () => {
  console.log('[fx-cron] Daglig FX-sync');
  ensureFxSync().catch(e => console.warn('[fx-cron] fel:', e.message));
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
  const { image, mediaType, answers, language } = req.body;
  const lang = normalizeLanguage(language);

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
      const { q: qLabel, a: aLabel } = answerLabels(lang);
      const answersText = answers
        .map(a => `${qLabel}: ${a.question}\n${aLabel}: ${a.answer}`)
        .join('\n\n');
      userContent.push({
        type: 'text',
        text: buildCameraAnalyzeRound2Text(answersText, lang),
      });
    } else {
      userContent.push({
        type: 'text',
        text: buildCameraAnalyzeRound1Text(lang),
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

// ── Valutahistorik: ECB-data lagrad i Supabase ─────────────
// Strategi: hämta saknade datum från frankfurter.app och spara i DB.
// Servera alltid från DB → konsistent historik som aldrig ändras bakåt.

const FX_SERIES = [
  { id: 'sek', label: 'SEK', color: '#4ade80', col: null,  key: null  }, // SEK = UCI-bas, alltid 100
  { id: 'eur', label: 'EUR', color: '#60a5fa', col: 'eur', key: 'EUR' },
  { id: 'usd', label: 'USD', color: '#f472b6', col: 'usd', key: 'USD' },
  { id: 'gbp', label: 'GBP', color: '#fb923c', col: 'gbp', key: 'GBP' },
  { id: 'nok', label: 'NOK', color: '#a78bfa', col: 'nok', key: 'NOK' },
  { id: 'dkk', label: 'DKK', color: '#34d399', col: 'dkk', key: 'DKK' },
  { id: 'chf', label: 'CHF', color: '#fbbf24', col: 'chf', key: 'CHF' },
  { id: 'jpy', label: 'JPY', color: '#f87171', col: 'jpy', key: 'JPY' },
];

// In-memory cache: räckvidd → { labels, series, ts }
const fxServeCache = new Map();

function rangeToStartDate(range) {
  const t = new Date(); t.setHours(0,0,0,0);
  if (range === '30d') { const s = new Date(t); s.setDate(t.getDate()-29);         return s.toISOString().split('T')[0]; }
  if (range === '90d') { const s = new Date(t); s.setDate(t.getDate()-89);         return s.toISOString().split('T')[0]; }
  if (range === 'YTD') { return `${t.getFullYear()}-01-01`; }
  if (range === '2Y')  { const s = new Date(t); s.setFullYear(t.getFullYear()-2);  return s.toISOString().split('T')[0]; }
  if (range === '5Y')  { const s = new Date(t); s.setFullYear(t.getFullYear()-5);  return s.toISOString().split('T')[0]; }
  /* 1Y */               const s = new Date(t); s.setFullYear(t.getFullYear()-1);  return s.toISOString().split('T')[0];
}

// Hämta rådata från frankfurter.app och spara i Supabase
async function syncFxFromApi(fromDate, toDate) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase ej konfigurerad');
  const keys = FX_SERIES.map(s => s.key).join(',');
  const url  = `https://api.frankfurter.app/${fromDate}..${toDate}?from=SEK&to=${keys}`;
  console.log(`[fx-sync] hämtar ${url}`);

  const r    = await fetch(url);
  if (!r.ok)  throw new Error(`Frankfurter ${r.status}`);
  const json = await r.json();
  const dates = Object.keys(json.rates).sort();
  if (!dates.length) return 0;

  // Bygg rader: SEK per valutaenhet = 1 / (valutaenhet per SEK)
  const rows = dates.map(d => {
    const row = { date: d };
    for (const s of FX_SERIES) {
      if (!s.col) continue; // SEK har ingen DB-kolumn
      const rateVal = json.rates[d][s.key];
      row[s.col] = rateVal ? Math.round((1 / rateVal) * 1e6) / 1e6 : null;
    }
    return row;
  });

  // Upsert till Supabase (ignorera om raden redan finns)
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/uci_fx_rates`,
    {
      method:  'POST',
      headers: {
        apikey:        SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=ignore-duplicates',
      },
      body: JSON.stringify(rows),
    }
  );
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`Supabase upsert: ${resp.status} ${msg}`);
  }
  console.log(`[fx-sync] sparade ${rows.length} rader (${fromDate} → ${toDate})`);
  return rows.length;
}

// Synka saknade datum: kontrollera senaste datum i DB, hämta resten
async function ensureFxSync() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    // Senaste datum i DB
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/uci_fx_rates?select=date&order=date.desc&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await r.json();
    const today   = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toISOString().split('T')[0];

    let fromDate;
    if (!Array.isArray(rows) || rows.length === 0) {
      // Ingen data alls — hämta 5 år bakåt
      const s = new Date(today); s.setFullYear(today.getFullYear() - 5);
      fromDate = s.toISOString().split('T')[0];
      console.log('[fx-sync] Ingen data i DB — hämtar 5 år');
    } else {
      const latest = new Date(rows[0].date);
      latest.setDate(latest.getDate() + 1); // dagen efter senaste
      fromDate = latest.toISOString().split('T')[0];
      if (fromDate >= todayStr) {
        console.log('[fx-sync] DB är aktuell, ingen sync behövs');
        return;
      }
      console.log(`[fx-sync] Fyller på från ${fromDate} → ${todayStr}`);
    }
    await syncFxFromApi(fromDate, todayStr);
    fxServeCache.clear(); // ogiltigförklara serve-cache
  } catch (e) {
    console.warn('[fx-sync] fel:', e.message);
  }
}

// Läs från Supabase och indexera till 100 vid periodens start
async function fetchFxHistory(range) {
  const cacheKey = `fx_${range}`;
  const hit = fxServeCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < 60 * 60 * 1000) return hit.data;

  const today     = new Date(); today.setHours(0,0,0,0);
  const startDate = rangeToStartDate(range);
  const endDate   = today.toISOString().split('T')[0];
  const cols      = FX_SERIES.map(s => s.col).join(',');

  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase ej konfigurerad');

  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/uci_fx_rates?select=date,${cols}&date=gte.${startDate}&date=lte.${endDate}&order=date.asc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!r.ok) throw new Error(`Supabase read: ${r.status}`);
  const rows = await r.json();
  if (!rows.length) throw new Error('Ingen FX-data i DB för valt intervall');

  const labels = rows.map(row => row.date);

  // Basvärdena (första raden) för indexering till 100
  const base = {};
  for (const s of FX_SERIES) base[s.col] = rows[0][s.col];

  const series = FX_SERIES.map(s => ({
    id:    s.id,
    label: s.label,
    color: s.color,
    data:  s.col === null
      ? rows.map(() => 100)   // SEK = UCI-bas, alltid 100
      : rows.map(row => {
          const v = row[s.col];
          return (v && base[s.col]) ? Math.round(v / base[s.col] * 10000) / 100 : null;
        }),
  }));

  const data = { labels, series, categoryLabel: 'Valutor', source: 'ECB via frankfurter.app' };
  fxServeCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

// ── Asset-kategorier för multi-serie diagram ───────────────
// Alla serier indexeras till 100 vid periodens start.
// trend = daglig drift (positiv = stigande vs UCI), vol = daglig volatilitet.
const ASSET_CATEGORIES = {
  currencies: {
    label: 'Valutor',
    series: [
      { id: 'eur', label: 'EUR', color: '#60a5fa', trend:  0.0001, vol: 0.0040 },
      { id: 'usd', label: 'USD', color: '#f472b6', trend:  0.0003, vol: 0.0055 },
      { id: 'gbp', label: 'GBP', color: '#fb923c', trend: -0.0002, vol: 0.0060 },
      { id: 'nok', label: 'NOK', color: '#a78bfa', trend:  0.0002, vol: 0.0045 },
      { id: 'dkk', label: 'DKK', color: '#34d399', trend:  0.0001, vol: 0.0030 },
      { id: 'chf', label: 'CHF', color: '#fbbf24', trend: -0.0003, vol: 0.0035 },
      { id: 'jpy', label: 'JPY', color: '#f87171', trend:  0.0004, vol: 0.0070 },
    ],
  },
  commodities: {
    label: 'Råvaror',
    series: [
      { id: 'gold',   label: 'Guld (XAU)',   color: '#fbbf24', trend:  0.0008, vol: 0.0100 },
      { id: 'silver', label: 'Silver (XAG)', color: '#94a3b8', trend:  0.0004, vol: 0.0180 },
      { id: 'oil',    label: 'Olja (Brent)', color: '#fb923c', trend: -0.0005, vol: 0.0220 },
      { id: 'copper', label: 'Koppar',       color: '#f97316', trend:  0.0006, vol: 0.0130 },
      { id: 'wheat',  label: 'Vete',         color: '#eab308', trend:  0.0010, vol: 0.0160 },
      { id: 'coffee', label: 'Kaffe',        color: '#92400e', trend:  0.0014, vol: 0.0200 },
    ],
  },
  energy: {
    label: 'Energi',
    series: [
      { id: 'electricity', label: 'El (nät SE)',  color: '#60a5fa', trend:  0.0005, vol: 0.0150 },
      { id: 'solar',       label: 'Sol (LCoE)',   color: '#fbbf24', trend: -0.0010, vol: 0.0060 },
      { id: 'wind',        label: 'Vind (LCoE)',  color: '#34d399', trend: -0.0005, vol: 0.0050 },
      { id: 'nuclear',     label: 'Kärnkraft',   color: '#a78bfa', trend:  0.0002, vol: 0.0025 },
      { id: 'natgas',      label: 'Naturgas',    color: '#fb923c', trend: -0.0003, vol: 0.0250 },
      { id: 'hydrogen',    label: 'Väte (grön)', color: '#4ade80', trend: -0.0015, vol: 0.0100 },
    ],
  },
  services: {
    label: 'Tjänster',
    series: [
      { id: 'plumber',     label: 'Rörmokare/h',        color: '#60a5fa', trend: 0.0008, vol: 0.0035 },
      { id: 'electrician', label: 'Elektriker/h',        color: '#fbbf24', trend: 0.0007, vol: 0.0035 },
      { id: 'developer',   label: 'Mjukvaruutvecklare/h',color: '#4ade80', trend: 0.0012, vol: 0.0060 },
      { id: 'teacher',     label: 'Lärare/h',            color: '#a78bfa', trend: 0.0005, vol: 0.0025 },
      { id: 'doctor',      label: 'Läkare/h',            color: '#f472b6', trend: 0.0006, vol: 0.0025 },
      { id: 'truck',       label: 'Lastbilschaufför/h',  color: '#fb923c', trend: 0.0008, vol: 0.0045 },
    ],
  },
  realestate: {
    label: 'Fastigheter',
    series: [
      { id: 'land_rural', label: 'Mark (landsbygd)',  color: '#86efac', trend: 0.0003, vol: 0.0045 },
      { id: 'land_urban', label: 'Mark (urban)',      color: '#4ade80', trend: 0.0014, vol: 0.0075 },
      { id: 'house',      label: 'Småhus',            color: '#60a5fa', trend: 0.0010, vol: 0.0065 },
      { id: 'apt_city',   label: 'Bostadsrätt (stad)',color: '#f472b6', trend: 0.0013, vol: 0.0085 },
      { id: 'apt_suburb', label: 'Bostadsrätt (förort)',color: '#a78bfa',trend: 0.0008, vol: 0.0070 },
    ],
  },
  financial: {
    label: 'Finansiella',
    series: [
      { id: 'global_idx', label: 'Global indexfond',    color: '#4ade80', trend: 0.0010, vol: 0.0120 },
      { id: 'se_stocks',  label: 'SE aktieindex',       color: '#60a5fa', trend: 0.0008, vol: 0.0140 },
      { id: 'gov_bond',   label: 'Statsobligation',     color: '#94a3b8', trend: 0.0002, vol: 0.0025 },
      { id: 'corp_bond',  label: 'Företagsobligation',  color: '#a78bfa', trend: 0.0005, vol: 0.0050 },
      { id: 'warrants',   label: 'Warranter',           color: '#fb923c', trend: 0.0015, vol: 0.0350 },
      { id: 'crypto_idx', label: 'Kryptoindex',         color: '#fbbf24', trend: 0.0014, vol: 0.0450 },
    ],
  },
  esg: {
    label: 'Miljö / ESG',
    series: [
      { id: 'co2',      label: 'CO₂-kredit (EUA)',      color: '#4ade80', trend: 0.0011, vol: 0.0180 },
      { id: 'biodiv',   label: 'Biodiversitetsenhet',   color: '#86efac', trend: 0.0005, vol: 0.0080 },
      { id: 'water',    label: 'Vattenrätt',            color: '#60a5fa', trend: 0.0008, vol: 0.0100 },
      { id: 'recycled', label: 'Återvunnet material',   color: '#a78bfa', trend: 0.0003, vol: 0.0110 },
      { id: 'greenbond',label: 'Grön obligation',       color: '#34d399', trend: 0.0005, vol: 0.0035 },
    ],
  },
};

function generateAssetHistory(cat, startDateStr, numDays) {
  const category = ASSET_CATEGORIES[cat];
  if (!category) return null;

  const start = new Date(startDateStr);
  const labels = [];
  for (let i = 0; i < numDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    labels.push(d.toISOString().split('T')[0]);
  }

  const series = category.series.map(s => {
    // Unikt seed per serie + startdatum → repeterbar men distinkt kurva
    const seedNum = s.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
                  + parseInt(startDateStr.replace(/-/g, ''), 10) % 100000;
    const rng = seededRng(seedNum);

    let val = 100;
    const data = [100];
    for (let i = 1; i < numDays; i++) {
      val = val * (1 + s.trend + (rng() - 0.5) * s.vol);
      data.push(Math.round(val * 100) / 100);
    }
    return { id: s.id, label: s.label, color: s.color, data };
  });

  return { labels, series, categoryLabel: category.label };
}

// ── GET /api/uci/assets?cat=currencies&range=1Y ────────────
app.get('/api/uci/assets', async (req, res) => {
  const cat   = req.query.cat   || 'currencies';
  const range = req.query.range || '1Y';

  // Valutor: riktig ECB-data via frankfurter.app, fallback till simulerad
  if (cat === 'currencies') {
    try {
      const data = await fetchFxHistory(range);
      return res.json(data);
    } catch (e) {
      console.warn('[assets] FX-fel, faller tillbaka på simulerad data:', e.message);
      // fortsätter till simulerad nedan
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate, numDays;
  if (range === '30d') {
    numDays = 30;
    const s = new Date(today); s.setDate(today.getDate() - 29);
    startDate = s.toISOString().split('T')[0];
  } else if (range === '90d') {
    numDays = 90;
    const s = new Date(today); s.setDate(today.getDate() - 89);
    startDate = s.toISOString().split('T')[0];
  } else if (range === 'YTD') {
    const s = new Date(today.getFullYear() + '-01-01');
    numDays   = Math.max(1, Math.floor((today - s) / 86400000) + 1);
    startDate = s.toISOString().split('T')[0];
  } else if (range === '2Y') {
    numDays = 730;
    const s = new Date(today); s.setFullYear(today.getFullYear() - 2);
    startDate = s.toISOString().split('T')[0];
  } else if (range === '5Y') {
    numDays = 1825;
    const s = new Date(today); s.setFullYear(today.getFullYear() - 5);
    startDate = s.toISOString().split('T')[0];
  } else {
    // 1Y default
    numDays = 365;
    const s = new Date(today); s.setFullYear(today.getFullYear() - 1);
    startDate = s.toISOString().split('T')[0];
  }

  const data = generateAssetHistory(cat, startDate, numDays);
  if (!data) return res.status(400).json({ error: 'Okänd kategori: ' + cat });
  res.json(data);
});

// ── GET /api/news — NewsAPI-cache (samma nycklar som Railway .env) ──
app.get('/api/news', async (req, res) => {
  const { getNewsArticles, CACHE_TTL_MS } = require('./news-service');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cat = (req.query.cat || 'all').toString();
  try {
    const { articles, cachedAt, fromCache, source } = await getNewsArticles(cat);
    const maxAge = Math.max(0, Math.floor((CACHE_TTL_MS - (Date.now() - cachedAt)) / 1000));
    res.setHeader('Cache-Control', `public, max-age=${maxAge || 7200}, stale-while-revalidate=86400`);
    res.setHeader('X-News-Cache', fromCache ? 'HIT' : 'MISS');
    if (source) res.setHeader('X-News-Source', source);
    return res.json({
      articles,
      total: articles.length,
      cachedAt: new Date(cachedAt).toISOString(),
      fromCache,
      source,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
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
      'GET  /api/news',
    ],
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[AestimAi uci-server] http://0.0.0.0:${PORT}`);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'din_claude_nyckel_här') {
    console.warn('[uci-server] OBS: Ingen Anthropic API-nyckel konfigurerad i .env');
  }
  // Synka FX-historik vid uppstart (hämtar saknade datum)
  ensureFxSync().catch(e => console.warn('[startup-fx] fel:', e.message));
});
