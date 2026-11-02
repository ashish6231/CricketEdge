const test = require('node:test');
const assert = require('node:assert/strict');
const { hasProAccess, hasFeatureAccess, PLAN_FEATURES } = require('../lib/subscriptionAccess');

const user = plan => ({ role: 'user', subPlanSlug: plan, subStatus: 'active', subExpiresAt: new Date('2099-01-01') });

test('paid plans grant only their configured sports', () => {
  assert.deepEqual(PLAN_FEATURES.lite, ['cricket', 'session', 'toss']);
  for (const feature of ['cricket', 'session', 'toss']) assert.equal(hasFeatureAccess(user('lite'), feature), true);
  assert.equal(hasFeatureAccess(user('lite'), 'tennis'), false);
  for (const feature of ['cricket', 'session', 'toss', 'tennis']) assert.equal(hasFeatureAccess(user('pro'), feature), true);
});

test('Lite, legacy Pro and Trial remain active subscriptions', () => {
  for (const slug of ['lite', 'pro', 'trial']) assert.equal(hasProAccess(user(slug)), true);
  assert.equal(hasProAccess(user('free')), false);
  assert.equal(hasFeatureAccess({ ...user('pro'), subExpiresAt: new Date('2020-01-01') }, 'cricket'), false);
  for (const feature of ['cricket', 'session', 'toss', 'tennis']) {
    assert.equal(hasFeatureAccess(user('free'), feature), false);
    assert.equal(hasFeatureAccess({ ...user('lite'), subStatus: 'expired' }, feature), false);
    assert.equal(hasFeatureAccess(null, feature), false);
  }
});
