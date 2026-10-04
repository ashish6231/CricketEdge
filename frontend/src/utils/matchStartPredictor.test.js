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


test('historical-fit match-start mode is explicit and does not present a calibrated probability', () => {
  const snap = {
    teamNames: [teamA, teamB], competitionName: 'Unknown league',
    preMatchVolume: { team1: {back: 100, lay: 20}, team2: {back: 10, lay: 3} },
    preMatchPnl: {team1: -50, team2: 75},
  }
  const prediction = predictMatchStart(snap, {mode: 'historical-fit'})
  assert.equal(prediction.timing, 'historical_fit')
  assert.equal(prediction.validation, 'in-sample')
  assert.equal(prediction.confidence.calibrated, false)
  assert.equal(prediction.confidence.pct, 'Uncalibrated')
  assert.equal(predictMatchStart({...snap, preMatchVolume: {team1: {back:0, lay:0},team2: {back:0,lay:0}}}, {mode: 'historical-fit'}), null)
})


test('empty frozen start volumes cannot be replaced by later trade flow', () => {
 const snap={teamNames:[teamA,teamB],preMatchVolume:{team1:{back:0,lay:0},team2:{back:0,lay:0}},teams:{[teamA]:{trades:[{type:'back',size:10000,price:1.01,updatedAt:999}]},[teamB]:{trades:[]}}}
 assert.equal(predictMatchStart(snap),null)
})


test('normal match-start and backend agree for every retained match and league', async () => {
  const {readFileSync} = await import('node:fs')
  const {createRequire} = await import('node:module')
  const require = createRequire(import.meta.url)
  const {predictMatchWinner} = require('../../../server/utils/matchWinnerPredictor.js')
  const records = JSON.parse(readFileSync(new URL('../../../server/data/match_dataset.json', import.meta.url))).records
  for (const r of records) {
    const snapshot = {...r.snapshot, competitionName: r.competitionName}
    const backend = predictMatchWinner(snapshot), frontend = predictMatchStart(snapshot)
    assert.equal(frontend?.winnerName, backend?.winner, `Different picks: ${r.matchId}`)
    assert.equal(frontend?.algorithmId, backend?.algorithmId)
    if (frontend) assert.equal(frontend.modelScope, 'rules')
  }
})

test('an obsolete algorithm lock is discarded while the current algorithm stays locked', () => {
  const current = {winnerName: teamA, predictorVersion: 'normal-v3', algorithmId: 'league-a'}
  const obsolete = {winnerName: teamB, predictorVersion: 'historical-v2', algorithmId: 'league-b'}
  assert.equal(lockMatchStartPrediction(current, obsolete).winnerName, teamA)
  assert.equal(lockMatchStartPrediction({...current, winnerName: teamB}, current).winnerName, teamA)
})

test('a changed league profile invalidates a previous prediction lock', () => {
  const current = { winnerName: teamA, predictorVersion: 'v5', algorithmId: 'league-a', profileVersion: 'profile-new' }
  const previous = { ...current, winnerName: teamB, profileVersion: 'profile-old' }
  assert.equal(lockMatchStartPrediction(current, previous).winnerName, teamA)
  assert.equal(lockMatchStartPrediction({ ...current, winnerName: teamB }, current).winnerName, teamA)
})
