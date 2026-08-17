import test from 'node:test'
import assert from 'node:assert/strict'
import { predictGatedFade } from './gatedFadePredictor.js'

const t1 = 'England'
const t2 = 'Pakistan'

function snap({ trap = 'none', moreBetted = t1, pl1 = -50, pl2 = 100, r1 = { back: 200, lay: 100 }, r2 = { back: 80, lay: 120 } } = {}) {
  return {
    teamNames: [t1, t2],
    marketSignals: {
      moreBettedTeam: moreBetted,
      trap: { level: trap },
    },
    teams: {
      [t1]: { pnlIfWins: pl1, trades: [] },
      [t2]: { pnlIfWins: pl2, trades: [] },
    },
    advancedMetricsV2: {
      team1: { ...r1, totalBet: (r1.back || 0) + (r1.lay || 0) },
      team2: { ...r2, totalBet: (r2.back || 0) + (r2.lay || 0) },
    },
  }
}

test('takes fade of moreBetted when trap is none', () => {
  const p = predictGatedFade(snap())
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t2)
  assert.equal(p.publicTeam, t1)
  assert.equal(p.confirms.plGreen, true)
  assert.equal(p.confirms.lowerRatio, true)
})

test('skips pick when trap is high but still names both sides', () => {
  const p = predictGatedFade(snap({ trap: 'high' }))
  assert.equal(p.status, 'skip')
  assert.equal(p.winnerName, t2)
  assert.equal(p.publicTeam, t1)
  assert.equal(p.t1, t1)
  assert.equal(p.t2, t2)
})

test('skips when moreBetted is missing', () => {
  const p = predictGatedFade(snap({ moreBetted: null }))
  assert.equal(p.status, 'skip')
  assert.equal(p.winnerName, null)
})

test('returns null without team names', () => {
  assert.equal(predictGatedFade({}), null)
})
