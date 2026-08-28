import test from 'node:test'
import assert from 'node:assert/strict'

import {
  lockMatchStartPrediction,
  getMatchStartExitAdvice,
  predictMatchStart,
} from './matchStartPredictor.js'

const teamA = 'Team Alpha'
const teamB = 'Team Beta'

test('locks the first match-start winner and never flips on later polling', () => {
  const first = {
    winnerName: teamA,
    winnerIdx: 0,
    reason: 'Fade Public Money',
    lockedAt: 'match_open',
  }
  const flipped = {
    winnerName: teamB,
    winnerIdx: 1,
    reason: 'Fade Public (MS confirms)',
  }

  const locked = lockMatchStartPrediction(first, null)
  assert.equal(locked.winnerName, teamA)

  const afterFlip = lockMatchStartPrediction(flipped, locked)
  assert.equal(afterFlip.winnerName, teamA)
  assert.equal(afterFlip.reason, 'Fade Public Money')
})

test('allows reason upgrade only when the locked winner stays the same', () => {
  const locked = {
    winnerName: teamA,
    winnerIdx: 0,
    reason: 'Fade Public Money',
    lockedAt: 'match_open',
  }
  const strongerSameWinner = {
    winnerName: teamA,
    winnerIdx: 0,
    reason: 'Fade Public (MS confirms)',
    confidence: { label: 'Very High' },
  }

  const updated = lockMatchStartPrediction(strongerSameWinner, locked)
  assert.equal(updated.winnerName, teamA)
  assert.equal(updated.reason, 'Fade Public (MS confirms)')
})

test('flags heavy underdog fade before entry', () => {
  const snap = {
    teamNames: [teamA, teamB],
    teams: { [teamA]: { trades: [] }, [teamB]: { trades: [] } },
    preMatchVolume: { team1: { back: 5000, lay: 0 }, team2: { back: 100, lay: 0 } },
    preMatchTotalBets: { team1: 5000, team2: 100 },
    marketSignals: {
      moreBettedTeam: teamB,
      prediction: { prediction: 'No Prediction' },
    },
  }

  snap.teams[teamA].trades = [{ type: 'back', price: 4.5, updatedAt: 1 }]
  snap.teams[teamB].trades = [{ type: 'back', price: 0.32, updatedAt: 2 }]

  const prediction = predictMatchStart(snap)
  assert.equal(prediction.winnerName, teamA)
  assert.equal(prediction.extremeDogFade, true)
})

test('shows live exit advice when favorite is stuck near 30p', () => {
  const advice = getMatchStartExitAdvice({
    lockedPick: { winnerName: teamA },
    inPlay: true,
    pickBackOdds: 3.2,
    opponentBackOdds: 0.3,
  })

  assert.ok(advice)
  assert.match(advice.message, /30p/i)
})
