import test from 'node:test'
import assert from 'node:assert/strict'
import { getMatchStartTimestamp, isMatchEnded, isMatchLiveByStart } from './matchTiming.js'

test('scheduled start makes a match live even when provider inPlay is delayed', () => {
  const match = { status: 'upcoming', inPlay: false, startTime: '2026-10-17T10:00:00Z' }
  assert.equal(isMatchLiveByStart(match, Date.parse('2026-10-17T09:59:59Z')), false)
  assert.equal(isMatchLiveByStart(match, Date.parse('2026-10-17T10:00:00Z')), true)
})

test('ended status overrides both time and stale inPlay flag', () => {
  const match = { status: 'completed', inPlay: true, startTime: 1_791_000_000 }
  assert.equal(isMatchEnded(match), true)
  assert.equal(isMatchLiveByStart(match, Date.now()), false)
})

test('abandoned match is not promoted to live after its start time', () => {
  const match = { status: 'abandoned', inPlay: false, startTime: 1_791_000_000 }
  assert.equal(isMatchEnded(match), true)
  assert.equal(isMatchLiveByStart(match, 1_792_000_000_000), false)
})

test('start timestamp accepts seconds, milliseconds and ISO values', () => {
  assert.equal(getMatchStartTimestamp({ startTime: 1_791_000_000 }), 1_791_000_000_000)
  assert.equal(getMatchStartTimestamp({ startTime: 1_791_000_000_000 }), 1_791_000_000_000)
  assert.equal(getMatchStartTimestamp({ startTime: '2026-10-03T11:20:00Z' }), Date.parse('2026-10-03T11:20:00Z'))
})
