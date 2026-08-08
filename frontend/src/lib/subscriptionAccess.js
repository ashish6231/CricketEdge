export function hasProAccess(user) {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'superadmin') return true
  const sub = user.subscription
  if (!sub || sub.status !== 'active') return false
  const expiresAt = sub.expiresAt ? new Date(sub.expiresAt) : null
  if (expiresAt && expiresAt <= new Date()) return false
  return sub.planSlug === 'pro' || sub.planSlug === 'trial'
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
  if (!sub || sub.planSlug !== 'pro' || sub.status !== 'active') return false
  if (!sub.expiresAt) return true
  return new Date(sub.expiresAt) > new Date()
}

export function getTrialDaysLeft(user) {
  if (!isActiveTrial(user) || !user.subscription?.expiresAt) return 0
  const diff = new Date(user.subscription.expiresAt) - new Date()
  if (diff <= 0) return 0
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function getPlanLabel(user) {
  if (user?.role === 'admin' || user?.role === 'superadmin') return user.role === 'superadmin' ? 'Superadmin' : 'Admin'
  if (isActiveTrial(user)) return `Trial · ${getTrialDaysLeft(user)}d left`
  if (isPaidPro(user)) return '⭐ Pro'
  return 'Free'
}
