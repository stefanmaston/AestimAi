/**
 * AestimAi — NewsAPI proxy
 * Skyddar API-nyckeln från webbläsaren och aggregerar
 * nyheter från flera relevanta sökningar.
 */

require('dotenv').config();

const express  = require('express');
const fetch    = require('node-fetch');
const cors     = require('cors');

const app  = express();
const PORT = process.env.PORT || 3002;
const KEY  = process.env.NEWS_API_KEY;

app.use(cors({ origin: true }));

// ── In-memory cache — 60 min TTL ──────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minuter
const cache = new Map(); // key → { data, ts }

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}
function cacheSet(key, data) {
  cache.set(key, { data, ts: Date.now() });
}
app.use(express.json());

// ── Sökämnen per kategori ──────────────────────────────────
const QUERIES = {
  valuation:      '"circular economy" OR "asset valuation" OR "barter economy" OR "peer-to-peer exchange" OR "exchange economy"',
  energy:         '"combined heat and power" OR "solar cooperative" OR "energy as a service" OR "distributed energy" OR "microgrid"',
  coop:           '"cooperative economy" OR "platform cooperative" OR "decentralized identity" OR "self-sovereign identity"',
  market:         '"tokenized assets" OR "tokenized real estate" OR "bartering platform" OR "circular marketplace" OR "swap economy"',
  tech:           '"WebAuthn" OR "FIDO2" OR "passwordless authentication" OR "fintech cooperative" OR "decentralized finance cooperative"',
  sustainability: '"ESG" OR "net zero" OR "carbon neutral" OR "regenerative agriculture" OR "sustainability report" OR "circular economy transition"',
  resources:      '"food security" OR "water scarcity" OR "critical minerals" OR "rare earth" OR "agricultural commodities" OR "global food supply"',
  all:            '"circular economy" OR "barter economy" OR "tokenized assets" OR "cooperative economy" OR "distributed energy" OR "sustainability" OR "food security" OR "critical minerals"',
};

const BASE = 'https://newsapi.org/v2/everything';

// ── Hämta nyheter för en kategori (med cache) ─────────────
async function fetchCategory(cat) {
  if (!KEY || KEY === 'din_nyckel_här') return [];

  const cached = cacheGet(cat);
  if (cached) { console.log(`[news-proxy] cache HIT: ${cat}`); return cached; }

  const query = QUERIES[cat] || QUERIES.all;
  const url   = new URL(BASE);
  url.searchParams.set('q',        query);
  url.searchParams.set('language', 'en');
  url.searchParams.set('sortBy',   'publishedAt');
  url.searchParams.set('pageSize', '10');
  url.searchParams.set('apiKey',   KEY);

  try {
    const res  = await fetch(url.toString());
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'NewsAPI error');
    const articles = (data.articles || []).map(a => ({
      title:       a.title,
      description: a.description,
      url:         a.url,
      source:      a.source?.name,
      publishedAt: a.publishedAt,
      urlToImage:  a.urlToImage,
      author:      a.author,
      cat,
    }));
    console.log(`[news-proxy] cache MISS: ${cat} — ${articles.length} artiklar hämtade`);
    cacheSet(cat, articles);
    return articles;
  } catch (err) {
    console.error(`[news-proxy] ${cat}:`, err.message);
    return [];
  }
}

// ── Endpoint: GET /api/news?cat=all|valuation|energy|... ──
app.get('/api/news', async (req, res) => {
  if (!KEY || KEY === 'din_nyckel_här') {
    return res.status(503).json({ error: 'API-nyckel saknas — lägg till NEWS_API_KEY i .env' });
  }

  const cat = req.query.cat || 'all';

  try {
    let articles;
    if (cat === 'all') {
      // Hämta från alla kategorier parallellt och slå ihop
      const results = await Promise.all(
        Object.keys(QUERIES).filter(k => k !== 'all').map(fetchCategory)
      );
      const seen = new Set();
      articles = results
        .flat()
        .filter(a => {
          if (seen.has(a.url)) return false;
          seen.add(a.url);
          return true;
        })
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .slice(0, 20);
    } else {
      articles = await fetchCategory(cat);
    }
    res.json({ articles, total: articles.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Hälsokoll ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const cacheEntries = [...cache.entries()].map(([k, v]) => ({
    cat: k,
    ageMin: Math.round((Date.now() - v.ts) / 60000),
    expiresMin: Math.round((CACHE_TTL_MS - (Date.now() - v.ts)) / 60000),
  }));
  res.json({
    status: 'ok',
    keyConfigured: !!(KEY && KEY !== 'din_nyckel_här'),
    cache: cacheEntries,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[AestimAi news-proxy] http://0.0.0.0:${PORT}`);
  if (!KEY || KEY === 'din_nyckel_här') {
    console.warn('[news-proxy] OBS: Ingen API-nyckel konfigurerad i .env');
  }
});
