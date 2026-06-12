/**
 * Delad nyhetstjänst — cache 1 gång/timme per kategori.
 * Används av Vercel /api/news och Railway news-proxy.
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 timme
const KEY = process.env.NEWS_API_KEY;
const BASE = 'https://newsapi.org/v2/everything';

const httpFetch = (...args) => {
  if (typeof fetch === 'function') return fetch(...args);
  return require('node-fetch')(...args);
};

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

const cache = new Map();   // key → { data, ts }
const inflight = new Map(); // key → Promise

function isKeyConfigured() {
  return !!(KEY && KEY !== 'din_nyckel_här');
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function cacheSet(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

function mergeArticles(lists) {
  const seen = new Set();
  return lists
    .flat()
    .filter(a => {
      if (!a?.url || seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function fetchFromNewsApi(cat) {
  if (!isKeyConfigured()) return [];

  const query = QUERIES[cat] || QUERIES.all;
  const url = new URL(BASE);
  url.searchParams.set('q', query);
  url.searchParams.set('language', 'en');
  url.searchParams.set('sortBy', 'publishedAt');
  url.searchParams.set('pageSize', '10');
  url.searchParams.set('apiKey', KEY);

  const res = await httpFetch(url.toString());
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'NewsAPI error');

  return (data.articles || []).map(a => ({
    title:       a.title,
    description: a.description,
    url:         a.url,
    source:      a.source?.name,
    publishedAt: a.publishedAt,
    urlToImage:  a.urlToImage,
    author:      a.author,
    cat,
  }));
}

async function fetchCategory(cat) {
  const hit = cacheGet(cat);
  if (hit) {
    console.log(`[news] cache HIT: ${cat}`);
    return { articles: hit.data, cachedAt: hit.ts, fromCache: true };
  }

  if (inflight.has(cat)) return inflight.get(cat);

  const job = (async () => {
    console.log(`[news] cache MISS: ${cat} — hämtar från NewsAPI`);
    const articles = await fetchFromNewsApi(cat);
    cacheSet(cat, articles);
    const entry = cache.get(cat);
    return { articles, cachedAt: entry.ts, fromCache: false };
  })();

  inflight.set(cat, job);
  try {
    return await job;
  } finally {
    inflight.delete(cat);
  }
}

async function fetchAll() {
  const hit = cacheGet('all');
  if (hit) {
    console.log('[news] cache HIT: all');
    return { articles: hit.data, cachedAt: hit.ts, fromCache: true };
  }

  if (inflight.has('all')) return inflight.get('all');

  const job = (async () => {
    const cats = Object.keys(QUERIES).filter(k => k !== 'all');
    const parts = await Promise.all(cats.map(c => fetchCategory(c)));
    const articles = mergeArticles(parts.map(p => p.articles)).slice(0, 20);
    cacheSet('all', articles);
    const entry = cache.get('all');
    console.log(`[news] cache MISS: all — ${articles.length} artiklar aggregerade`);
    return { articles, cachedAt: entry.ts, fromCache: false };
  })();

  inflight.set('all', job);
  try {
    return await job;
  } finally {
    inflight.delete('all');
  }
}

async function getNewsArticles(cat = 'all') {
  if (!isKeyConfigured()) {
    const err = new Error('API-nyckel saknas — lägg till NEWS_API_KEY');
    err.status = 503;
    throw err;
  }

  if (cat === 'all') return fetchAll();
  if (!QUERIES[cat]) {
    const err = new Error(`Okänd kategori: ${cat}`);
    err.status = 400;
    throw err;
  }
  return fetchCategory(cat);
}

function getCacheStats() {
  return [...cache.entries()].map(([k, v]) => ({
    cat: k,
    ageMin: Math.round((Date.now() - v.ts) / 60000),
    expiresMin: Math.round((CACHE_TTL_MS - (Date.now() - v.ts)) / 60000),
  }));
}

module.exports = {
  CACHE_TTL_MS,
  QUERIES,
  getNewsArticles,
  getCacheStats,
  isKeyConfigured,
};
