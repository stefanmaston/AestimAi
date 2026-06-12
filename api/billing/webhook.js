// POST /api/billing/webhook
// Stripe webhook — håller Pro-plan synkad vid förnyelse, avslut m.m.
// Kräver: STRIPE_WEBHOOK_SECRET

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const {
  PLAN_FREE,
  PLAN_PRO,
  setUserPlan,
  subscriptionIsActive,
  resolveUserIdFromSubscription,
} = require('./plan');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vaxtylcqnscnflsucyiv.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function applySubscription(admin, subscription, userIdHint) {
  const userId = userIdHint || resolveUserIdFromSubscription(subscription);
  if (!userId) {
    console.warn('[billing/webhook] Saknar userId för subscription', subscription?.id);
    return;
  }

  if (subscriptionIsActive(subscription)) {
    await setUserPlan(admin, userId, PLAN_PRO, {
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      plan_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
    });
    return;
  }

  await setUserPlan(admin, userId, PLAN_FREE, {
    stripe_customer_id: subscription.customer,
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret || !SERVICE_ROLE) {
    console.error('[billing/webhook] Saknar STRIPE eller SUPABASE_SERVICE_ROLE_KEY');
    return res.status(503).send('Serverkonfiguration saknas');
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).send('Missing stripe-signature');

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    console.error('[billing/webhook] Signaturfel:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription' || session.metadata?.type !== 'pro_subscription') break;
        const userId = session.metadata?.userId || session.client_reference_id;
        if (!userId || !session.subscription) break;
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await applySubscription(admin, subscription, userId);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        if (subscription.metadata?.type !== 'pro_subscription') break;
        await applySubscription(admin, subscription);
        break;
      }
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('[billing/webhook]', event.type, e.message);
    return res.status(500).send('Webhook handler failed');
  }
};
