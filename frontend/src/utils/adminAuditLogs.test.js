import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AUDIT_ACTIONS,
  getAuditChanges,
  getAuditActionColor,
} from './adminAuditLogs.js'

test('exposes toss confirmation and correction audit actions', () => {
  assert.ok(AUDIT_ACTIONS.includes('toss_actual_confirmed'))
  assert.ok(AUDIT_ACTIONS.includes('toss_actual_corrected'))
  assert.match(getAuditActionColor('toss_actual_confirmed'), /green/)
  assert.match(getAuditActionColor('toss_actual_corrected'), /yellow/)
})

test('returns before and after audit changes instead of a legacy changes field', () => {
  assert.deepEqual(getAuditChanges({
    changes: { ignored: true },
    changesBefore: { actualWinner: null },
    changesAfter: { actualWinner: 'Team One' },
  }), {
    before: { actualWinner: null },
    after: { actualWinner: 'Team One' },
  })
  assert.equal(getAuditChanges({ changesBefore: null, changesAfter: null }), null)
})
