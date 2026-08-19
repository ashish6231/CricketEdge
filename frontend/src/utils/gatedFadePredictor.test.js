import test from 'node:test'
import assert from 'node:assert/strict'
import { predictGatedFade } from './gatedFadePredictor.js'

const t1 = 'England'
const t2 = 'Pakistan'

function snap({
  trap = 'none',
  moreBetted = t1,
  pl1 = -50,
  pl2 = 100,
  r1 = { back: 200, lay: 100 },
  r2 = { back: 80, lay: 120 },
  exp1 = 80,
  exp2 = -40,
  bets1 = null,
  bets2 = null,
  money1 = null,
  money2 = null,
} = {}) {
  const bookmakerExposure = {}
  if (typeof exp1 === 'number') bookmakerExposure.team1 = { teamName: t1, netExposure: exp1 }
  if (typeof exp2 === 'number') bookmakerExposure.team2 = { teamName: t2, netExposure: exp2 }
  const t1Trades = typeof money1 === 'number' ? [{ type: 'back', size: money1, price: 2 }] : []
  const t2Trades = typeof money2 === 'number' ? [{ type: 'back', size: money2, price: 2 }] : []
  const deepMetrics = {}
  if (typeof bets1 === 'number' || typeof bets2 === 'number') {
    deepMetrics.totals = {
      ...(typeof bets1 === 'number' ? { totalBetTeam1: bets1 } : {}),
      ...(typeof bets2 === 'number' ? { totalBetTeam2: bets2 } : {}),
    }
  }
  return {
    teamNames: [t1, t2],
    marketSignals: {
      moreBettedTeam: moreBetted,
      trap: { level: trap },
    },
    teams: {
      [t1]: { pnlIfWins: pl1, totalBet: bets1 ?? 0, trades: t1Trades },
      [t2]: { pnlIfWins: pl2, totalBet: bets2 ?? 0, trades: t2Trades },
    },
    advancedMetricsV2: {
      team1: { ...r1, totalBet: (r1.back || 0) + (r1.lay || 0) },
      team2: { ...r2, totalBet: (r2.back || 0) + (r2.lay || 0) },
    },
    bookmakerExposure,
    ...(Object.keys(deepMetrics).length ? { deepMetrics } : {}),
  }
}

test('more money beats fewer bets when those signals disagree', () => {
  const p = predictGatedFade(snap({
    exp1: 30,
    exp2: 90,
    pl1: 100,
    pl2: 80,
    bets1: 3000,
    bets2: 6662,
    money1: 18,
    money2: 82,
  }))
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t2)
  assert.equal(p.moreMoneyTeam, t2)
  assert.equal(p.fewerBetsTeam, t1)
  assert.equal(p.confirms.moreMoney, true)
  assert.equal(p.confirms.fewerBets, false)
  assert.match(p.reason, /money/i)
})

test('picks the team with fewer total bets and more money', () => {
  const p = predictGatedFade(snap({
    exp1: 30,
    exp2: 90,
    pl1: 100,
    pl2: 80,
    bets1: 6662,
    bets2: 3000,
    money1: 18,
    money2: 82,
  }))
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t2)
  assert.equal(p.moreMoneyTeam, t2)
  assert.equal(p.fewerBetsTeam, t2)
  assert.equal(p.confirms.moreMoney, true)
  assert.equal(p.confirms.fewerBets, true)
  assert.match(p.reason, /money/i)
})

test('does not pick neg-exp team when they are in P/L loss and the other is in profit', () => {
  const p = predictGatedFade(snap({
    exp1: -79,
    exp2: 672,
    pl1: -496,
    pl2: 3165,
    moreBetted: t1,
  }))
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t2)
  assert.equal(p.plGreenTeam, null)
  assert.equal(p.confirms.plProfit, true)
  assert.match(p.reason, /profit/i)
})

