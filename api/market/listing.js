// Vercel serverless-funktion: server-renderad, Google-indexerbar listningssida.
// Nås via /m/:id (rewrite i vercel.json → /api/market/listing?id=:id).
// Läser endast publika rader (is_public=true) via Supabase REST med anon-nyckel.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || 'sb_publishable_EJWkHcLuQmbEnwAGkaEANg_6rue2HsZ';
const SITE_URL     = process.env.SITE_URL || 'https://aestimai.org';

const COND_LABELS = { 1: 'Dåligt', 2: 'Slitet', 3: 'OK', 4: 'Bra', 5: 'Utmärkt' };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function notFound(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(404).send(`<!doctype html><html lang="sv"><head><meta charset="utf-8">
<meta name="robots" content="noindex"><title>Annonsen finns inte – AestimAi</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui;max-width:640px;margin:4rem auto;padding:0 1rem;text-align:center">
<h1>Annonsen hittades inte</h1>
<p>Den kan ha tagits bort eller avpublicerats.</p>
<p><a href="${SITE_URL}">Till UCI Bytesmarknad →</a></p></body></html>`);
}

module.exports = async (req, res) => {
  const id = (req.query && req.query.id) || '';
  if (!id) { notFound(res); return; }

  let listing;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/aestimai_valuations?id=eq.${encodeURIComponent(id)}&is_public=eq.true&select=id,object_data,result,marketplace,kind,image_url,published_at`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    const rows = await r.json();
    listing = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    console.error('[listing] fel:', e);
  }

  if (!listing) { notFound(res); return; }

  const od = listing.object_data || {};
  const r  = listing.result || {};
  const mk = listing.marketplace || {};
  const kind = listing.kind === 'wanted' ? 'Efterlyses' : 'Erbjuds';
  const title = mk.title || od.title || (od.description ? String(od.description).slice(0, 60) : 'Objekt');
  const desc  = od.description || '';
  const category = od.category || '';
  const location = mk.location || '';
  const uci = (r.uci_value != null && r.uci_value !== '') ? Number(r.uci_value) : null;
  const uciStr = uci != null && !isNaN(uci) ? uci.toLocaleString('sv-SE') : null;
  const cond = od.condition != null ? (COND_LABELS[od.condition] || od.condition) : '';
  const image = (Array.isArray(mk.images) && mk.images[0]) || listing.image_url || '';
  const url = `${SITE_URL}/m/${esc(listing.id)}`;

  const metaDesc = (desc || `${kind} på UCI Bytesmarknad`).slice(0, 160);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    description: desc || metaDesc,
    category,
    url,
  };
  if (image) jsonLd.image = image;
  if (uci != null && !isNaN(uci)) {
    jsonLd.offers = {
      '@type': 'Offer',
      price: uci,
      priceCurrency: 'UCI',
      availability: 'https://schema.org/InStock',
      url,
    };
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');

  res.status(200).send(`<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – ${esc(kind)} ${uciStr ? '· ' + esc(uciStr) + ' UCI ' : ''}| UCI Bytesmarknad</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(title)} – ${esc(kind)} på UCI Bytesmarknad">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${url}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  :root { --green:#1D6B4E; --ink:#1c1b18; --muted:#6f6e68; --line:#e6e5e0; }
  * { box-sizing:border-box; }
  body { font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:var(--ink);
         margin:0; background:#faf9f6; line-height:1.55; }
  .wrap { max-width:720px; margin:0 auto; padding:1.5rem 1rem 4rem; }
  .top { display:flex; align-items:center; justify-content:space-between; padding:1rem 0; }
  .brand { font-weight:800; color:var(--green); text-decoration:none; font-size:1.1rem; }
  .kind { display:inline-block; font-size:.7rem; font-weight:700; text-transform:uppercase;
          letter-spacing:.06em; padding:.2rem .6rem; border-radius:999px;
          background:#edf7f3; color:var(--green); }
  .hero { width:100%; aspect-ratio:16/10; object-fit:cover; border-radius:14px; background:#eee; }
  .ph { display:flex; align-items:center; justify-content:center; font-size:3rem; color:#bbb; }
  h1 { font-size:1.6rem; margin:1rem 0 .3rem; }
  .cat { color:var(--muted); margin:0 0 1rem; }
  .uci { font-size:2rem; font-weight:800; color:var(--green); }
  .uci small { font-size:1rem; font-weight:600; color:var(--muted); }
  .meta { display:flex; gap:1.5rem; flex-wrap:wrap; margin:1rem 0; color:var(--muted); font-size:.9rem; }
  .desc { white-space:pre-wrap; margin:1.25rem 0; }
  .card { border:1px solid var(--line); border-radius:14px; padding:1.25rem; background:#fff; margin-top:1.5rem; }
  label { display:block; font-size:.82rem; font-weight:600; margin:.75rem 0 .25rem; }
  input, textarea { width:100%; padding:.6rem .7rem; border:1px solid var(--line); border-radius:8px; font:inherit; }
  .hp { position:absolute; left:-9999px; width:1px; height:1px; opacity:0; }
  button { margin-top:1rem; background:var(--green); color:#fff; border:0; border-radius:8px;
           padding:.7rem 1.4rem; font-weight:600; cursor:pointer; font-size:1rem; }
  button:disabled { opacity:.6; }
  .note { font-size:.8rem; color:var(--muted); margin-top:.5rem; }
  .msg { margin-top:.75rem; font-size:.9rem; }
  .ok { color:var(--green); } .err { color:#b84040; }
  footer { margin-top:2rem; font-size:.8rem; color:var(--muted); text-align:center; }
  footer a { color:var(--green); }
</style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <a class="brand" href="${SITE_URL}">AestimAi</a>
      <span class="kind">${esc(kind)}</span>
    </div>

    ${image
      ? `<img class="hero" src="${esc(image)}" alt="${esc(title)}">`
      : `<div class="hero ph">📷</div>`}

    <h1>${esc(title)}</h1>
    <p class="cat">${esc(category)}${location ? ' · ' + esc(location) : ''}</p>
    ${uciStr ? `<div class="uci">${esc(uciStr)} <small>UCI</small></div>` : ''}

    <div class="meta">
      ${cond ? `<span>Skick: ${esc(cond)}</span>` : ''}
      ${listing.published_at ? `<span>Publicerad: ${esc(new Date(listing.published_at).toLocaleDateString('sv-SE'))}</span>` : ''}
    </div>

    ${desc ? `<div class="desc">${esc(desc)}</div>` : ''}

    <div class="card">
      <h2 style="margin:0 0 .25rem;font-size:1.2rem">Kontakta annonsören</h2>
      <p class="note">Skicka ett meddelande så får annonsören din e-post och kan svara dig direkt. Affären gör ni upp själva — utanför AestimAi.</p>
      <form id="contactForm">
        <label for="cName">Ditt namn</label>
        <input id="cName" type="text" autocomplete="name">
        <label for="cEmail">Din e-post</label>
        <input id="cEmail" type="email" autocomplete="email" required>
        <label for="cMsg">Meddelande</label>
        <textarea id="cMsg" rows="4" required></textarea>
        <input id="cHp" class="hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button type="submit" id="cBtn">Skicka</button>
        <div class="msg" id="cMsgOut"></div>
      </form>
    </div>

    <footer>
      <a href="${SITE_URL}">← Till UCI Bytesmarknad</a> · Värderingar i UCI (Universal Coin Index)
    </footer>
  </div>

  <script>
    (function () {
      var f = document.getElementById('contactForm');
      var out = document.getElementById('cMsgOut');
      var btn = document.getElementById('cBtn');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        out.textContent = '';
        var email = document.getElementById('cEmail').value.trim();
        var message = document.getElementById('cMsg').value.trim();
        if (!email || !message) { out.className = 'msg err'; out.textContent = 'Fyll i e-post och meddelande.'; return; }
        btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Skickar…';
        fetch('/api/market/contact', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listingId: ${JSON.stringify(String(listing.id))},
            fromEmail: email,
            name: document.getElementById('cName').value.trim(),
            message: message,
            hp: document.getElementById('cHp').value
          })
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (res) {
            if (!res.ok) throw new Error((res.d && res.d.error) || 'Kunde inte skicka.');
            f.reset();
            out.className = 'msg ok'; out.textContent = 'Meddelandet skickat!';
          })
          .catch(function (err) { out.className = 'msg err'; out.textContent = err.message; })
          .finally(function () { btn.disabled = false; btn.textContent = orig; });
      });
    })();
  </script>
</body>
</html>`);
};
