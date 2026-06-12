// POST /api/billing/checkout
// Skapar Stripe Checkout för Pro-abonnemang (€25/mån).
// Headers: Authorization: Bearer <supabase access token>

const { requireStripe } = require('../_stripe');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_EJWkHcLuQmbEnwAGkaEANg_6rue2HsZ';
const PRO_PRICE_ID = process.env.STRIPE_PRICE_PRO_MONTHLY || null;

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

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Ogiltig session.' });

    const currentPlan = user.user_metadata?.plan || 'free';
    if (currentPlan === 'pro') {
      return res.status(400).json({ error: 'Du har redan Pro-abonnemang.' });
    }
    if (currentPlan === 'enterprise') {
      return res.status(400).json({ error: 'Enterprise hanteras manuellt — kontakta support.' });
    }

    const origin = req.headers.origin || 'https://aestimai.org';
    const lineItem = PRO_PRICE_ID
      ? { price: PRO_PRICE_ID, quantity: 1 }
      : {
          price_data: {
            currency: 'eur',
            unit_amount: 2500,
            recurring: { interval: 'month' },
            product_data: {
              name: 'AestimAi Pro',
              description: '500 värderingar/dag, 50 aktiva annonser, API-access m.m.',
            },
          },
          quantity: 1,
        };

    const sessionParams = {
      mode: 'subscription',
      line_items: [lineItem],
      success_url: `${origin}/?checkout=pro-success&session_id={CHECKOUT_SESSION_ID}#pricing`,
      cancel_url: `${origin}/?checkout=pro-cancel#pricing`,
      locale: 'sv',
      client_reference_id: user.id,
      metadata: {
        type: 'pro_subscription',
        userId: user.id,
      },
      subscription_data: {
        metadata: {
          type: 'pro_subscription',
          userId: user.id,
        },
      },
    };

    if (user.user_metadata?.stripe_customer_id) {
      sessionParams.customer = user.user_metadata.stripe_customer_id;
    } else if (user.email) {
      sessionParams.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('[billing/checkout]', e.message);
    return res.status(500).json({ error: 'Kunde inte starta Pro-betalningen.' });
  }
};
