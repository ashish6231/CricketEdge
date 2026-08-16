const TRIAL_SETTING_KEYS = {
  enabled: 'trialEnabled',
  value: 'trialDurationValue',
  unit: 'trialDurationUnit',
};
const TRIAL_DEFAULTS = { enabled: true, value: 30, unit: 'minutes' };
const TRIAL_UNITS = ['minutes', 'hours', 'days'];
const MAX_TRIAL_MINUTES = 525600; // 365 days

function singularUnit(unit) {
  if (unit === 'minutes') return 'minute';
  if (unit === 'hours') return 'hour';
  return 'day';
}

function formatTrialLabel(value, unit) {
  return `${value}-${singularUnit(unit)}`;
}

function toMinutes(value, unit) {
  const n = Number(value);
  if (unit === 'hours') return n * 60;
  if (unit === 'days') return n * 60 * 24;
  return n;
}

function parseTrialConfig(rows = []) {
  const map = {};
  for (const row of rows) {
    if (row && row.key != null) map[row.key] = row.value;
  }
  const enabled = map.trialEnabled == null ? TRIAL_DEFAULTS.enabled : Boolean(map.trialEnabled);
  const valueRaw = map.trialDurationValue == null ? TRIAL_DEFAULTS.value : Number(map.trialDurationValue);
  const value = Number.isFinite(valueRaw) && valueRaw >= 1 ? Math.floor(valueRaw) : TRIAL_DEFAULTS.value;
  const unit = TRIAL_UNITS.includes(map.trialDurationUnit) ? map.trialDurationUnit : TRIAL_DEFAULTS.unit;
  const minutes = toMinutes(value, unit);
  return { enabled, value, unit, minutes, label: formatTrialLabel(value, unit) };
}

function isPositiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1;
}

function validateTrialDuration(value, unit) {
  if (!TRIAL_UNITS.includes(unit)) return { ok: false, message: 'Invalid trialDurationUnit' };
  if (!isPositiveInteger(value)) {
    return { ok: false, message: 'trialDurationValue must be an integer >= 1' };
  }
  const whole = Number(value);
  const minutes = toMinutes(whole, unit);
  if (minutes > MAX_TRIAL_MINUTES) {
    return { ok: false, message: 'Trial duration cannot exceed 365 days' };
  }
  return { ok: true, value: whole, unit, minutes };
}

function validateTrialSetting(key, value) {
  if (key === 'trialEnabled') {
    if (typeof value !== 'boolean') return { ok: false, message: 'trialEnabled must be boolean' };
    return { ok: true, value };
  }
  if (key === 'trialDurationUnit') {
    if (!TRIAL_UNITS.includes(value)) return { ok: false, message: 'Invalid trialDurationUnit' };
    return { ok: true, value };
  }
  if (key === 'trialDurationValue') {
    if (!isPositiveInteger(value)) {
      return { ok: false, message: 'trialDurationValue must be an integer >= 1' };
    }
    const whole = Number(value);
    // Soft max assuming worst unit (days) so single-key PATCH stays safe
    if (toMinutes(whole, 'days') > MAX_TRIAL_MINUTES) {
      return { ok: false, message: 'Trial duration cannot exceed 365 days' };
    }
    return { ok: true, value: whole };
  }
  return { ok: true, value };
}

function getTrialExpiresAt(from = new Date(), minutes = TRIAL_DEFAULTS.value) {
  const expires = new Date(from);
  expires.setMinutes(expires.getMinutes() + minutes);
  return expires;
}

module.exports = {
  TRIAL_SETTING_KEYS,
  TRIAL_DEFAULTS,
  TRIAL_UNITS,
  MAX_TRIAL_MINUTES,
  parseTrialConfig,
  validateTrialSetting,
  validateTrialDuration,
  formatTrialLabel,
  getTrialExpiresAt,
  toMinutes,
};
