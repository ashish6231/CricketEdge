import test from 'node:test'
import assert from 'node:assert/strict'
import { requiresPaidMatchAccess, isSubscriptionRequiredError } from './matchAccess.js'

const paid = { authReady: true, isLoggedIn: true, isFreeMode: false, user: { role: 'user' } }
test('subscription denials open the paid prompt; Telegram membership denials do not', () => {
  assert.equal(isSubscriptionRequiredError({ status: 403, code: 'SUBSCRIPTION_REQUIRED' }), true)
  assert.equal(isSubscriptionRequiredError({ error: 'subscription_required' }), true)
  assert.equal(isSubscriptionRequiredError({ status: 403, code: 'TELEGRAM_REQUIRED' }), false)
  assert.equal(isSubscriptionRequiredError({ status: 403, code: 'LEFT_GROUP' }), false)
  assert.equal(isSubscriptionRequiredError({ status: 401 }), false)
})
test('paid mode gates live and upcoming match details for non-subscribers', () => {
  for (const status of ['live', 'in-play', 'upcoming']) {
    assert.equal(requiresPaidMatchAccess({ ...paid, match: { status } }), true)
  }
})

test('completed matches and free mode remain accessible', () => {
  for (const status of ['ended', 'completed', 'verified', 'abandoned']) {
    assert.equal(requiresPaidMatchAccess({ ...paid, match: { status } }), false)
  }
  assert.equal(requiresPaidMatchAccess({ ...paid, isFreeMode: true, match: { status: 'live' } }), false)
})

test('active subscribers, trials and admins can access paid matches; expired plans cannot', () => {
  const match = { status: 'upcoming' }
  for (const planSlug of ['pro', 'trial']) {
    const user = { role: 'user', subscription: { planSlug, status: 'active', expiresAt: '2099-01-01' } }
    assert.equal(requiresPaidMatchAccess({ ...paid, user, match }), false)
    assert.equal(requiresPaidMatchAccess({ ...paid, user: { ...user, subscription: { ...user.subscription, expiresAt: '2020-01-01' } }, match }), true)
  }
  for (const role of ['admin', 'superadmin']) {
    assert.equal(requiresPaidMatchAccess({ ...paid, user: { role }, match }), false)
  }
})

test('Lite includes Cricket, Toss and Session; Pro also includes Tennis', () => {
  const active = planSlug => ({ role: 'user', subscription: { planSlug, status: 'active', expiresAt: '2099-01-01' } })
  const match = { status: 'live' }
  for (const feature of ['cricket', 'toss', 'session']) assert.equal(requiresPaidMatchAccess({ ...paid, user: active('lite'), match, feature }), false)
  assert.equal(requiresPaidMatchAccess({ ...paid, user: active('lite'), match, feature: 'tennis' }), true)
  for (const feature of ['cricket', 'toss', 'session', 'tennis']) {
    assert.equal(requiresPaidMatchAccess({ ...paid, user: active('pro'), match, feature }), false)
  }
})

test('waits for authentication and match identity; guests retain their sign-in flow', () => {
  assert.equal(requiresPaidMatchAccess({ ...paid, authReady: false, match: { status: 'live' } }), false)
  assert.equal(requiresPaidMatchAccess({ ...paid, isLoggedIn: false, match: { status: 'live' } }), false)
  assert.equal(requiresPaidMatchAccess({ ...paid, match: null }), false)
})
