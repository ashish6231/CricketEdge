import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TRIAL_KEYS,
  hydrateTrialForm,
  hydrateSignupMode,
  filterTrialSettings,
  trialSavePatches,
  formatTrialSaveMessage,
  formatSignupModeMessage,
} from './trialSettingsAdmin.js'

test('hydrateTrialForm uses defaults when rows are missing', () => {
  assert.deepEqual(hydrateTrialForm([]), {
    enabled: true,
    value: 30,
    unit: 'minutes',
  })
})

test('hydrateTrialForm reads SiteSettings-shaped rows by key', () => {
  assert.deepEqual(hydrateTrialForm([
    { key: 'trialEnabled', value: false },
    { key: 'trialDurationValue', value: 2 },
    { key: 'trialDurationUnit', value: 'hours' },
  ]), {
    enabled: false,
    value: 2,
    unit: 'hours',
  })
})

test('hydrateTrialForm keeps defaults for keys that are absent', () => {
  assert.deepEqual(hydrateTrialForm([
    { key: 'maintenanceMode', value: false },
    { key: 'trialDurationUnit', value: 'days' },
  ]), {
    enabled: true,
    value: 30,
    unit: 'days',
  })
})

test('filterTrialSettings removes trial and signup keys from the generic list', () => {
  const filtered = filterTrialSettings([
    { key: 'trialEnabled', value: true },
    { key: 'siteName', value: 'Odds' },
    { key: 'allowSignups', value: false },
    { key: 'signupMode', value: 'admin_only' },
    { key: 'trialDurationValue', value: 30 },
    { key: 'trialDurationUnit', value: 'minutes' },
  ])
  assert.deepEqual(filtered.map(s => s.key), ['siteName'])
  assert.ok(TRIAL_KEYS.has('trialEnabled'))
  assert.ok(TRIAL_KEYS.has('trialDurationValue'))
  assert.ok(TRIAL_KEYS.has('trialDurationUnit'))
})

test('trialSavePatches writes duration keys before trialEnabled', () => {
  assert.deepEqual(trialSavePatches({ enabled: false, value: '2', unit: 'hours' }), [
    { key: 'trialDurationUnit', value: 'hours' },
    { key: 'trialDurationValue', value: 2 },
    { key: 'trialEnabled', value: false },
  ])
})

test('formatTrialSaveMessage describes disable vs duration', () => {
  assert.equal(
    formatTrialSaveMessage({ enabled: false, value: 30, unit: 'minutes' }),
    'Free trial disabled — new users will not get a trial. Active trials keep running until they expire.',
  )
  assert.equal(
    formatTrialSaveMessage({ enabled: true, value: 2, unit: 'hours' }),
    'Free trial enabled for 2 hours — new grants will use this duration. Active trials keep their current end time.',
  )
})

test('hydrateSignupMode reads signupMode', () => {
  assert.equal(hydrateSignupMode([{ key: 'signupMode', value: 'public' }]), 'public')
})

test('hydrateSignupMode defaults admin_only', () => {
  assert.equal(hydrateSignupMode([]), 'admin_only')
})

test('hydrateSignupMode prefers signupMode over legacy allowSignups', () => {
  assert.equal(hydrateSignupMode([
    { key: 'signupMode', value: 'admin_only' },
    { key: 'allowSignups', value: true },
  ]), 'admin_only')
})

test('hydrateSignupMode invalid present mode does not fall through to legacy true', () => {
  assert.equal(hydrateSignupMode([
    { key: 'signupMode', value: 'garbage' },
    { key: 'allowSignups', value: true },
  ]), 'admin_only')
  assert.equal(hydrateSignupMode([
    { key: 'signupMode', value: '' },
    { key: 'allowSignups', value: true },
  ]), 'admin_only')
  assert.equal(hydrateSignupMode([
    { key: 'signupMode', value: null },
    { key: 'allowSignups', value: true },
  ]), 'admin_only')
})

test('hydrateSignupMode migrates legacy allowSignups true to both', () => {
  assert.equal(hydrateSignupMode([{ key: 'allowSignups', value: true }]), 'both')
})

test('hydrateSignupMode migrates legacy allowSignups false to admin_only', () => {
  assert.equal(hydrateSignupMode([{ key: 'allowSignups', value: false }]), 'admin_only')
})

test('formatSignupModeMessage describes each mode', () => {
  assert.match(formatSignupModeMessage('admin_only'), /admin only/i)
  assert.match(formatSignupModeMessage('public'), /public/i)
  assert.match(formatSignupModeMessage('both'), /both/i)
})
