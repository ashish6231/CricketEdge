import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isPublicSignupAllowed,
  resolveAllowSignups,
  shouldNavigateAfterAuth,
  guestPathAfterLogout,
  isLoginRequiredError,
  resolveSiteName,
  splitSiteName,
} from './publicAuth.js'

test('isPublicSignupAllowed is true only for public and both', () => {
  assert.equal(isPublicSignupAllowed('admin_only'), false)
  assert.equal(isPublicSignupAllowed('public'), true)
  assert.equal(isPublicSignupAllowed('both'), true)
  assert.equal(isPublicSignupAllowed(undefined), false)
})

test('resolveAllowSignups prefers signupMode when present', () => {
  assert.equal(resolveAllowSignups({ signupMode: 'admin_only', allowSignups: true }), false)
  assert.equal(resolveAllowSignups({ signupMode: 'public' }), true)
  assert.equal(resolveAllowSignups({ signupMode: 'both' }), true)
})

test('resolveAllowSignups uses allowSignups compat when signupMode missing', () => {
  assert.equal(resolveAllowSignups({ allowSignups: true }), true)
  assert.equal(resolveAllowSignups({ allowSignups: false }), false)
})

test('resolveAllowSignups reads nested data payload and defaults closed', () => {
  assert.equal(resolveAllowSignups({ data: { signupMode: 'public', allowSignups: true } }), true)
  assert.equal(resolveAllowSignups({ data: { allowSignups: false } }), false)
  assert.equal(resolveAllowSignups(null), false)
  assert.equal(resolveAllowSignups({}), false)
})

test('shouldNavigateAfterAuth is false in modal mode', () => {
  assert.equal(shouldNavigateAfterAuth(true), false)
  assert.equal(shouldNavigateAfterAuth(false), true)
  assert.equal(shouldNavigateAfterAuth(undefined), true)
})

test('guestPathAfterLogout stays on browse routes and leaves protected ones', () => {
  assert.equal(guestPathAfterLogout('/cricket'), '/cricket')
  assert.equal(guestPathAfterLogout('/tennis/match/abc'), '/tennis/match/abc')
  assert.equal(guestPathAfterLogout('/admin'), '/cricket')
  assert.equal(guestPathAfterLogout('/profile'), '/cricket')
  assert.equal(guestPathAfterLogout('/subscription'), '/cricket')
  assert.equal(guestPathAfterLogout('/login'), '/cricket')
  assert.equal(guestPathAfterLogout(undefined), '/cricket')
})

test('isLoginRequiredError treats HTTP 401 as login required', () => {
  assert.equal(isLoginRequiredError({ status: 401, detail: 'Live/upcoming match data requires login.' }), true)
})

test('isLoginRequiredError detects login_required on error/detail/code', () => {
  assert.equal(isLoginRequiredError({ error: 'login_required' }), true)
  assert.equal(isLoginRequiredError({ detail: 'login_required' }), true)
  assert.equal(isLoginRequiredError({ code: 'login_required' }), true)
})

test('isLoginRequiredError treats 401 fetchAPI errors as login required', () => {
  assert.equal(isLoginRequiredError({
    status: 401,
    detail: 'Live/upcoming match data requires login.',
    code: undefined,
  }), true)
})

test('isLoginRequiredError ignores unrelated login substrings', () => {
  assert.equal(isLoginRequiredError({ message: 'Tennis live data requires login.' }), false)
  assert.equal(isLoginRequiredError({ status: 503, detail: 'Scraper login failed' }), false)
  assert.equal(isLoginRequiredError({ error: 'Please login to continue' }), false)
})

test('isLoginRequiredError ignores subscription and network errors', () => {
  assert.equal(isLoginRequiredError({ status: 403, code: 'SUBSCRIPTION_REQUIRED' }), false)
  assert.equal(isLoginRequiredError({ detail: 'Network error' }), false)
  assert.equal(isLoginRequiredError(null), false)
  assert.equal(isLoginRequiredError(undefined), false)
})

test('resolveSiteName reads siteName from payload', () => {
  assert.equal(resolveSiteName({ siteName: 'CricEdge' }), 'CricEdge')
  assert.equal(resolveSiteName({ data: { siteName: ' Odds ' } }), 'Odds')
  assert.equal(resolveSiteName({}), 'CricketEdge')
})

test('splitSiteName highlights trailing Edge', () => {
  assert.deepEqual(splitSiteName('CricketEdge'), { prefix: 'Cricket', suffix: 'Edge' })
  assert.deepEqual(splitSiteName('CricEdge'), { prefix: 'Cric', suffix: 'Edge' })
  assert.deepEqual(splitSiteName('Odds'), { prefix: 'Odds', suffix: '' })
})