test('picks the negative-exposure team when the other is positive', () => {
  const p = predictGatedFade(snap())
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t2)
  assert.equal(p.publicTeam, t1)
  assert.equal(p.confirms.negExposure, true)
  assert.equal(p.fadeExposure, -40)
})

test('picks the negative team even if that team is the public side', () => {
  const p = predictGatedFade(snap({ exp1: -80, exp2: 40, pl1: 100, pl2: -50 }))
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t1)
  assert.equal(p.confirms.negExposure, true)
  assert.equal(p.fadeExposure, -80)
})

test('when both exposures are negative, picks the higher P/L team', () => {
  const p = predictGatedFade(snap({
    exp1: -200,
    exp2: -40,
    pl1: 120,
    pl2: 20,
  }))
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t1)
  assert.match(p.reason, /p\/l/i)
})

test('when both exposures are negative, higher P/L wins even if that side is less negative', () => {
  const p = predictGatedFade(snap({
    exp1: -40,
    exp2: -200,
    pl1: 180,
    pl2: 10,
  }))
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t1)
})

test('when both exposures are negative and P/L is tied, picks lower (more negative) exposure', () => {
  const p = predictGatedFade(snap({
    exp1: -200,
    exp2: -40,
    pl1: 50,
    pl2: 50,
  }))
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t1)
  assert.match(p.reason, /exposure/i)
})

test('when both exposures are positive, fades the lower-exposure team', () => {
  const p = predictGatedFade(snap({ exp1: 80, exp2: 40, pl1: -50, pl2: -20 }))
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t2)
  assert.equal(p.fadeExposure, 40)
  assert.match(p.reason, /lower exposure/i)
})

test('when both exposures are positive, lower exposure wins even if that is team 1', () => {
  const p = predictGatedFade(snap({ exp1: 30, exp2: 90, pl1: -10, pl2: -20 }))
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t1)
})

test('skips when an exposure is missing', () => {
  const p = predictGatedFade(snap({ exp1: 80, exp2: null }))
  assert.equal(p.status, 'skip')
  assert.equal(p.confirms.negExposure, false)
})

test('skips pick when trap is high but still names the exposure pick', () => {
  const p = predictGatedFade(snap({ trap: 'high' }))
  assert.equal(p.status, 'skip')
  assert.equal(p.winnerName, t2)
  assert.equal(p.publicTeam, t1)
  assert.equal(p.t1, t1)
  assert.equal(p.t2, t2)
})

test('still picks from exposure when moreBetted is missing', () => {
  const p = predictGatedFade(snap({ moreBetted: null }))
  assert.equal(p.status, 'take')
  assert.equal(p.winnerName, t2)
  assert.equal(p.publicTeam, null)
})

test('P/L green is the neg-exp team with positive P/L, even if that P/L is lower', () => {
  const p = predictGatedFade(snap({
    exp1: 200,
    exp2: -6300,
    pl1: 800,
    pl2: 120,
  }))
  assert.equal(p.winnerName, t2)
  assert.equal(p.plGreenTeam, t2)
  assert.equal(p.confirms.plGreen, true)
})

test('P/L green is null when the negative-exposure team is not in profit', () => {
  const p = predictGatedFade(snap({
    exp1: 200,
    exp2: -6300,
    pl1: 800,
    pl2: -50,
  }))
  assert.equal(p.winnerName, t1)
  assert.equal(p.plGreenTeam, null)
  assert.equal(p.confirms.plGreen, false)
})

test('maps exposure by team name, not bookmaker slot order', () => {
  const s = snap({ exp1: 80, exp2: -40 })
  s.bookmakerExposure = {
    team1: { teamName: t2, netExposure: -40 },
    team2: { teamName: t1, netExposure: 80 },
  }
  const p = predictGatedFade(s)
  assert.equal(p.t1Exposure, 80)
  assert.equal(p.t2Exposure, -40)
  assert.equal(p.winnerName, t2)
})

test('returns null without team names', () => {
  assert.equal(predictGatedFade({}), null)
})
