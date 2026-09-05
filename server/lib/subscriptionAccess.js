const {
  parseTrialConfig,
  getTrialExpiresAt,
  TRIAL_SETTING_KEYS,
  TRIAL_DEFAULTS,
} = require('./trialConfig');

const TRIAL_MINUTES = TRIAL_DEFAULTS.value;
const TRIAL_LABEL = '30-minute';

async function getTrialConfig(prisma) {
  const rows = await prisma.siteSettings.findMany({
    where: { key: { in: Object.values(TRIAL_SETTING_KEYS) } },
  });
  return parseTrialConfig(rows);
}

function hasProAccess(user, now = new Date()) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  const expiresAt = user.subExpiresAt ? new Date(user.subExpiresAt) : null;
  if (expiresAt && expiresAt <= now) return false;
  if (user.subStatus !== 'active') return false;
  return user.subPlanSlug === 'pro' || user.subPlanSlug === 'trial';
}

function isActiveTrial(user, now = new Date()) {
  return hasProAccess(user, now) && user.subPlanSlug === 'trial';
}

function isPaidPro(user, now = new Date()) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  const expiresAt = user.subExpiresAt ? new Date(user.subExpiresAt) : null;
  if (!expiresAt || expiresAt <= now) return false;
  return user.subPlanSlug === 'pro' && user.subStatus === 'active';
}

function getTrialMinutesLeft(user, now = new Date()) {
  if (!isActiveTrial(user, now) || !user.subExpiresAt) return 0;
  const diff = new Date(user.subExpiresAt) - now;
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60));
}

