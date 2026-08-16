const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeUserRecord } = require('../middleware/auth');

test('sanitizeUserRecord strips secrets', () => {
  const safe = sanitizeUserRecord({
    id: 1,
    email: 'a@b.com',
    password: 'hash',
    activeToken: 'tok',
    otpCode: '123456',
    otpExpiresAt: new Date(),
    otpPurpose: 'reset_password',
    resetToken: 'r',
    resetTokenExpires: new Date(),
    name: 'A',
  });
  assert.equal(safe.id, 1);
  assert.equal(safe.email, 'a@b.com');
  assert.equal(safe.name, 'A');
  assert.equal(safe.password, undefined);
  assert.equal(safe.activeToken, undefined);
  assert.equal(safe.otpCode, undefined);
  assert.equal(safe.resetToken, undefined);
});
