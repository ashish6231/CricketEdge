import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeCrexUpdate, resolveCrexScores } from './crexScore.js'

test('does not double-swap an already aligned reversed fixture', () => {
  const crex = {
    isReversed: true,
    team1Name: 'West Indies Legends', score1: '242/5 (20.0)',
    team2Name: 'South Africa Legends', score2: '145 (18.2)',
  }
  assert.deepEqual(resolveCrexScores(crex, 'West Indies Legends', 'South Africa Legends'), {
    team1Score: '242/5 (20.0)', team2Score: '145 (18.2)', reliable: true,
  })
})

test('maps provider scores by team identity when provider order is reversed', () => {
  const crex = {
    team1Name: 'South Africa Legends', score1: '145 (18.2)',
    team2Name: 'West Indies Legends', score2: '242/5 (20.0)',
  }
  const scores = resolveCrexScores(crex, 'West Indies Legends', 'South Africa Legends')
  assert.equal(scores.team1Score, '242/5 (20.0)')
  assert.equal(scores.team2Score, '145 (18.2)')
})

test('keeps the last real score when a lightweight update omits scores', () => {
  const previous = { team1Name: 'India', score1: '180/4 (20.0)', team2Name: 'Pakistan', score2: '90/2 (10.0)' }
  const merged = mergeCrexUpdate(previous, { statusText: 'Drinks break', score1: null, score2: '0/0' })
  assert.equal(merged.score1, '180/4 (20.0)')
  assert.equal(merged.score2, '90/2 (10.0)')
  assert.equal(merged.statusText, 'Drinks break')
})

test('does not attach positional scores when team identity is unavailable', () => {
  const scores = resolveCrexScores({ score1: '100/2', score2: '50/1' }, 'India', 'Australia')
  assert.deepEqual(scores, { team1Score: null, team2Score: null, reliable: false })
})
