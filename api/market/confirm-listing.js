// POST /api/market/confirm-listing
// Verifierar Stripe-betalning och publicerar annonsen.
// Body: { sessionId, listingId }
// Headers: Authorization: Bearer <supabase access token>

const { requireStripe } = require('../_stripe');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_EJWkHcLuQmbEnwAGkaEANg_6rue2HsZ';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  if (!SERVICE_ROLE) {
    return res.status(503).json({ error: 'Serverkonfiguration saknas.' });
  }

  const stripe = requireStripe(res);
  if (!stripe) return;

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Inloggning krävs.' });

  const { sessionId, listingId } = await readJson(req);
  if (!sessionId || !listingId) {
    return res.status(400).json({ error: 'sessionId och listingId krävs.' });
  }

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Ogiltig session.' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Betalningen är inte slutförd.' });
    }
    if (session.metadata?.type !== 'extra_listing') {
      return res.status(400).json({ error: 'Ogiltig betalningstyp.' });
    }
    if (session.metadata?.listingId !== listingId || session.metadata?.userId !== user.id) {
      return res.status(403).json({ error: 'Betalningen matchar inte objektet.' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: rows, error: fetchErr } = await admin
      .from('aestimai_valuations')
      .select('id,is_public,user_id')
      .eq('id', listingId)
      .eq('user_id', user.id)
      .limit(1);

    if (fetchErr) throw fetchErr;
    const listing = rows?.[0];
    if (!listing) return res.status(404).json({ error: 'Objektet hittades inte.' });
    if (listing.is_public) return res.status(200).json({ ok: true, alreadyPublic: true });

    const { error: updateErr } = await admin
      .from('aestimai_valuations')
      .update({
        is_public: true,
        published_at: new Date().toISOString(),
      })
      .eq('id', listingId)
      .eq('user_id', user.id);

    if (updateErr) throw updateErr;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[market/confirm-listing]', e.message);
    return res.status(500).json({ error: 'Kunde inte publicera annonsen.' });
  }
};
