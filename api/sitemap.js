// Vercel serverless-funktion: sitemap.xml för UCI Bytesmarknad.
// Nås via /sitemap.xml (rewrite i vercel.json → /api/sitemap).
// Listar startsidan + alla publika listningar (is_public=true).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || 'sb_publishable_EJWkHcLuQmbEnwAGkaEANg_6rue2HsZ';
const SITE_URL     = process.env.SITE_URL || 'https://aestimai.org';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = async (req, res) => {
  let rows = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/aestimai_valuations?is_public=eq.true&select=id,published_at&order=published_at.desc&limit=5000`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    const data = await r.json();
    if (Array.isArray(data)) rows = data;
  } catch (e) {
    console.error('[sitemap] fel:', e);
  }

  const urls = [`  <url><loc>${esc(SITE_URL)}/</loc><changefreq>daily</changefreq></url>`];
  for (const row of rows) {
    const lastmod = row.published_at ? `<lastmod>${esc(new Date(row.published_at).toISOString())}</lastmod>` : '';
    urls.push(`  <url><loc>${esc(SITE_URL)}/m/${esc(row.id)}</loc>${lastmod}<changefreq>weekly</changefreq></url>`);
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') +
    `\n</urlset>\n`
  );
};
