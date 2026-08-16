import { buildTossDatasetQuery } from './utils/tossDatasetAdmin.js'

const API_BASE = (import.meta.env?.VITE_API_URL || '') + '/api'
const API_TIMEOUT_MS = 12000

const getAuthHeader = () => {
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function getAPIError(res) {
  const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
  const raw = errData.detail || errData.message || errData.error || `HTTP ${res.status}`
  const detail = String(raw).replace(/tennisliveload\.com/gi, 'live feed')
  return {
    status: res.status,
    detail,
    code: errData.code,
  }
}

async function fetchAPI(endpoint, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: { ...getAuthHeader(), ...options.headers }
    })
    if (!res.ok) {
      throw await getAPIError(res)
    }
    return await res.json()
  } catch (err) {
    if (err.name === 'AbortError') throw { detail: 'Request timeout — server slow hai, dubara try karo' }
    if (err.detail) throw err
    console.error(`API Error: ${endpoint}`, err)
    throw { detail: 'Network error' }
  } finally {
    clearTimeout(timer)
  }
}

// ──── Cricket ────

export async function getSummary() {
  return fetchAPI('/summary')
}

export async function getCricketMatches() {
  return fetchAPI('/cricket/matches')
}

export async function getCricketSnapshot(matchId) {
  return fetchAPI(`/cricket/match/${matchId}`)
}

export async function getCricketOdds(matchId) {
  return fetchAPI(`/cricket/odds/${matchId}`)
}

export async function getCricketOddsBulk(matchIds) {
  if (!matchIds?.length) {
    throw { detail: 'No match IDs provided' }
  }
  return fetchAPI(`/cricket/odds-bulk?ids=${matchIds.join(',')}`)
}

// ──── Tennis ────

export async function getTennisMatches() {
  return fetchAPI('/tennis/matches')
}

export async function getTennisSnapshot(matchId) {
  return fetchAPI(`/tennis/match/${matchId}`)
}

// ──── Session ────

export async function getSessionMatches() {
  return fetchAPI('/session/matches')
}

export async function getSessionTrades(matchId) {
  return fetchAPI(`/session/trades/${matchId}`)
}

// ──── Toss ────

export async function getTossMatches() {
  return fetchAPI('/toss/matches')
}

export async function getTossSnapshot(matchId) {
  return fetchAPI(`/toss/match/${matchId}`)
}

// ──── Auth ────

