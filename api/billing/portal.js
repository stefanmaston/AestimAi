// POST /api/billing/portal
// Öppnar Stripe Customer Portal för Pro-användare.
// Headers: Authorization: Bearer <supabase access token>

const { requireStripe } = require('../_stripe');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_EJWkHcLuQmbEnwAGkaEANg_6rue2HsZ';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = requireStripe(res);
  if (!stripe) return;

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Inloggning krävs.' });

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Ogiltig session.' });

    const customerId = user.user_metadata?.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({ error: 'Ingen Stripe-kund kopplad till kontot.' });
    }

    const origin = req.headers.origin || 'https://aestimai.org';
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/#account`,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('[billing/portal]', e.message);
    return res.status(500).json({ error: 'Kunde inte öppna faktureringsportalen.' });
  }
};
