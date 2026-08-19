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

test('weak lay-vol ratio does not beat trap + stronger team (England v Pakistan loss)', () => {
  const pred = predictTossWinner(snap({
    lay1: 1066,
    lay2: 1291,
    total1: 2000,
    total2: 1500,
    trades1: 9,
    trades2: 12,
    trap: 'high',
    stronger: t1,
    bookieFav: t2,
  }))
  assert.equal(pred.winnerName, t1)
  assert.equal(pred.pattern, 'STRONGER_SUPPORT')
})

test('clear lay vol still wins when ratio is strong even if stronger disagrees', () => {
  const pred = predictTossWinner(snap({
    names: ['Sunrisers Leeds', 'Manchester Super Giants'],
    lay1: 388,
    lay2: 182,
    total1: 400,
    total2: 900,
    trades1: 9,
    trades2: 12,
    trap: 'high',
    stronger: 'Manchester Super Giants',
  }))
  assert.equal(pred.winnerName, 'Sunrisers Leeds')
  assert.equal(pred.pattern, 'CLEAR_LAY_VOL')
})

test('large rupee gap with moderate ratio still uses lay vol (St Lucia v Barbados)', () => {
  const pred = predictTossWinner(snap({
    names: ['St. Lucia Kings', 'Barbados Tridents'],
    lay1: 1240,
    lay2: 927,
    total1: 800,
    total2: 1400,
    trades1: 10,
    trades2: 21,
    trap: 'high',
    stronger: 'Barbados Tridents',
  }))
  assert.equal(pred.winnerName, 'St. Lucia Kings')
  assert.equal(pred.pattern, 'CLEAR_LAY_VOL')
})

test('verified toss dataset: every labeled toss is predicted correctly', () => {
  const dataPath = join(dirname(fileURLToPath(import.meta.url)), '../../../server/data/toss_dataset.json')
  const file = JSON.parse(readFileSync(dataPath, 'utf8'))
  const verified = file.records.filter((r) => r.status === 'verified' && r.actualWinner)
  assert.ok(verified.length >= 12, `expected labeled records, got ${verified.length}`)

  const misses = []
  for (const r of verified) {
    const pred = predictTossWinner(r.snapshot)
    if (!pred?.winnerName || !teamEq(pred.winnerName, r.actualWinner)) {
      misses.push(`${r.matchId} ${r.matchName}: pred=${pred?.winnerName || 'NONE'} actual=${r.actualWinner} (${pred?.pattern})`)
    }
  }
  assert.deepEqual(misses, [])
})
