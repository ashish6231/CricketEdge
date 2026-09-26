export function isPublicSignupAllowed(mode) {
  return mode === 'public' || mode === 'both'
}

export function resolveAllowSignups(payload) {
  const data = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : payload
  if (!data || typeof data !== 'object') return false
  if (typeof data.signupMode === 'string') return isPublicSignupAllowed(data.signupMode)
  if (typeof data.allowSignups === 'boolean') return data.allowSignups
  return false
}

export function shouldNavigateAfterAuth(isModal) {
  return !isModal
}

export function guestPathAfterLogout(pathname) {
  if (!pathname || pathname === '/login') return '/cricket'
  if (
    pathname.startsWith('/admin')
    || pathname.startsWith('/profile')
    || pathname.startsWith('/subscription')
  ) {
    return '/cricket'
  }
  return pathname
}

export function isLoginRequiredError(err) {
  if (!err || typeof err !== 'object') return false
  if (err.status === 401) return true
  return err.error === 'login_required' || err.code === 'login_required' || err.detail === 'login_required'
}

export function resolveSiteName(payload, fallback = 'CricEdge') {
  const data = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : payload
  const raw = data?.siteName
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return fallback
}

export function splitSiteName(name, fallback = 'CricEdge') {
  const n = (typeof name === 'string' && name.trim() ? name.trim() : fallback)
  if (/edge$/i.test(n) && n.length > 4) {
    return { prefix: n.slice(0, -4), suffix: n.slice(-4) }
  }
  return { prefix: n, suffix: '' }
}

export function resolveSiteMode(payload) {
  const data = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : payload
  if (data?.siteMode === 'free' || data?.isFreeMode === true) return 'free'
  return 'paid'
}

export function isFreeMode(siteMode) {
  return siteMode === 'free'
}

