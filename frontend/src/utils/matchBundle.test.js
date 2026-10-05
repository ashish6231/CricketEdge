import test from 'node:test'
import assert from 'node:assert/strict'
import { hasTossSnapshot, isCompleteMatchBundle } from './matchBundle.js'

test('lightweight match notification is not treated as a complete bundle', () => {
  assert.equal(isCompleteMatchBundle({ matchId: '123' }), false)
})

test('full bundle with explicit market keys is accepted', () => {
  assert.equal(isCompleteMatchBundle({ matchId: '123', cricket: null, toss: null, session: null, crex: null }), true)
})

test('toss snapshot must exist and be error-free', () => {
  assert.equal(hasTossSnapshot({ matchId: '123', toss: { teamNames: ['A', 'B'] } }), true)
  assert.equal(hasTossSnapshot({ matchId: '123', toss: { error: 'missing' } }), false)
  assert.equal(hasTossSnapshot({ matchId: '123' }), false)
})
