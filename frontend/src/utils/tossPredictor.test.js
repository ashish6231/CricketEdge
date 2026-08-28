import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { predictTossWinner } from './tossPredictor.js'

const t1 = 'England'
const t2 = 'Pakistan'

function teamEq(a, b) {
  const na = String(a || '').trim().toLowerCase()
  const nb = String(b || '').trim().toLowerCase()
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

function snap({
  names = [t1, t2],
  lay1,
  lay2,
  back1 = 100,
  back2 = 100,
  total1,
  total2,
  trades1,
  trades2,
  trap = 'none',
  stronger,
  bookieFav = 'balanced',
}) {
  const [n1, n2] = names
  return {
    teamNames: names,
    advancedMetricsV2: {
      team1: { back: back1, lay: lay1, totalBet: total1 },
      team2: { back: back2, lay: lay2, totalBet: total2 },
    },
    syntheticSupport: {
      teamA: { tradeCount: trades1 },
      teamB: { tradeCount: trades2 },
      strongerTeam: stronger,
      supportRatio: 2,
    },
    marketSignals: {
      bookieFavouriteOutcome: bookieFav,
      trap: { level: trap },
    },
    teams: {
      [n1]: { trades: [] },
      [n2]: { trades: [] },
    },
  }
}

test('picks Smart Money Inflow leader when Back Volume has clear lead', () => {
  const pred = predictTossWinner(snap({
    names: ['Trinbago Knight Riders', 'St. Lucia Kings'],
    back1: 1610,
    back2: 830,
    lay1: 462,
    lay2: 690,
  }))
  assert.equal(pred.winnerName, 'Trinbago Knight Riders')
  assert.equal(pred.verdictTag, 'SMART INFLOW LEADER')
})

test('triggers Overload Trap Fade when one team has 92%+ one-sided load with negative P/L', () => {
  const pred = predictTossWinner(snap({
    names: ['Belfast Wolves', 'Dublin Guardians'],
    back1: 727,
    back2: 65,
    lay1: 190,
    lay2: 0,
  }))
  assert.equal(pred.winnerName, 'Dublin Guardians')
  assert.equal(pred.verdictTag, 'OVERLOAD TRAP FADE 🚨')
})

test('triggers Zero-Back Bookie Safe when one team has 0 Back', () => {
  const pred = predictTossWinner(snap({
    names: ['Nellai Royal Kings', 'Madurai Panthers'],
    back1: 733,
    back2: 0,
    lay1: 594,
    lay2: 455,
  }))
  assert.equal(pred.winnerName, 'Madurai Panthers')
  assert.equal(pred.verdictTag, 'BOOKIE SAFE ZERO-BACK')
})

test('verified toss dataset: achieves >= 90% accuracy across labeled records', () => {
  const dataPath = join(dirname(fileURLToPath(import.meta.url)), '../../../server/data/toss_dataset.json')
  const file = JSON.parse(readFileSync(dataPath, 'utf8'))
  const verified = file.records.filter((r) => r.status === 'verified' && r.actualWinner)
  assert.ok(verified.length >= 20, `expected >= 20 labeled records, got ${verified.length}`)

  let hits = 0
  for (const r of verified) {
    const pred = predictTossWinner(r.snapshot)
    if (pred?.winnerName && teamEq(pred.winnerName, r.actualWinner)) {
      hits++
    }
  }
  const accuracy = (hits / verified.length) * 100
  assert.ok(accuracy >= 90, `expected accuracy >= 90%, got ${accuracy.toFixed(1)}% (${hits}/${verified.length})`)
})
