/**
 * Delad nyhetstjänst — cache i Supabase + minne, max 1 NewsAPI-uppdatering / 2h / kategori.
 * Används av Vercel /api/news och Railway news-proxy.
 */

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 timmar
const BASE = 'https://newsapi.org/v2/everything';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const httpFetch = (...args) => {
  if (typeof fetch === 'function') return fetch(...args);
  return require('node-fetch')(...args);
};

function supabaseHeaders(extra = {}) {
  return {
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
    ...extra,
  };
}

const QUERIES = {
  valuation:      '"circular economy" OR "asset valuation" OR "barter economy" OR "peer-to-peer exchange" OR "exchange economy" OR valuation OR barter',
  energy:         '"combined heat and power" OR "solar cooperative" OR "energy as a service" OR "distributed energy" OR microgrid OR "renewable energy"',
  coop:           '"cooperative economy" OR "platform cooperative" OR "decentralized identity" OR "self-sovereign identity" OR cooperative OR co-op',
  market:         '"tokenized assets" OR "tokenized real estate" OR "bartering platform" OR "circular marketplace" OR "swap economy" OR marketplace OR tokenization',
  tech:           '"WebAuthn" OR FIDO2 OR "passwordless authentication" OR "fintech cooperative" OR "decentralized finance" OR fintech OR blockchain',
  sustainability: 'ESG OR "net zero" OR "carbon neutral" OR "regenerative agriculture" OR "sustainability report" OR "circular economy transition" OR decarbonization',
  resources:      '"food security" OR "water scarcity" OR "critical minerals" OR "rare earth" OR "agricultural commodities" OR "global food supply" OR commodity',
  all:            '"circular economy" OR "barter economy" OR "tokenized assets" OR "cooperative economy" OR "distributed energy" OR sustainability OR "food security" OR "critical minerals"',
};

const CATEGORY_IDS = ['valuation', 'energy', 'coop', 'market', 'tech', 'sustainability', 'resources'];

/** Nyckelord för poängsatt efterfiltrering (NewsAPI-träffar är ofta för breda). */
const CATEGORY_TERMS = {
  valuation: [
    'circular economy', 'asset valuation', 'barter', 'peer-to-peer', 'exchange economy',
    'valuation', 'appraisal', 'resale', 'trade-in', 'secondhand', 'swap economy', 'circular marketplace',
  ],
  energy: [
    'combined heat and power', 'solar cooperative', 'energy as a service', 'distributed energy',
    'microgrid', 'renewable energy', 'clean energy', 'solar power', 'wind farm', 'grid storage',
    'heat pump', 'decarbonization', 'power plant', 'electricity',
  ],
  coop: [
    'cooperative economy', 'platform cooperative', 'decentralized identity', 'self-sovereign identity',
    'cooperative', 'co-op', 'mutual aid', 'member-owned', 'worker cooperative',
  ],
  market: [
    'tokenized assets', 'tokenized real estate', 'bartering platform', 'circular marketplace',
    'swap economy', 'marketplace', 'tokenization', 'digital assets', 'real estate token',
    'peer marketplace', 'listing platform',
  ],
  tech: [
    'webauthn', 'fido2', 'passwordless', 'fintech cooperative', 'decentralized finance',
    'fintech', 'blockchain', 'digital identity', 'open banking', 'payment platform',
  ],
  sustainability: [
    'esg', 'net zero', 'carbon neutral', 'regenerative agriculture', 'sustainability report',
    'circular economy transition', 'decarbonization', 'climate', 'carbon footprint', 'green finance',
  ],
  resources: [
    'food security', 'water scarcity', 'critical minerals', 'rare earth', 'agricultural commodities',
    'global food supply', 'commodity', 'mining', 'lithium', 'copper', 'grain', 'water supply',
  ],
};

/** Uppenbara falska träffar per kategori (titel + ingress). */
const CATEGORY_EXCLUDE = {
  valuation:  ['disneyland', 'theme park', 'celebrity', 'reality tv', 'sports betting', 'nfl ', 'nba '],
  energy:     ['disneyland', 'theme park', 'celebrity', 'reality tv', 'sports betting', 'movie', 'concert'],
  coop:       ['disneyland', 'theme park', 'celebrity gossip', 'reality tv'],
  market:     ['disneyland', 'theme park', 'celebrity', 'sports score'],
  tech:       ['disneyland', 'theme park', 'celebrity wedding'],
  sustainability: ['disneyland', 'theme park', 'celebrity'],
  resources:  ['disneyland', 'theme park', 'celebrity', 'box office'],
};

const FETCH_PAGE_SIZE = 40;
const RESULT_LIMIT = 10;

