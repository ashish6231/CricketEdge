export const TRIAL_KEYS = new Set(['trialEnabled', 'trialDurationValue', 'trialDurationUnit'])
export const SIGNUP_SETTING_KEY = 'allowSignups'
export const CARD_SETTING_KEYS = new Set([...TRIAL_KEYS, SIGNUP_SETTING_KEY])
export const TRIAL_UNITS = ['minutes', 'hours', 'days']
export const TRIAL_FORM_DEFAULTS = { enabled: true, value: 30, unit: 'minutes' }

function findRow(rows, key) {
  return rows.find((s) => s && s.key === key)
}

export function hydrateTrialForm(rows = []) {
  const enabledRow = findRow(rows, 'trialEnabled')
  const valueRow = findRow(rows, 'trialDurationValue')
  const unitRow = findRow(rows, 'trialDurationUnit')

  const enabled = enabledRow == null || enabledRow.value == null
    ? TRIAL_FORM_DEFAULTS.enabled
    : Boolean(enabledRow.value)

  const valueRaw = valueRow == null || valueRow.value == null
    ? TRIAL_FORM_DEFAULTS.value
    : Number(valueRow.value)
  const value = Number.isFinite(valueRaw) ? valueRaw : TRIAL_FORM_DEFAULTS.value

  const unit = unitRow == null || unitRow.value == null || !TRIAL_UNITS.includes(unitRow.value)
    ? TRIAL_FORM_DEFAULTS.unit
    : unitRow.value

  return { enabled, value, unit }
}

export function hydrateAllowSignups(rows = []) {
  const row = findRow(rows, SIGNUP_SETTING_KEY)
  if (row == null || row.value == null) return true
  return Boolean(row.value)
}

export function filterTrialSettings(rows = []) {
  return rows.filter((s) => !CARD_SETTING_KEYS.has(s.key))
}

export function trialSavePatches({ enabled, value, unit }) {
  return [
    { key: 'trialDurationUnit', value: unit },
    { key: 'trialDurationValue', value: Number(value) },
    { key: 'trialEnabled', value: enabled },
  ]
}

export function formatTrialSaveMessage({ enabled, value, unit }) {
  if (!enabled) {
    return 'Free trial disabled — new users will not get a trial. Active trials keep running until they expire.'
  }
  const n = Number(value)
  const amount = Number.isFinite(n) && n > 0 ? n : TRIAL_FORM_DEFAULTS.value
  const safeUnit = TRIAL_UNITS.includes(unit) ? unit : TRIAL_FORM_DEFAULTS.unit
  return `Free trial enabled for ${amount} ${safeUnit} — new grants will use this duration. Active trials keep their current end time.`
}

export function formatAllowSignupsMessage(enabled) {
  return enabled
    ? 'Signups enabled — new users can register.'
    : 'Signups disabled — new registrations and Google first-time signup are blocked.'
}
