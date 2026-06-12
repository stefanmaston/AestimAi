// POST /api/market/checkout
// Skapar Stripe Checkout för extra Bytesmarknads-annons (€1) — Freemium.
// Body: { listingId: string }
// Headers: Authorization: Bearer <supabase access token>

const { requireStripe } = require('../_stripe');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_EJWkHcLuQmbEnwAGkaEANg_6rue2HsZ';
const EXTRA_LISTING_PRICE_ID = process.env.STRIPE_PRICE_EXTRA_LISTING || null;

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = requireStripe(res);
  if (!stripe) return;

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Inloggning krävs.' });

  const { listingId } = await readJson(req);
  if (!listingId) return res.status(400).json({ error: 'listingId krävs.' });

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Ogiltig session.' });

    const lr = await fetch(
      `${SUPABASE_URL}/rest/v1/aestimai_valuations?id=eq.${encodeURIComponent(listingId)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,is_public`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const rows = await lr.json();
    const listing = Array.isArray(rows) ? rows[0] : null;
    if (!listing) return res.status(404).json({ error: 'Objektet hittades inte.' });
    if (listing.is_public) return res.status(400).json({ error: 'Annonsen är redan publicerad.' });

    const origin = req.headers.origin || 'https://aestimai.org';
    const lineItem = EXTRA_LISTING_PRICE_ID
      ? { price: EXTRA_LISTING_PRICE_ID, quantity: 1 }
      : {
          price_data: {
            currency: 'eur',
            unit_amount: 100,
            product_data: {
              name: 'Extra annons — UCI Bytesmarknad',
              description: 'Publicera en ytterligare aktiv annons (Freemium)',
            },
          },
          quantity: 1,
        };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [lineItem],
      success_url: `${origin}/?checkout=listing-success&listing=${encodeURIComponent(listingId)}&session_id={CHECKOUT_SESSION_ID}#market`,
      cancel_url: `${origin}/?checkout=listing-cancel&listing=${encodeURIComponent(listingId)}#market`,
      locale: 'sv',
      client_reference_id: listingId,
      metadata: {
        type: 'extra_listing',
        listingId,
        userId: user.id,
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('[market/checkout]', e.message);
    return res.status(500).json({ error: 'Kunde inte starta betalningen.' });
  }
};
