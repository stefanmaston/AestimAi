// GET /api/news?cat=all|valuation|energy|...
// Server-side cache — uppdateras högst 1 gång/2 timmar per kategori.

const { getNewsArticles, CACHE_TTL_MS } = require('../news-service');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cat = (req.query?.cat || 'all').toString();

  try {
    const { articles, cachedAt, fromCache } = await getNewsArticles(cat);
    const maxAge = Math.max(0, Math.floor((CACHE_TTL_MS - (Date.now() - cachedAt)) / 1000));
    res.setHeader('Cache-Control', `public, max-age=${maxAge || 7200}, stale-while-revalidate=86400`);
    res.setHeader('X-News-Cache', fromCache ? 'HIT' : 'MISS');
    return res.status(200).json({
      articles,
      total: articles.length,
      cachedAt: new Date(cachedAt).toISOString(),
      fromCache,
    });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message });
  }
};
