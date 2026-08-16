import test from 'node:test'
import assert from 'node:assert/strict'
import { computeFavFlipRisk } from './favFlipRisk.js'

function snap({
  t1 = 'Team A',
  t2 = 'Team B',
  bookieFav = 'Team B',
  trap = 'none',
  m1 = { back: 200, lay: 400, totalBet: 600 },
  m2 = { back: 900, lay: 100, totalBet: 1000 },
  exp1 = 300,
  exp2 = -100,
  trades1 = [],
  trades2 = [],
} = {}) {
  return {
    teamNames: [t1, t2],
    advancedMetricsV2: { team1: m1, team2: m2 },
    bookmakerExposure: {
      team1: { netExposure: exp1 },
      team2: { netExposure: exp2 },
    },
    marketSignals: {
      bookieFavouriteOutcome: bookieFav,
      trap: { level: trap },
    },
    teams: {
      [t1]: { trades: trades1 },
      [t2]: { trades: trades2 },
    },
  }
}

function tradesFalling(start, end, n = 6) {
  const out = []
  for (let i = 0; i < n; i++) {
    const price = start + ((end - start) * i) / (n - 1)
    out.push({ type: 'back', price, size: 10, updatedAt: 1000 + i })
  }
  return out
}

test('high flip risk when PL-safe team disagrees with bookie fav and threat odds soft', () => {
  const risk = computeFavFlipRisk(
    snap({
      bookieFav: 'Team B',
      trap: 'high',
      trades1: tradesFalling(2.1, 2.2), // safe side drifting up
      trades2: tradesFalling(2.0, 1.55), // threat becoming fav
    }),
    { pl1: 500, pl2: -400 },
  )
  assert.equal(risk.safeTeam, 'Team A')
  assert.equal(risk.threatTeam, 'Team B')
  assert.equal(risk.tier, 'high')
  assert.ok(risk.reasons.length >= 2)
})

test('low flip risk when bookie fav agrees with PL-safe side and no opposite momentum', () => {
  const risk = computeFavFlipRisk(
    snap({
      bookieFav: 'Team A',
      m1: { back: 800, lay: 200, totalBet: 1000 },
      m2: { back: 200, lay: 150, totalBet: 350 },
      exp1: 400,
      exp2: 50,
      trades1: tradesFalling(1.9, 1.7),
      trades2: tradesFalling(2.2, 2.3),
    }),
    { pl1: 800, pl2: -700 },
  )
  assert.equal(risk.safeTeam, 'Team A')
  assert.ok(risk.tier === 'low' || risk.score <= 2)
})

test('returns null without team names', () => {
  assert.equal(computeFavFlipRisk({}), null)
})
