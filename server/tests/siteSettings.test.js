const test = require('node:test');
const assert = require('node:assert/strict');
const { areSignupsAllowed, SIGNUP_SETTING_KEY } = require('../lib/siteSettings');

function fakePrisma(row) {
  return {
    siteSettings: {
      findUnique: async ({ where }) => {
        assert.equal(where.key, SIGNUP_SETTING_KEY);
        return row;
      },
    },
  };
}

test('areSignupsAllowed defaults true when setting missing', async () => {
  assert.equal(await areSignupsAllowed(fakePrisma(null)), true);
});

test('areSignupsAllowed reads boolean false', async () => {
  assert.equal(await areSignupsAllowed(fakePrisma({ key: 'allowSignups', value: false })), false);
});

test('areSignupsAllowed reads boolean true', async () => {
  assert.equal(await areSignupsAllowed(fakePrisma({ key: 'allowSignups', value: true })), true);
});
