const test = require('node:test');
const assert = require('node:assert/strict');
const session = require('../services/scraper-tennisliveload/session');

test('scraper-tennisliveload/session getCookieExpiryMs calculates ms left accurately', () => {
  const futureExpiry = Date.now() + 10000000;
  const mockCookie = `cricket_live_load_session=Fe26.2*1*hash*iv*cipher*${futureExpiry}*sig~2`;
  const msLeft = session.getCookieExpiryMs(mockCookie);
  assert.ok(msLeft > 9900000 && msLeft <= 10000000, `Expected ~10000000 ms left, got ${msLeft}`);

  const expiredCookie = `cricket_live_load_session=Fe26.2*1*hash*iv*cipher*1600000000000*sig~2`;
  assert.equal(session.getCookieExpiryMs(expiredCookie), 0, 'Past cookie must return 0 msLeft');
});

test('scraper-tennisliveload/session getStatus returns PostgreSQL Database as source', () => {
  const status = session.getStatus();
  assert.equal(status.source, 'PostgreSQL Database');
  assert.equal(typeof status.isConnected, 'boolean');
  assert.equal(typeof status.hasCredentials, 'boolean');
});
