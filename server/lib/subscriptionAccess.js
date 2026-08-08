const TRIAL_DAYS = 3;

function getTrialExpiresAt(from = new Date()) {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + TRIAL_DAYS);
  return expires;
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

function getTrialDaysLeft(user, now = new Date()) {
  if (!isActiveTrial(user, now) || !user.subExpiresAt) return 0;
  const diff = new Date(user.subExpiresAt) - now;
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

async function grantTrial(prisma, userId, now = new Date()) {
  const trialExpires = getTrialExpiresAt(now);
  const proPlan = await prisma.subscriptionPlan.findFirst({ where: { slug: 'pro' } });

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
  return grantTrial(prisma, userId, now);
}

async function hasUsedTrial(prisma, userId) {
  const count = await prisma.userSubscription.count({ where: { userId, planSlug: 'trial' } });
  return count > 0;
}

async function grantTrialIfEligible(prisma, userId, { force = false } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { granted: false, user: null, reason: 'not_found' };
  if (user.role !== 'user') return { granted: false, user, reason: 'not_user' };
  if (user.status !== 'active') return { granted: false, user, reason: 'inactive' };
  if (user.subPlanSlug === 'pro') return { granted: false, user, reason: 'already_pro' };
  if (user.subPlanSlug === 'trial' && user.subExpiresAt && new Date(user.subExpiresAt) > new Date()) {
    return { granted: false, user, reason: 'trial_active' };
  }
  if (!force && await hasUsedTrial(prisma, userId)) {
    return { granted: false, user, reason: 'trial_used' };
  }
  if (user.subPlanSlug !== 'free' && user.subPlanSlug !== 'trial') {
    return { granted: false, user, reason: 'invalid_plan' };
  }

  const updated = await grantTrial(prisma, userId, new Date());
  return { granted: true, user: updated, reason: null };
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
  if (!user || user.subPlanSlug !== 'trial' || user.subStatus !== 'active') return user;
  if (!user.subExpiresAt || new Date(user.subExpiresAt) > now) return user;

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
    where: { userId, planSlug: 'trial', status: 'active' },
    data: { status: 'expired', cancelledAt: now, cancelReason: 'Trial ended' },
  });

  return prisma.user.findUnique({ where: { id: userId } });
}

async function expireAllTrials(prisma) {
  const now = new Date();
  const expired = await prisma.user.findMany({
    where: { subPlanSlug: 'trial', subStatus: 'active', subExpiresAt: { lte: now } },
    select: { id: true, email: true },
  });

  if (!expired.length) return 0;

  await prisma.user.updateMany({
    where: { id: { in: expired.map(u => u.id) } },
    data: { subPlanSlug: 'free', subStatus: 'active', subPlanId: null, subExpiresAt: null, subAutoRenew: false },
  });

  await prisma.userSubscription.updateMany({
    where: { userId: { in: expired.map(u => u.id) }, planSlug: 'trial', status: 'active' },
    data: { status: 'expired', cancelledAt: now, cancelReason: 'Trial ended' },
  });

  expired.forEach(u => console.log(`⏱️ Trial expired for ${u.email}`));
  return expired.length;
}

module.exports = {
  TRIAL_DAYS,
  getTrialExpiresAt,
  hasProAccess,
  isActiveTrial,
  isPaidPro,
  getTrialDaysLeft,
  grantTrialToNewUser,
  grantTrialIfEligible,
  syncUserTrialState,
  grantTrialToAllEligible,
  hasUsedTrial,
  expireTrialIfNeeded,
  expireAllTrials,
};