async function expireActiveSubscriptions(prisma, userId, { exceptId = null, reason = 'Replaced', now = new Date() } = {}) {
  await prisma.userSubscription.updateMany({
    where: {
      userId,
      status: 'active',
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { status: 'expired', cancelledAt: now, cancelReason: reason },
  });
}

async function expireTrialForProUpgrade(prisma, userId, now = new Date()) {
  await prisma.userSubscription.updateMany({
    where: { userId, planSlug: 'trial', status: 'active' },
    data: { status: 'expired', cancelledAt: now, cancelReason: 'Upgraded to Pro' },
  });
}

async function grantTrial(prisma, userId, now = new Date()) {
  const cfg = await getTrialConfig(prisma);
  const trialExpires = getTrialExpiresAt(now, cfg.minutes);
  const proPlan = await prisma.subscriptionPlan.findFirst({ where: { slug: 'pro' } });

  await expireActiveSubscriptions(prisma, userId, { reason: 'Trial started', now });

  await prisma.user.update({
    where: { id: userId },
    data: {
      subPlanId: proPlan?.id ?? null,
      subPlanSlug: 'trial',
      subStatus: 'active',
      subStartedAt: now,
      subExpiresAt: trialExpires,
      subAutoRenew: false,
    },
  });

  await prisma.userSubscription.create({
    data: {
      userId,
      planId: proPlan?.id ?? 1,
      planSlug: 'trial',
      amount: 0,
      startedAt: now,
      expiresAt: trialExpires,
      billingCycle: 'trial',
      paymentStatus: 'completed',
      paymentMethod: 'trial',
      paidAt: now,
      status: 'active',
    },
  });

  return prisma.user.findUnique({ where: { id: userId } });
}

async function grantTrialToNewUser(prisma, userId, now = new Date()) {
  return grantTrialIfEligible(prisma, userId, { force: false, now });
}

async function hasUsedTrial(prisma, userId) {
  const count = await prisma.userSubscription.count({ where: { userId, planSlug: 'trial' } });
  return count > 0;
}

async function grantTrialIfEligible(prisma, userId, { force = false, now = new Date() } = {}) {
  // First expire any lapsed pro/trial so stale subPlanSlug doesn't block grant
  await expireTrialIfNeeded(prisma, userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { granted: false, user: null, reason: 'not_found' };
  if (user.role !== 'user') return { granted: false, user, reason: 'not_user' };
  if (user.status !== 'active') return { granted: false, user, reason: 'inactive' };
  if (user.subPlanSlug === 'pro') return { granted: false, user, reason: 'already_pro' };
  if (user.subPlanSlug === 'trial' && user.subExpiresAt && new Date(user.subExpiresAt) > now) {
    return { granted: false, user, reason: 'trial_active' };
  }
  if (!force && await hasUsedTrial(prisma, userId)) {
    return { granted: false, user, reason: 'trial_used' };
  }
  if (user.subPlanSlug !== 'free' && user.subPlanSlug !== 'trial') {
    return { granted: false, user, reason: 'invalid_plan' };
  }

  const cfg = await getTrialConfig(prisma);
  if (!cfg.enabled) return { granted: false, user, reason: 'trial_disabled' };

  const updated = await grantTrial(prisma, userId, now);
  return { granted: true, user: updated, reason: null };
}

async function refreshUserSubscriptionState(prisma, userId) {
  const user = await expireTrialIfNeeded(prisma, userId);
  return user || await prisma.user.findUnique({ where: { id: userId } });
}

async function syncUserTrialState(prisma, userId) {
  let user = await expireTrialIfNeeded(prisma, userId);
  const result = await grantTrialIfEligible(prisma, userId);
  if (result.granted) user = result.user;
  const freshUser = user || await prisma.user.findUnique({ where: { id: userId } });
  return { user: freshUser, trialGranted: result.granted };
}

async function grantTrialToAllEligible(prisma) {
  const users = await prisma.user.findMany({
    where: {
      role: 'user',
      status: 'active',
      subPlanSlug: 'free',
      subscriptions: { none: { planSlug: 'trial' } },
    },
    select: { id: true, email: true },
  });

  let granted = 0;
  for (const u of users) {
    const result = await grantTrialIfEligible(prisma, u.id);
    if (result.granted) {
      granted++;
      console.log(`🎁 Trial granted to existing user ${u.email}`);
    }
  }
  return { eligible: users.length, granted };
}

async function expireTrialIfNeeded(prisma, userId) {
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return user;

  const isPaidOrTrial = user.subPlanSlug === 'trial' || user.subPlanSlug === 'pro';
  if (!isPaidOrTrial || user.subStatus !== 'active') return user;
  if (!user.subExpiresAt || new Date(user.subExpiresAt) > now) return user;

  const planSlug = user.subPlanSlug;
  await prisma.user.update({
    where: { id: userId },
    data: {
      subPlanSlug: 'free',
      subStatus: 'active',
      subPlanId: null,
      subExpiresAt: null,
      subAutoRenew: false,
    },
  });

  await prisma.userSubscription.updateMany({
    where: { userId, planSlug, status: 'active' },
    data: { status: 'expired', cancelledAt: now, cancelReason: planSlug === 'trial' ? 'Trial ended' : 'Subscription expired' },
  });

  return prisma.user.findUnique({ where: { id: userId } });
}

async function expireAllTrials(prisma) {
  const now = new Date();
  const expired = await prisma.user.findMany({
    where: {
      subPlanSlug: { in: ['trial', 'pro'] },
      subStatus: 'active',
      subExpiresAt: { lte: now },
    },
    select: { id: true, email: true, subPlanSlug: true },
  });

  if (!expired.length) return 0;

  await prisma.user.updateMany({
    where: { id: { in: expired.map(u => u.id) } },
    data: { subPlanSlug: 'free', subStatus: 'active', subPlanId: null, subExpiresAt: null, subAutoRenew: false },
  });

  for (const planSlug of ['trial', 'pro']) {
    const ids = expired.filter(u => u.subPlanSlug === planSlug).map(u => u.id);
    if (!ids.length) continue;
    await prisma.userSubscription.updateMany({
      where: { userId: { in: ids }, planSlug, status: 'active' },
      data: { status: 'expired', cancelledAt: now, cancelReason: planSlug === 'trial' ? 'Trial ended' : 'Subscription expired' },
    });
  }

  expired.forEach(u => console.log(`⏱️ ${u.subPlanSlug} expired for ${u.email}`));
  return expired.length;
}

async function revokeAllActiveTrials(prisma, { reason = 'Trial revoked', now = new Date() } = {}) {
  const active = await prisma.user.findMany({
    where: { subPlanSlug: 'trial', subStatus: 'active' },
    select: { id: true, email: true, subExpiresAt: true },
  });

  if (!active.length) return { matched: 0, revoked: 0, users: [] };

  const ids = active.map(u => u.id);

  await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: {
      subPlanSlug: 'free',
      subStatus: 'active',
      subPlanId: null,
      subExpiresAt: null,
      subAutoRenew: false,
    },
  });

  await prisma.userSubscription.updateMany({
    where: { userId: { in: ids }, planSlug: 'trial', status: 'active' },
    data: { status: 'expired', cancelledAt: now, cancelReason: reason },
  });

  return { matched: active.length, revoked: active.length, users: active };
}

module.exports = {
  TRIAL_MINUTES,
  TRIAL_LABEL,
  getTrialExpiresAt,
  getTrialConfig,
  hasProAccess,
  isActiveTrial,
  isPaidPro,
  getTrialMinutesLeft,
  grantTrialToNewUser,
  grantTrialIfEligible,
  refreshUserSubscriptionState,
  syncUserTrialState,
  grantTrialToAllEligible,
  hasUsedTrial,
  expireTrialIfNeeded,
  expireTrialForProUpgrade,
  expireActiveSubscriptions,
  expireAllTrials,
  revokeAllActiveTrials,
};