const cache = new Map();   // key → { data, ts }
const inflight = new Map(); // key → Promise

function newsApiKey() {
  return process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY || '';
}

function isKeyConfigured() {
  const k = newsApiKey();
  return !!(k && k !== 'din_nyckel_här');
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

function cacheSet(key, data, ts = Date.now()) {
  cache.set(key, { data, ts });
}

async function dbGetCache(cat) {
  if (!SUPABASE_URL || !SERVICE_ROLE) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/aestimai_news_cache?category=eq.${encodeURIComponent(cat)}&select=articles,fetched_at`;
    const res = await httpFetch(url, { headers: supabaseHeaders() });
    if (!res.ok) {
      console.warn('[news] db read HTTP', res.status);
      return null;
    }
    const rows = await res.json();
    const data = Array.isArray(rows) ? rows[0] : null;
    if (!data) return null;
    const ts = new Date(data.fetched_at).getTime();
    if (Number.isNaN(ts)) return null;
    const articles = Array.isArray(data.articles) ? refineCachedArticles(data.articles, cat) : [];
    return {
      articles,
      ts,
      fresh: Date.now() - ts <= CACHE_TTL_MS,
    };
  } catch (e) {
    console.warn('[news] db read error:', e?.message || e);
    return null;
  }
}

async function dbSetCache(cat, articles) {
  if (!SUPABASE_URL || !SERVICE_ROLE) return;
  try {
    const res = await httpFetch(`${SUPABASE_URL}/rest/v1/aestimai_news_cache`, {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify({
        category: cat,
        articles,
        fetched_at: new Date().toISOString(),
        source: 'newsapi',
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[news] db write HTTP', res.status, body.slice(0, 120));
    }
  } catch (e) {
    console.warn('[news] db write error:', e?.message || e);
  }
}

function packResult(articles, cachedAt, fromCache, source) {
  return { articles, cachedAt, fromCache, source };
}

function articleText(a) {
  return `${a.title || ''} ${a.description || ''}`.toLowerCase();
}

function scoreArticleForCategory(a, cat) {
  const text = articleText(a);
  const title = (a.title || '').toLowerCase();
  const excludes = CATEGORY_EXCLUDE[cat] || [];
  if (excludes.some((ex) => text.includes(ex))) return -1;

  let score = 0;
  for (const term of CATEGORY_TERMS[cat] || []) {
    const t = term.toLowerCase();
    if (title.includes(t)) score += 3;
    else if (text.includes(t)) score += 1;
  }
  return score;
}

function normalizeArticle(a, cat) {
  return {
    title:       a.title,
    description: a.description,
    url:         a.url,
    source:      a.source?.name ?? a.source,
    publishedAt: a.publishedAt,
    urlToImage:  a.urlToImage,
    author:      a.author,
    cat,
  };
}

function filterForCategory(rawArticles, cat, minScore = 1) {
  return rawArticles
    .map((a) => ({ article: normalizeArticle(a, cat), score: scoreArticleForCategory(a, cat) }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.article.publishedAt || 0) - new Date(a.article.publishedAt || 0);
    })
    .slice(0, RESULT_LIMIT)
    .map(({ article }) => article);
}

function classifyArticle(a) {
  let bestCat = null;
  let bestScore = 0;
  for (const cat of CATEGORY_IDS) {
    const score = scoreArticleForCategory(a, cat);
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }
  if (!bestCat || bestScore < 1) return null;
  return normalizeArticle(a, bestCat);
}

function refineCachedArticles(articles, cat) {
  if (!articles?.length) return [];
  if (cat === 'all') {
    if (articles.some((a) => a.cat && a.cat !== 'all')) {
      return mergeArticles(articles).slice(0, RESULT_LIMIT);
    }
    return mergeArticles(
      articles.map(classifyArticle).filter(Boolean),
    ).slice(0, RESULT_LIMIT);
  }
  return articles.filter((a) => scoreArticleForCategory(a, cat) >= 1).slice(0, RESULT_LIMIT);
}

function mergeArticles(articles) {
  const byUrl = new Map();
  for (const a of articles) {
    if (!a?.url) continue;
    const prev = byUrl.get(a.url);
    if (!prev || scoreArticleForCategory(a, a.cat) > scoreArticleForCategory(prev, prev.cat)) {
      byUrl.set(a.url, a);
    }
  }
  return [...byUrl.values()].sort(
    (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
  );
}

async function fetchRawFromNewsApi(query) {
  if (!isKeyConfigured()) return [];

  const url = new URL(BASE);
  url.searchParams.set('q', query);
  url.searchParams.set('language', 'en');
  url.searchParams.set('sortBy', 'publishedAt');
  url.searchParams.set('searchIn', 'title,description');
  url.searchParams.set('pageSize', String(FETCH_PAGE_SIZE));
  url.searchParams.set('apiKey', newsApiKey());

  const res = await httpFetch(url.toString());
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'NewsAPI error');
  return data.articles || [];
}

async function fetchFromNewsApi(cat) {
  const query = QUERIES[cat] || QUERIES.all;
  const raw = await fetchRawFromNewsApi(query);

  if (cat === 'all') {
    const classified = raw.map(classifyArticle).filter(Boolean);
    return mergeArticles(classified).slice(0, RESULT_LIMIT);
  }

  let filtered = filterForCategory(raw, cat, 1);
  if (filtered.length < 3) {
    filtered = filterForCategory(raw, cat, 0);
  }
  return filtered;
}

async function mergeFromCategoryCaches() {
  const chunks = [];
  for (const cat of CATEGORY_IDS) {
    const mem = cacheGet(cat);
    if (mem?.data?.length) {
      chunks.push(mem.data);
      continue;
    }
    const db = await dbGetCache(cat);
    if (db?.articles?.length) {
      cacheSet(cat, db.articles, db.ts);
      chunks.push(db.articles);
      continue;
    }
    return null;
  }
  return mergeArticles(chunks.flat()).slice(0, RESULT_LIMIT);
}

async function resolveCategory(cat) {
  const mem = cacheGet(cat);
  if (mem) {
    console.log(`[news] memory HIT: ${cat}`);
    const articles = refineCachedArticles(mem.data, cat);
    if (articles.length) return packResult(articles, mem.ts, true, 'memory');
  }

  const db = await dbGetCache(cat);
  if (db?.fresh && db.articles.length) {
    console.log(`[news] db HIT: ${cat}`);
    cacheSet(cat, db.articles, db.ts);
    return packResult(db.articles, db.ts, true, 'db');
  }

  if (isKeyConfigured()) {
    console.log(`[news] refresh: ${cat} — NewsAPI`);
    let articles;
    if (cat === 'all') {
      articles = await mergeFromCategoryCaches();
      if (!articles?.length) {
        articles = await fetchFromNewsApi('all');
      }
    } else {
      articles = await fetchFromNewsApi(cat);
    }
    const ts = Date.now();
    cacheSet(cat, articles, ts);
    await dbSetCache(cat, articles);
    return packResult(articles, ts, false, 'newsapi');
  }

  if (db?.articles?.length) {
    console.log(`[news] db STALE: ${cat} (ingen API-nyckel)`);
    cacheSet(cat, db.articles, db.ts);
    return packResult(db.articles, db.ts, true, 'db-stale');
  }

  const err = new Error('API-nyckel saknas — lägg till NEWS_API_KEY (ingen sparad cache)');
  err.status = 503;
  throw err;
}

async function fetchCategory(cat) {
  const hit = cacheGet(cat);
  if (hit) {
    const articles = refineCachedArticles(hit.data, cat);
    if (articles.length) return packResult(articles, hit.ts, true, 'memory');
  }

  if (inflight.has(cat)) return inflight.get(cat);

  const job = (async () => {
    try {
      return await resolveCategory(cat);
    } catch (e) {
      const db = await dbGetCache(cat);
      if (db?.articles?.length) {
        console.warn(`[news] NewsAPI misslyckades för ${cat}, använder db-stale:`, e.message);
        cacheSet(cat, db.articles, db.ts);
        return packResult(db.articles, db.ts, true, 'db-stale');
      }
      throw e;
    }
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
  if (hit) return packResult(hit.data, hit.ts, true, 'memory');

  if (inflight.has('all')) return inflight.get('all');

  const job = (async () => {
    try {
      return await resolveCategory('all');
    } catch (e) {
      const db = await dbGetCache('all');
      if (db?.articles?.length) {
        cacheSet('all', db.articles, db.ts);
        return packResult(db.articles, db.ts, true, 'db-stale');
      }
      const merged = await mergeFromCategoryCaches();
      if (merged?.length) {
        const ts = Date.now();
        cacheSet('all', merged, ts);
        return packResult(merged, ts, true, 'merged');
      }
      throw e;
    }
  })();

  inflight.set('all', job);
  try {
    return await job;
  } finally {
    inflight.delete('all');
  }
}

async function getNewsArticles(cat = 'all') {
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
  CATEGORY_IDS,
  getNewsArticles,
  getCacheStats,
  isKeyConfigured,
  scoreArticleForCategory,
  filterForCategory,
};
