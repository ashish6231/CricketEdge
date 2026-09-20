export const TRIAL_KEYS = new Set(['trialEnabled', 'trialDurationValue', 'trialDurationUnit'])
export const SIGNUP_MODE_KEY = 'signupMode'
export const SIGNUP_SETTING_KEY = 'allowSignups'
export const SIGNUP_MODES = ['admin_only', 'public', 'both']
export const DEFAULT_SIGNUP_MODE = 'admin_only'

export const SITE_MODE_KEY = 'siteMode'
export const SITE_MODES = ['paid', 'free']
export const DEFAULT_SITE_MODE = 'paid'

export const CARD_SETTING_KEYS = new Set([...TRIAL_KEYS, SIGNUP_MODE_KEY, SIGNUP_SETTING_KEY, SITE_MODE_KEY])
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
    : enabledRow.value === false || enabledRow.value === 'false' || enabledRow.value === 0
      ? false
      : true

  const valueRaw = valueRow == null || valueRow.value == null
    ? TRIAL_FORM_DEFAULTS.value
    : Number(valueRow.value)
  const value = Number.isFinite(valueRaw) ? valueRaw : TRIAL_FORM_DEFAULTS.value

  const unit = unitRow == null || unitRow.value == null || !TRIAL_UNITS.includes(unitRow.value)
    ? TRIAL_FORM_DEFAULTS.unit
    : unitRow.value

  return { enabled, value, unit }
}

export const SIGNUP_MODE_LABELS = {
  admin_only: { label: 'Admin only', description: 'Superadmin creates accounts' },
  public: { label: 'Public', description: 'Anyone can register' },
  both: { label: 'Both', description: 'Public register + admin create' },
}

export const SIGNUP_MODE_OPTIONS = SIGNUP_MODES.map((value) => ({
  value,
  ...SIGNUP_MODE_LABELS[value],
}))

export function hydrateSignupMode(rows = []) {
  const signupModeRow = findRow(rows, SIGNUP_MODE_KEY)
  if (signupModeRow) {
    const raw = signupModeRow.value
    if (typeof raw === 'string' && SIGNUP_MODES.includes(raw)) return raw
    return DEFAULT_SIGNUP_MODE
  }

  const allowSignupsRow = findRow(rows, SIGNUP_SETTING_KEY)
  if (allowSignupsRow != null && allowSignupsRow.value != null) {
    return Boolean(allowSignupsRow.value) ? 'both' : 'admin_only'
  }
  return DEFAULT_SIGNUP_MODE
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

export function formatSignupModeMessage(mode) {
  switch (mode) {
    case 'public':
      return 'Signup mode: Public — anyone can register via email or Google.'
    case 'both':
      return 'Signup mode: Both — public registration and Superadmin user creation are allowed.'
    case 'admin_only':
    default:
      return 'Signup mode: Admin only — new accounts are created by Superadmin only.'
  }
}

export const SITE_MODE_LABELS = {
  paid: {
    label: 'Paid Mode (Subscription Required)',
    description: 'Current behavior: Ended matches are free. Live & upcoming matches require an active Pro subscription.',
  },
  free: {
    label: 'Free Mode (No Subscription Needed)',
    description: 'Free access: Ended matches are free. Live & upcoming matches require only login/signup (no subscription needed).',
  },
}

export const SITE_MODE_OPTIONS = SITE_MODES.map((value) => ({
  value,
  ...SITE_MODE_LABELS[value],
}))

export function hydrateSiteMode(rows = []) {
  const row = findRow(rows, SITE_MODE_KEY)
  if (row && typeof row.value === 'string' && SITE_MODES.includes(row.value)) {
    return row.value
  }
  return DEFAULT_SITE_MODE
}

export function formatSiteModeMessage(mode) {
  if (mode === 'free') {
    return 'Website is in Free Mode — users can view live & upcoming matches just by logging in without any subscription. Ended matches are open to everyone.'
  }
  return 'Website is in Paid Mode — users must have an active Pro subscription to view live & upcoming matches.'
}

