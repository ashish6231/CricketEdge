import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readHubStatus,
  writeHubStatus,
  readHubSearch,
  writeHubSearch,
  saveHubScrollTarget,
  consumeHubScrollTarget,
  clearHubScrollTarget,
} from './useHubRestore.js'

function createMemoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
}

test('persists and restores active status tab across mount cycles', () => {
  const storage = createMemoryStorage()
  assert.equal(readHubStatus('cricket', { defaultStatus: 'all', storage }), 'all')

  writeHubStatus('cricket', 'completed', storage)
  assert.equal(readHubStatus('cricket', { defaultStatus: 'all', storage }), 'completed')
  assert.equal(readHubStatus('toss', { defaultStatus: 'all', storage }), 'all')

  assert.equal(readHubStatus('cricket', { defaultStatus: 'all', urlStatus: 'live', storage }), 'live')
  writeHubStatus('cricket', 'invalid_tab', storage)
  assert.equal(readHubStatus('cricket', { defaultStatus: 'all', storage }), 'completed')
})

test('persists search query and consumes scroll/card target once', () => {
  const storage = createMemoryStorage()
  writeHubSearch('toss', 'roma', storage)
  assert.equal(readHubSearch('toss', storage), 'roma')

  saveHubScrollTarget('toss', { scrollTop: 420, matchId: '36360214' }, storage)
  assert.deepEqual(consumeHubScrollTarget('toss', storage), { scrollTop: 420, matchId: '36360214' })
  assert.equal(consumeHubScrollTarget('toss', storage), null)

  saveHubScrollTarget('tennis', { scrollTop: 180, matchId: '99' }, storage)
  clearHubScrollTarget('tennis', storage)
  assert.equal(consumeHubScrollTarget('tennis', storage), null)
})
