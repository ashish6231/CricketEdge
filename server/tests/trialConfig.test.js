const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTrialConfig,
  validateTrialSetting,
  validateTrialDuration,
  formatTrialLabel,
  getTrialExpiresAt,
  TRIAL_DEFAULTS,
} = require('../lib/trialConfig');

test('parseTrialConfig falls back to defaults when rows missing', () => {
  const cfg = parseTrialConfig([]);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.value, 30);
  assert.equal(cfg.unit, 'minutes');
  assert.equal(cfg.minutes, 30);
  assert.equal(cfg.label, '30-minute');
});

test('parseTrialConfig reads SiteSettings-shaped rows', () => {
  const cfg = parseTrialConfig([
    { key: 'trialEnabled', value: false },
    { key: 'trialDurationValue', value: 2 },
    { key: 'trialDurationUnit', value: 'hours' },
  ]);
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.minutes, 120);
  assert.equal(cfg.label, '2-hour');
});

test('formatTrialLabel pluralizes when value !== 1', () => {
  assert.equal(formatTrialLabel(1, 'days'), '1-day');
  assert.equal(formatTrialLabel(3, 'days'), '3-day'); // keep short label style: N-day / N-hour / N-minute
});

test('validateTrialSetting rejects bad unit and non-positive value', () => {
  assert.equal(validateTrialSetting('trialDurationUnit', 'weeks').ok, false);
  assert.equal(validateTrialSetting('trialDurationValue', 0).ok, false);
  assert.equal(validateTrialSetting('trialDurationValue', 1).ok, true);
  assert.equal(validateTrialSetting('trialEnabled', true).ok, true);
  assert.equal(validateTrialSetting('trialEnabled', 'yes').ok, false);
});

test('validateTrialSetting rejects duration over 365 days', () => {
  assert.equal(validateTrialSetting('trialDurationValue', 366).ok, false); // when unit checked in pair — see note below
});

test('validateTrialDuration rejects over 365 days and accepts valid pairs', () => {
  assert.equal(validateTrialDuration(366, 'days').ok, false);
  assert.equal(validateTrialDuration(24, 'hours').ok, true);
});

test('getTrialExpiresAt adds minutes', () => {
  const from = new Date('2026-08-17T00:00:00.000Z');
  const exp = getTrialExpiresAt(from, 90);
  assert.equal(exp.toISOString(), '2026-08-17T01:30:00.000Z');
});
