import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeCrexUpdate, orderCrexTeamsByInnings, resolveCrexScores } from './crexScore.js'

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

test('puts the only team with a recorded score first during the first innings', () => {
  const teams = orderCrexTeamsByInnings({ scorecard: {
    team1: { name: 'Chasing XI', score: null },
    team2: { name: 'Batting XI', score: '84-2 9.3' },
  } }, 'Chasing XI', 'Batting XI')
  assert.deepEqual(teams.map(team => team.name), ['Batting XI', 'Chasing XI'])
})

test('uses the toss decision to keep the first-innings side first during a chase', () => {
  const teams = orderCrexTeamsByInnings({ tossText: 'India won the toss and elected to bowl', scorecard: {
    team1: { name: 'India', shortName: 'IND', score: '112-2 13.1' },
    team2: { name: 'Australia', shortName: 'AUS', score: '174-6 20.0' },
  } }, 'India', 'Australia')
  assert.deepEqual(teams.map(team => team.name), ['Australia', 'India'])
})

test('keeps the toss winner first when it chose to bat', () => {
  const teams = orderCrexTeamsByInnings({ scorecard: {
    tossText: 'Toss Winner: WI (opt to Bat)',
    team1: { name: 'India', shortName: 'IND', score: '150-7 20.0' },
    team2: { name: 'West Indies', shortName: 'WI', score: '151-5 19.2' },
  } }, 'India', 'West Indies')
  assert.deepEqual(teams.map(team => team.name), ['West Indies', 'India'])
})

test('uses the chase equation ahead of ambiguous provider ordering', () => {
  const teams = orderCrexTeamsByInnings({ statusText: 'NEP need 190 runs in 216 balls', scorecard: {
    team1: { name: 'Nepal', shortName: 'NEP', score: '67-1 14.0' },
    team2: { name: 'Canada', shortName: 'CAN', score: '256-10 50.0' },
  } }, 'Canada', 'Nepal')
  assert.deepEqual(teams.map(team => team.name), ['Canada', 'Nepal'])
})
