const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS, settingsUpsertArgs } = require('../seedAdmin');

function setting(key) {
  return DEFAULT_SETTINGS.find((row) => row.key === key);
}

test('DEFAULT_SETTINGS seeds trialEnabled true, private, category trial', () => {
  const row = setting('trialEnabled');
  assert.ok(row, 'trialEnabled missing from DEFAULT_SETTINGS');
  assert.equal(row.value, true);
  assert.equal(row.category, 'trial');
  assert.equal(row.isPublic, false);
  assert.equal(row.description, 'Allow granting free trials to new/eligible users');
});

test('DEFAULT_SETTINGS seeds trialDurationValue 30, private, category trial', () => {
  const row = setting('trialDurationValue');
  assert.ok(row, 'trialDurationValue missing from DEFAULT_SETTINGS');
  assert.equal(row.value, 30);
  assert.equal(row.category, 'trial');
  assert.equal(row.isPublic, false);
  assert.equal(row.description, 'Free trial duration magnitude');
});

test('DEFAULT_SETTINGS seeds trialDurationUnit minutes, private, category trial', () => {
  const row = setting('trialDurationUnit');
  assert.ok(row, 'trialDurationUnit missing from DEFAULT_SETTINGS');
  assert.equal(row.value, 'minutes');
  assert.equal(row.category, 'trial');
  assert.equal(row.isPublic, false);
  assert.equal(row.description, 'Free trial duration unit: minutes | hours | days');
});

test('DEFAULT_SETTINGS includes all three trial keys', () => {
  assert.ok(setting('trialEnabled'));
  assert.ok(setting('trialDurationValue'));
  assert.ok(setting('trialDurationUnit'));
});

test('settingsUpsertArgs create includes full setting and update omits value', () => {
  const settingRow = {
    key: 'trialEnabled',
    value: true,
    category: 'trial',
    description: 'Allow granting free trials to new/eligible users',
    isPublic: false,
  };
  const args = settingsUpsertArgs(settingRow);
  assert.deepEqual(args.where, { key: 'trialEnabled' });
  assert.deepEqual(args.create, settingRow);
  assert.deepEqual(args.update, {
    description: settingRow.description,
    category: settingRow.category,
    isPublic: settingRow.isPublic,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(args.update, 'value'), false);
});
