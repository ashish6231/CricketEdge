import test from 'node:test'
import assert from 'node:assert/strict'
import { getExpiryReminder, getPlanPurchaseState } from './subscriptionAccess.js'

const user = (planSlug, expiresAt) => ({ role: 'user', subscription: { planSlug, status: 'active', expiresAt } })

test('expiry reminder appears only for active paid plans with three days or less', () => {
  const now = new Date('2026-11-02T12:00:00Z')
  assert.equal(getExpiryReminder(user('pro', '2026-11-05T12:00:00Z'), now).daysLeft, 3)
  assert.equal(getExpiryReminder(user('lite', '2026-11-03T06:00:00Z'), now).daysLeft, 1)
  assert.equal(getExpiryReminder(user('pro', '2026-11-05T12:00:01Z'), now), null)
  assert.equal(getExpiryReminder(user('free', '2026-11-03T12:00:00Z'), now), null)
  assert.equal(getExpiryReminder({ ...user('lite', '2026-11-03T12:00:00Z'), subscription: { ...user('lite', '2026-11-03T12:00:00Z').subscription, status: 'expired' } }, now), null)
})

test('active plan cannot be purchased twice and Pro includes a faded Lite card', () => {
  assert.deepEqual(getPlanPurchaseState({ currentSlug: 'pro', planSlug: 'pro', active: true }), { isCurrent: true, includedInPro: false, disabled: true })
  assert.deepEqual(getPlanPurchaseState({ currentSlug: 'pro', planSlug: 'lite', active: true }), { isCurrent: false, includedInPro: true, disabled: true })
  assert.deepEqual(getPlanPurchaseState({ currentSlug: 'lite', planSlug: 'lite', active: true }), { isCurrent: true, includedInPro: false, disabled: true })
  assert.deepEqual(getPlanPurchaseState({ currentSlug: 'lite', planSlug: 'pro', active: true }), { isCurrent: false, includedInPro: false, disabled: false })
})
