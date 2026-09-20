const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SITE_MODE_KEY,
  SITE_MODES,
  DEFAULT_SITE_MODE,
  resolveSiteMode,
  isFreeMode,
  validateSiteModeValue,
  getSiteModeSync,
} = require('../lib/siteSettings');
const { assertProAccess } = require('../middleware/auth');
const dataCache = require('../services/dataCache');

test('siteSettings: siteMode defaults and validation', () => {
  assert.equal(SITE_MODE_KEY, 'siteMode');
  assert.deepEqual(SITE_MODES, ['paid', 'free']);
  assert.equal(DEFAULT_SITE_MODE, 'paid');
  assert.equal(getSiteModeSync(), 'paid');

  assert.equal(resolveSiteMode({ value: 'free' }), 'free');
  assert.equal(resolveSiteMode({ value: 'paid' }), 'paid');
  assert.equal(resolveSiteMode({ value: 'invalid' }), 'paid');
  assert.equal(resolveSiteMode(null), 'paid');

  assert.equal(isFreeMode('free'), true);
  assert.equal(isFreeMode('paid'), false);

  assert.deepEqual(validateSiteModeValue('free'), { ok: true, value: 'free' });
  assert.deepEqual(validateSiteModeValue('paid'), { ok: true, value: 'paid' });
  assert.equal(validateSiteModeValue('random').ok, false);
});

test('auth middleware: assertProAccess in paid mode vs free mode', async () => {
  function createMockRes() {
    return {
      _status: 200,
      _body: null,
      status(s) { this._status = s; return this; },
      json(b) { this._body = b; return this; },
    };
  }

  // 1. Unauthenticated user -> always 401 login_required
  const res1 = createMockRes();
  const allowed1 = assertProAccess({ user: null }, res1);
  assert.equal(allowed1, false);
  assert.equal(res1._status, 401);
  assert.equal(res1._body.error, 'login_required');

  // 2. Admin user -> always allowed
  const res2 = createMockRes();
  const allowed2 = assertProAccess({ user: { role: 'admin' } }, res2);
  assert.equal(allowed2, true);

  // 3. Regular logged in user without pro subscription in PAID mode
  // (default is paid)
  const res3 = createMockRes();
  const allowed3 = assertProAccess({ user: { role: 'user', subPlanSlug: 'free' } }, res3);
  assert.equal(allowed3, false);
  assert.equal(res3._status, 403);
  assert.equal(res3._body.code, 'SUBSCRIPTION_REQUIRED');
});

test('dataCache: provides synchronous memory read API', () => {
  assert.equal(Array.isArray(dataCache.getCricketMatches()), true);
  assert.equal(Array.isArray(dataCache.getTossMatches()), true);
  assert.equal(Array.isArray(dataCache.getSessionMatches()), true);
  assert.equal(Array.isArray(dataCache.getTennisMatches()), true);
  assert.equal(typeof dataCache.start, 'function');
  assert.equal(typeof dataCache.stop, 'function');
  assert.equal(typeof dataCache.isWarmedUp(), 'boolean');
});
