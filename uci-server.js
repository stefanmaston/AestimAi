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
const PORT   = process.env.API_PORT || 3003;
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

// ── Claude-värderingsprompt ────────────────────────────────
function buildPrompt(item) {
  const condLabels = { 1: 'Dåligt', 2: 'Slitet', 3: 'OK', 4: 'Bra', 5: 'Utmärkt' };
  const cond = condLabels[item.condition] || 'OK';

  return `Du är AestimAi — ett AI-system för objektiv värdering med UCI (Universal Commerce Index).
UCI är ett valutaoberoende bytesindex där 1 UCI ≈ 62 SEK ≈ 5.5 EUR ≈ 6 USD (juni 2026).

Värdera följande objekt och returnera ENBART giltig JSON utan markdown eller förklaringstext utanför JSON-strukturen.

OBJEKT ATT VÄRDERA:
- Beskrivning: ${item.description}
- Kategori: ${item.category}
- Skick: ${item.condition}/5 (${cond})
${item.location ? `- Plats: ${item.location}` : ''}

INSTRUKTIONER:
1. Analysera objektets verkliga bytevärde baserat på nyttighet, hållbarhet och marknadsnärvaro
2. Ta hänsyn till kategorispecifika faktorer (avskrivning, sällsynthet, efterfrågan)
3. Sätt UCI-värdet så att det speglar vad en rimlig motpart faktiskt skulle acceptera i byte
4. Konfidensintervallet ska vara realistiskt — brett för unika/sällsynta objekt, smalt för standardvaror
5. Jämförelseobjekten ska vara konkreta och verklighetstrogna

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
  "survey_question": "<en konkret fråga att ställa till respondenter, t.ex. 'Skulle du byta din X mot detta för Y UCI?'>"
}`;
}

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
    const message = await client.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{
        role:    'user',
        content: buildPrompt({ description, category, condition: parseInt(condition) || 3, location }),
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

// ── GET /api/uci/health ────────────────────────────────────
app.get('/api/uci/health', (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  res.json({
    status:         'ok',
    keyConfigured:  !!(key && key !== 'din_claude_nyckel_här'),
    activeSurveys:  surveys.size,
  });
});

app.listen(PORT, () => {
  console.log(`[AestimAi uci-server] http://localhost:${PORT}`);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'din_claude_nyckel_här') {
    console.warn('[uci-server] OBS: Ingen Anthropic API-nyckel konfigurerad i .env');
  }
});
