// Delad logik för att uppdatera användarplan i Supabase Auth metadata.

const PLAN_FREE = 'free';
const PLAN_PRO = 'pro';

async function setUserPlan(admin, userId, plan, extra = {}) {
  const { data: { user }, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !user) throw getErr || new Error('Användaren hittades inte');

  const meta = { ...(user.user_metadata || {}), plan, ...extra };

  if (plan === PLAN_FREE) {
    delete meta.stripe_subscription_id;
    delete meta.plan_period_end;
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: meta,
  });
  if (error) throw error;
}

function subscriptionIsActive(subscription) {
  if (!subscription) return false;
  return subscription.status === 'active' || subscription.status === 'trialing';
}

function resolveUserIdFromSubscription(subscription) {
  return subscription?.metadata?.userId || null;
}

module.exports = {
  PLAN_FREE,
  PLAN_PRO,
  setUserPlan,
  subscriptionIsActive,
  resolveUserIdFromSubscription,
};
