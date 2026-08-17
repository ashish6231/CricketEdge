const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAdminPasswordChange } = require('../lib/adminUserPassword');

test('rejects missing or short password', () => {
  assert.equal(validateAdminPasswordChange({ password: '' }).ok, false);
  assert.equal(validateAdminPasswordChange({ password: '12345' }).status, 400);
  assert.equal(validateAdminPasswordChange({ password: '123456', target: { role: 'user', authProvider: 'local' } }).ok, true);
});

test('rejects missing user and superadmin target', () => {
  assert.equal(validateAdminPasswordChange({ password: 'secret1', target: null }).status, 404);
  assert.equal(
    validateAdminPasswordChange({ password: 'secret1', target: { role: 'superadmin', authProvider: 'local' } }).status,
    403,
  );
});

test('rejects google-only accounts', () => {
  const result = validateAdminPasswordChange({
    password: 'secret1',
    target: { role: 'user', authProvider: 'google' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});
