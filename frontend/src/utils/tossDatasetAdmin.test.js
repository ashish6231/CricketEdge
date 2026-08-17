import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTossDatasetQuery,
  parseTossDatasetList,
  formatCaptureSummary,
  hasUsableSnapshot,
  isPredictionHit,
} from './tossDatasetAdmin.js'

test('buildTossDatasetQuery encodes filters', () => {
  const q = buildTossDatasetQuery({
    status: 'pending',
    page: 2,
    limit: 20,
    search: 'Salem',
  })
  assert.equal(q, 'status=pending&page=2&limit=20&search=Salem')
})

test('parseTossDatasetList uses records not data', () => {
  const parsed = parseTossDatasetList({
    success: true,
    records: [{ matchId: 'm1', matchName: 'Salem vs Chennai' }],
    data: [{ matchId: 'wrong' }],
    pagination: { page: 1, limit: 20, total: 1, pages: 1 },
  })
  assert.deepEqual(parsed.records, [{ matchId: 'm1', matchName: 'Salem vs Chennai' }])
  assert.deepEqual(parsed.pagination, { page: 1, limit: 20, total: 1, pages: 1 })
})

test('parseTossDatasetList defaults missing records and pagination', () => {
  const parsed = parseTossDatasetList({})
  assert.deepEqual(parsed.records, [])
  assert.deepEqual(parsed.pagination, { page: 1, limit: 20, total: 0, pages: 0 })
})

test('hasUsableSnapshot rejects null, arrays, and accepts objects', () => {
  assert.equal(hasUsableSnapshot(null), false)
  assert.equal(hasUsableSnapshot([]), false)
  assert.equal(hasUsableSnapshot({ teamNames: ['A', 'B'] }), true)
})

test('formatCaptureSummary shows captured/skipped/failed counts', () => {
  assert.equal(
    formatCaptureSummary({ scanned: 10, captured: 2, skipped: 7, failed: 1 }),
    '2 captured / 7 skipped / 1 failed',
  )
})

test('isPredictionHit matches team names loosely', () => {
  assert.equal(isPredictionHit('India', 'India'), true)
  assert.equal(isPredictionHit('Ireland', 'Afghanistan'), false)
  assert.equal(isPredictionHit(null, 'India'), null)
})