export async function login(email, password) {
  const res = await fetchAPI('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (res.token) localStorage.setItem('auth_token', res.token)
  return res
}

export async function register(name, email, password) {
  const res = await fetchAPI('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  })
  if (res.token) localStorage.setItem('auth_token', res.token)
  return res
}

export async function getSignupStatus() {
  return fetchAPI('/auth/signup-status')
}

export async function forgotPassword(email) {
  return fetchAPI('/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

export async function verifyOtp(email, otp) {
  return fetchAPI('/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  })
}

export async function resetPassword(resetToken, newPassword) {
  return fetchAPI('/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetToken, newPassword }),
  })
}

export async function getAuthStatus() {
  const token = localStorage.getItem('auth_token')
  if (!token) return { isLoggedIn: false }
  try {
    const res = await fetchAPI('/auth/me')
    if (!res) return { isLoggedIn: false }
    return { isLoggedIn: true, email: res.user?.email, user: res.user }
  } catch (err) {
    if (err.detail !== 'Network error') {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return { isLoggedIn: false }
  }
}

export async function logout() {
  localStorage.removeItem('auth_token')
  return { success: true }
}

// ──── Subscription ────

export async function getPlans() {
  return fetchAPI('/subscription/plans')
}

export async function getMySubscription() {
  return fetchAPI('/subscription/my')
}

export async function checkExpiry() {
  return fetchAPI('/subscription/check-expiry')
}

export async function createOrder(billingCycle) {
  return fetchAPI('/subscription/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billingCycle }),
  })
}

export async function verifyPayment(data) {
  return fetchAPI('/subscription/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function paymentFailed(razorpay_order_id) {
  return fetchAPI('/subscription/payment-failed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ razorpay_order_id }),
  })
}

// ──── Admin ────

export async function adminDashboard() {
  return fetchAPI('/admin/dashboard')
}

export function adminGetTossDataset({
  status = 'pending',
  page = 1,
  limit = 20,
  search = '',
} = {}) {
  const query = buildTossDatasetQuery({ status, page, limit, search })
  return fetchAPI(`/admin/toss-dataset?${query}`)
}

export function adminConfirmTossWinner(matchId, actualWinner) {
  return fetchAPI(`/admin/toss-dataset/${encodeURIComponent(matchId)}/actual-winner`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actualWinner }),
  })
}

export async function adminCaptureTossDataset() {
  const CAPTURE_TIMEOUT_MS = 120000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/admin/toss-dataset/capture`, {
      method: 'POST',
      signal: controller.signal,
      headers: getAuthHeader(),
    })
    if (!res.ok) throw await getAPIError(res)
    return await res.json()
  } catch (err) {
    if (err.name === 'AbortError') throw { detail: 'Request timeout — server slow hai, dubara try karo' }
    if (err.detail) throw err
    console.error('API Error: /admin/toss-dataset/capture', err)
    throw { detail: 'Network error' }
  } finally {
    clearTimeout(timer)
  }
}

export async function adminGetTossDatasetExport() {
  const res = await fetch(`${API_BASE}/admin/toss-dataset/export`, {
    headers: getAuthHeader(),
  })
  if (!res.ok) throw await getAPIError(res)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'toss_dataset.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function adminGetUsers(params = {}) {
  const q = new URLSearchParams(params).toString()
  return fetchAPI(`/admin/users${q ? '?' + q : ''}`)
}

export async function adminGetLapsedUsers(params = {}) {
  return adminGetUsers({ ...params, segment: 'lapsed' })
}

export async function adminGetUser(id) {
  return fetchAPI(`/admin/users/${id}`)
}

export async function adminGetUserSubscriptions(userId) {
  return fetchAPI(`/admin/users/${userId}/subscriptions`)
}

export async function adminGetSubscriptionLogs(params = {}) {
  const q = new URLSearchParams(params).toString()
  return fetchAPI(`/admin/subscription-logs${q ? '?' + q : ''}`)
}

export async function adminUpdateUserStatus(id, status, reason) {
  return fetchAPI(`/admin/users/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reason }),
  })
}

export async function adminUpdateUserRole(id, role) {
  return fetchAPI(`/admin/users/${id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
}

export async function adminUpdateUserPlan(id, planSlug, reason, durationMonths) {
  return fetchAPI(`/admin/users/${id}/plan`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planSlug, reason, durationMonths }),
  })
}

export async function adminGrantTrial(id, force = false) {
  return fetchAPI(`/admin/users/${id}/grant-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  })
}

export async function adminGrantTrialAll() {
  return fetchAPI('/admin/grant-trial-all', { method: 'POST' })
}

export async function adminCreateAdmin(data) {
  return fetchAPI('/admin/admins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function adminGetAdmins() {
  return fetchAPI('/admin/admins')
}

export async function adminGetPermissions() {
  return fetchAPI('/admin/permissions')
}

export async function adminGetPlans() {
  return fetchAPI('/admin/plans')
}

export async function adminUpdatePlan(id, data) {
  return fetchAPI(`/admin/plans/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function adminGetCoupons() {
  return fetchAPI('/admin/coupons')
}

export async function adminCreateCoupon(data) {
  return fetchAPI('/admin/coupons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function adminUpdateCoupon(id, data) {
  return fetchAPI(`/admin/coupons/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function adminGetSettings() {
  return fetchAPI('/admin/settings')
}

export async function adminUpdateSetting(key, value, reason) {
  return fetchAPI(`/admin/settings/${key}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, reason }),
  })
}

export async function adminGetAuditLogs(params = {}) {
  const q = new URLSearchParams(params).toString()
  return fetchAPI(`/admin/audit-logs${q ? '?' + q : ''}`)
}
