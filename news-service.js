/**
 * Delad nyhetstjänst — cache i Supabase + minne, max 1 NewsAPI-uppdatering / 2h / kategori.
 * Används av Vercel /api/news och Railway news-proxy.
 */

const { createClient } = require('@supabase/supabase-js');

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 timmar
const KEY = process.env.NEWS_API_KEY;
const BASE = 'https://newsapi.org/v2/everything';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

let _admin = null;

function getAdmin() {
  if (_admin) return _admin;
  if (!SUPABASE_URL || !SERVICE_ROLE) return null;
  _admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

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

function cacheSet(key, data, ts = Date.now()) {
  cache.set(key, { data, ts });
}

async function dbGetCache(cat) {
  const admin = getAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from('aestimai_news_cache')
      .select('articles, fetched_at')
      .eq('category', cat)
      .maybeSingle();
    if (error) {
      console.warn('[news] db read failed:', error.message);
      return null;
    }
    if (!data) return null;
    const ts = new Date(data.fetched_at).getTime();
    if (Number.isNaN(ts)) return null;
    const articles = Array.isArray(data.articles) ? data.articles : [];
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
  const admin = getAdmin();
  if (!admin) return;
  try {
    const { error } = await admin.from('aestimai_news_cache').upsert({
      category: cat,
      articles,
      fetched_at: new Date().toISOString(),
      source: 'newsapi',
    }, { onConflict: 'category' });
    if (error) console.warn('[news] db write failed:', error.message);
  } catch (e) {
    console.warn('[news] db write error:', e?.message || e);
  }
}

function packResult(articles, cachedAt, fromCache, source) {
  return { articles, cachedAt, fromCache, source };
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

async function resolveCategory(cat) {
  const mem = cacheGet(cat);
  if (mem) {
    console.log(`[news] memory HIT: ${cat}`);
    return packResult(mem.data, mem.ts, true, 'memory');
  }

  const db = await dbGetCache(cat);
  if (db?.fresh && db.articles.length) {
    console.log(`[news] db HIT: ${cat}`);
    cacheSet(cat, db.articles, db.ts);
    return packResult(db.articles, db.ts, true, 'db');
  }

  if (isKeyConfigured()) {
    console.log(`[news] refresh: ${cat} — NewsAPI`);
    const articles = await fetchFromNewsApi(cat);
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
  if (hit) return packResult(hit.data, hit.ts, true, 'memory');

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
  return fetchCategory('all');
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
  getNewsArticles,
  getCacheStats,
  isKeyConfigured,
};
