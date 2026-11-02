export const PLAN_FEATURES = Object.freeze({
  free: [],
  lite: ['cricket', 'session', 'toss'],
  pro: ['cricket', 'session', 'toss', 'tennis'],
  trial: ['cricket', 'session', 'toss', 'tennis'],
})

export const PLAN_NAMES = Object.freeze({
  free: 'Free', lite: 'CricEdge Lite', pro: 'CricEdge Pro', trial: 'Trial',
})

const PAID_PLANS = new Set(['lite', 'pro'])
const DAY_MS = 24 * 60 * 60 * 1000

export function getExpiryReminder(user, now = new Date()) {
  if (!user || user.role === 'admin' || user.role === 'superadmin') return null
  const subscription = user.subscription
  if (!subscription || subscription.status !== 'active' || !PAID_PLANS.has(subscription.planSlug) || !subscription.expiresAt) return null
  const remainingMs = new Date(subscription.expiresAt).getTime() - new Date(now).getTime()
  if (!Number.isFinite(remainingMs) || remainingMs <= 0 || remainingMs > 3 * DAY_MS) return null
  const daysLeft = Math.ceil(remainingMs / DAY_MS)
  return {
    planSlug: subscription.planSlug,
    expiresAt: subscription.expiresAt,
    daysLeft,
    message: daysLeft <= 1
      ? `${PLAN_NAMES[subscription.planSlug]} expires in less than 24 hours. Renew soon to keep your access.`
      : `${PLAN_NAMES[subscription.planSlug]} expires in ${daysLeft} days. Renew soon to keep your access.`,
  }
}

export function getPlanPurchaseState({ currentSlug, planSlug, active }) {
  const isCurrent = Boolean(active && currentSlug === planSlug)
  const includedInPro = Boolean(active && currentSlug === 'pro' && planSlug === 'lite')
  return { isCurrent, includedInPro, disabled: isCurrent || includedInPro }
}

export function hasProAccess(user) {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'superadmin') return true
  const sub = user.subscription
  if (!sub || sub.status !== 'active') return false
  const expiresAt = sub.expiresAt ? new Date(sub.expiresAt) : null
  if (expiresAt && expiresAt <= new Date()) return false
  return Object.hasOwn(PLAN_FEATURES, sub.planSlug) && sub.planSlug !== 'free'
}

export function hasFeatureAccess(user, feature) {
  if (user?.role === 'admin' || user?.role === 'superadmin') return true
  if (!hasProAccess(user)) return false
  return (PLAN_FEATURES[user.subscription.planSlug] || []).includes(feature)
}

export function isActiveTrial(user) {
  if (!user?.subscription) return false
  const sub = user.subscription
  if (sub.planSlug !== 'trial' || sub.status !== 'active') return false
  if (!sub.expiresAt) return false
  return new Date(sub.expiresAt) > new Date()
}

export function isPaidPro(user) {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'superadmin') return true
  const sub = user.subscription
  if (!sub || !Object.hasOwn(PLAN_FEATURES, sub.planSlug) || ['free', 'trial'].includes(sub.planSlug) || sub.status !== 'active') return false
  if (!sub.expiresAt) return true
  return new Date(sub.expiresAt) > new Date()
}

export function getTrialMinutesLeft(user) {
  if (!isActiveTrial(user) || !user.subscription?.expiresAt) return 0
  const diff = new Date(user.subscription.expiresAt) - new Date()
  if (diff <= 0) return 0
  return Math.ceil(diff / (1000 * 60))
}

export function formatTrialTimeLeft(minutes) {
  if (minutes <= 0) return '0 min'
  if (minutes === 1) return '1 min'
  return `${minutes} min`
}

export function getPlanLabel(user) {
  if (user?.role === 'admin' || user?.role === 'superadmin') return user.role === 'superadmin' ? 'Superadmin' : 'Admin'
  if (isActiveTrial(user)) return `Trial · ${formatTrialTimeLeft(getTrialMinutesLeft(user))} left`
  if (isPaidPro(user)) return `⭐ ${PLAN_NAMES[user.subscription.planSlug] || 'Premium'}`
  return 'Free'
}
