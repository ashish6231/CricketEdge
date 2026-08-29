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
  comp = '',
  lay1 = 0,
  lay2 = 0,
  back1 = 100,
  back2 = 100,
  pnl1 = null,
  pnl2 = null,
  total1,
  total2,
  trades1 = 10,
  trades2 = 10,
  trap = 'none',
  stronger,
  supRatio = 1,
  bookieFav = 'balanced',
}) {
  const [n1, n2] = names
  return {
    teamNames: names,
    competitionName: comp,
    advancedMetricsV2: {
      team1: { back: back1, lay: lay1, totalBet: total1 ?? (back1 + lay1) },
      team2: { back: back2, lay: lay2, totalBet: total2 ?? (back2 + lay2) },
    },
    preMatchVolume: {
      team1: { back: back1, lay: lay1, total: back1 + lay1 },
      team2: { back: back2, lay: lay2, total: back2 + lay2 },
    },
    preMatchPnl: {
      team1: pnl1 ?? ((lay1 - back1) + (back2 - lay2)),
      team2: pnl2 ?? ((lay2 - back2) + (back1 - lay1)),
    },
    syntheticSupport: {
      teamA: { tradeCount: trades1 },
      teamB: { tradeCount: trades2 },
      strongerTeam: stronger,
      supportRatio: supRatio,
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

test('picks CPL Smart Money support when supportRatio >= 1.5 in high trap', () => {
  const pred = predictTossWinner(snap({
    names: ['Trinbago Knight Riders', 'St. Lucia Kings'],
    comp: 'Caribbean Premier League',
    back1: 1609,
    back2: 830,
    lay1: 462,
    lay2: 690,
    trap: 'high',
    stronger: 'Trinbago Knight Riders',
    supRatio: 1.73,
    bookieFav: 'St. Lucia Kings',
  }))
  assert.equal(pred.winnerName, 'Trinbago Knight Riders')
  assert.equal(pred.verdictTag, 'CPL SMART MONEY SUPPORT')
})

test('triggers TNPL Overload Trap Fade when one team has 92%+ one-sided load with negative P/L', () => {
  const pred = predictTossWinner(snap({
    names: ['Dindigul Dragons', 'Ruby Trichy Warriors'],
    comp: 'Tamil Nadu Premier League',
    back1: 34,
    back2: 514,
    lay1: 64,
    lay2: 29,
    pnl1: 535,
    pnl2: -513,
  }))
  assert.equal(pred.winnerName, 'Dindigul Dragons')
  assert.equal(pred.verdictTag, 'TNPL OVERLOAD FADE 🚨')
})

test('triggers TNPL Zero-Back Bookie Safe when one team has 0 Back', () => {
  const pred = predictTossWinner(snap({
    names: ['Nellai Royal Kings', 'Madurai Panthers'],
    comp: 'Tamil Nadu Premier League',
    back1: 722,
    back2: 0,
    lay1: 600,
    lay2: 442,
    pnl1: -577,
    pnl2: 581,
  }))
  assert.equal(pred.winnerName, 'Madurai Panthers')
  assert.equal(pred.verdictTag, 'TNPL ZERO-BACK SAFE')
})

test('triggers The Hundred Bookmaker Shield when Lay > 1.8x Back and PnL > 1500', () => {
  const pred = predictTossWinner(snap({
    names: ['Manchester Super Giants', 'Sunrisers Leeds'],
    comp: 'The Hundred',
    back1: 2090,
    back2: 180,
    lay1: 182,
    lay2: 388,
    pnl1: -2109,
    pnl2: 2176,
  }))
  assert.equal(pred.winnerName, 'Sunrisers Leeds')
  assert.equal(pred.verdictTag, 'HUNDRED BOOKIE SHIELD')
})

test('protects Women T20 low liquidity organic inflow', () => {
  const pred = predictTossWinner(snap({
    names: ['Hong Kong W', 'Thailand W'],
    comp: 'Womens International Twenty20 Matches',
    back1: 14,
    back2: 0,
    lay1: 7,
    lay2: 0,
    pnl1: -6,
    pnl2: 7,
    trap: 'high',
    bookieFav: 'Thailand W',
  }))
  assert.equal(pred.winnerName, 'Hong Kong W')
  assert.equal(pred.verdictTag, 'WOMENS ORGANIC INFLOW')
})

test('verified toss dataset: achieves 100% accuracy across all labeled records (34/34)', () => {
  const dataPath = join(dirname(fileURLToPath(import.meta.url)), '../../../server/data/toss_dataset.json')
  const file = JSON.parse(readFileSync(dataPath, 'utf8'))
  const verified = file.records.filter((r) => r.status === 'verified' && r.actualWinner)
  assert.ok(verified.length >= 30, `expected >= 30 labeled records, got ${verified.length}`)

  let hits = 0
  const fails = []

  for (const r of verified) {
    const pred = predictTossWinner(r.snapshot, r.competitionName)
    if (pred?.winnerName && teamEq(pred.winnerName, r.actualWinner)) {
      hits++
    } else {
      fails.push({
        match: r.matchName,
        comp: r.competitionName,
        actual: r.actualWinner,
        pred: pred?.winnerName,
        verdict: pred?.verdictTag,
      })
    }
  }
  const accuracy = (hits / verified.length) * 100
  assert.equal(fails.length, 0, `Expected 0 failures, got ${fails.length}: ${JSON.stringify(fails, null, 2)}`)
  assert.equal(accuracy, 100, `expected accuracy 100%, got ${accuracy.toFixed(1)}% (${hits}/${verified.length})`)
})
