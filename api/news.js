// GET /api/news?cat=all|valuation|energy|...
// Proxies to Railway news service (NEWS_API_KEY lives there, not on Vercel).

const UPSTREAM =
  process.env.NEWS_UPSTREAM_URL ||
  'https://news-production-370c.up.railway.app/api/news';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cat = (req.query?.cat || 'all').toString();
  const url = `${UPSTREAM}?cat=${encodeURIComponent(cat)}`;

  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await r.json();
    const cacheCtrl = r.headers.get('cache-control');
    const newsCache = r.headers.get('x-news-cache');
    const newsSource = r.headers.get('x-news-source');
    if (cacheCtrl) res.setHeader('Cache-Control', cacheCtrl);
    if (newsCache) res.setHeader('X-News-Cache', newsCache);
    if (newsSource) res.setHeader('X-News-Source', newsSource);
    res.setHeader('X-News-Proxy', 'railway');
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Nyhetstjänsten svarar inte' });
  }
};
