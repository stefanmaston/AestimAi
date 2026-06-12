// POST /api/billing/confirm-pro
// Verifierar Stripe Checkout-session och aktiverar Pro-plan.
// Body: { sessionId }
// Headers: Authorization: Bearer <supabase access token>

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { PLAN_PRO, setUserPlan, subscriptionIsActive } = require('./_plan');

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

  if (!process.env.STRIPE_SECRET_KEY || !SERVICE_ROLE) {
    return res.status(503).json({ error: 'Serverkonfiguration saknas.' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Inloggning krävs.' });

  const { sessionId } = await readJson(req);
  if (!sessionId) return res.status(400).json({ error: 'sessionId krävs.' });

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Ogiltig session.' });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    if (session.metadata?.type !== 'pro_subscription') {
      return res.status(400).json({ error: 'Ogiltig betalningstyp.' });
    }
    if (session.metadata?.userId !== user.id && session.client_reference_id !== user.id) {
      return res.status(403).json({ error: 'Betalningen matchar inte ditt konto.' });
    }
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(402).json({ error: 'Betalningen är inte slutförd.' });
    }

    const subscription = session.subscription;
    if (!subscriptionIsActive(subscription)) {
      return res.status(402).json({ error: 'Abonnemanget är inte aktivt.' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await setUserPlan(admin, user.id, PLAN_PRO, {
      stripe_customer_id: session.customer,
      stripe_subscription_id: subscription.id,
      plan_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
    });

    return res.status(200).json({ ok: true, plan: PLAN_PRO });
  } catch (e) {
    console.error('[billing/confirm-pro]', e.message);
    return res.status(500).json({ error: 'Kunde inte aktivera Pro-abonnemanget.' });
  }
};
