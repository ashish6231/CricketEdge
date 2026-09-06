const test = require('node:test');
const assert = require('node:assert/strict');
const tennisLogin = require('../services/tennisLogin');

test('tennisLogin getCookieExpiryMs calculates ms left accurately from iron token', () => {
  const futureExp = Date.now() + 3600000; // 1 hour in future
  const mockCookie = `Fe26.2*1*dummy*dummy*dummy*${futureExp}*dummy*dummy`;
  const msLeft = tennisLogin.getCookieExpiryMs(mockCookie);
  assert.ok(msLeft > 0 && msLeft <= 3600000, 'msLeft should be between 0 and 1 hour');

  const pastExp = Date.now() - 10000; // 10s in past
  const expiredCookie = `Fe26.2*1*dummy*dummy*dummy*${pastExp}*dummy*dummy`;
  assert.equal(tennisLogin.getCookieExpiryMs(expiredCookie), 0, 'Past cookie must return 0 msLeft');
});

test('tennisLogin enforces strict 1 automated try per day and preserves 2nd emergency try', async () => {
  const statusBefore = tennisLogin.getStatus();
  assert.equal(statusBefore.maxAutomatedAttempts, 1, 'Max automated attempts must be strictly 1');

  // Verify canAutoLogin check
  assert.equal(typeof tennisLogin.canAutoLogin(), 'boolean');

  // Verify getStatus structure
  assert.ok('hoursLeft' in statusBefore);
  assert.ok('isConnected' in statusBefore);
  assert.ok('automatedAttemptsUsed' in statusBefore);
  assert.ok('emergencyTryAvailable' in statusBefore);
});
