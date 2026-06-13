/**
 * AestimAi — NewsAPI proxy (Railway / lokal utveckling)
 * Använder samma 1-timmes cache som Vercel /api/news.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { getNewsArticles, getCacheStats, isKeyConfigured, CACHE_TTL_MS } = require('./news-service');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/api/news', async (req, res) => {
  const cat = req.query.cat || 'all';

  try {
    const { articles, cachedAt, fromCache } = await getNewsArticles(cat);
    const maxAge = Math.max(0, Math.floor((CACHE_TTL_MS - (Date.now() - cachedAt)) / 1000));
    res.setHeader('Cache-Control', `public, max-age=${maxAge || 3600}, stale-while-revalidate=86400`);
    res.setHeader('X-News-Cache', fromCache ? 'HIT' : 'MISS');
    res.json({
      articles,
      total: articles.length,
      cachedAt: new Date(cachedAt).toISOString(),
      fromCache,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    keyConfigured: isKeyConfigured(),
    cacheTtlMin: CACHE_TTL_MS / 60000,
    cache: getCacheStats(),
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[AestimAi news-proxy] http://0.0.0.0:${PORT}`);
  if (!isKeyConfigured()) {
    console.warn('[news-proxy] OBS: Ingen API-nyckel konfigurerad i .env');
  }
});
