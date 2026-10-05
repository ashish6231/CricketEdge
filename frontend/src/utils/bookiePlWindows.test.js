import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { finiteNumber, getBookiePlWindows, getSelectionStakes, latestMatchedPrice, calcBookiePlMulti, getBookiePl } from './bookiePl.js'

const start = Date.parse('2026-09-20T10:00:00Z')
const snap = () => ({
  teamNames: ['A', 'B'], startTime: start, serverTime: start + 600000, tradesComplete: true,
  teams: {
    A: { trades: [{ type: 'back', size: 100, price: 2, updatedAt: start - 1 }, { type: 'lay', size: 20, price: 3, updatedAt: start }, { type: 'back', size: 10, price: 4, updatedAt: start + 420000 }] },
    B: { trades: [{ type: 'lay', size: 50, price: 2, updatedAt: start - 1 }, { type: 'back', size: 30, price: 3, updatedAt: start + 600000 }] },
  },
})

test('same settlement formula applies to pre-match, in-play and inclusive last-three-minute boundaries', () => {
  const w = getBookiePlWindows(snap(), 'A', 'B')
  assert.deepEqual(w.preMatch.byName, { A: -150, B: 150 })
  assert.deepEqual(w.live.byName, { A: 40, B: -70 })
  assert.deepEqual(w.threeMin.byName, { A: 0, B: -50 })
  assert.deepEqual(w.all.byName, { A: -110, B: 80 })
  assert.equal(w.preMatch.pl1 + w.live.pl1, w.all.pl1)
  assert.equal(w.preMatch.pl2 + w.live.pl2, w.all.pl2)
})

test('last three minutes anchor to historical capture time, not current wall clock', () => {
  assert.equal(getBookiePlWindows(snap(), 'A', 'B', null, { now: Date.now() }).threeMin.pl2, -50)
})

test('future trades are excluded from period P/L', () => {
  const s = snap()
  s.teams.A.trades.push({ type: 'back', size: 900, price: 8, updatedAt: s.serverTime + 1 })
  assert.equal(getBookiePlWindows(s, 'A', 'B').threeMin.pl1, 0)
})

test('three-minute live window never includes pre-match trades just before the start', () => {
  const s = snap()
  s.serverTime = start + 120000
  s.teams.A.trades = [
    { type: 'back', size: 100, price: 2, updatedAt: start - 1 },
    { type: 'back', size: 10, price: 2, updatedAt: start + 60000 },
  ]
  s.teams.B.trades = []
  assert.deepEqual(getBookiePlWindows(s, 'A', 'B').threeMin.byName, { A: -10, B: 10 })
})

test('unknown capture time cannot turn a historical period into a zero current window', () => {
  const s = snap()
  delete s.serverTime
  const windows = getBookiePlWindows(s, 'A', 'B')
  assert.equal(windows.all.pl1, -110)
  assert.equal(windows.threeMin.pl1, null)
  assert.equal(windows.preMatch.pl1, -150)
})

test('complete provider period snapshots remain visible but are not marked as calculated', () => {
  const s = snap()
  delete s.tradesComplete
  s.preMatchVolume = { team1: { back: 12, lay: 3 }, team2: { back: 8, lay: 1 } }
  s.preMatchPnl = { team1: 44.5, team2: -39.25 }
  s.inPlayVolume = { team1: { back: 20, lay: 4 }, team2: { back: 15, lay: 2 } }
  s.inPlayPnl = { team1: -10, team2: 12 }
  s.threeMinVolume = { team1: { back: 5, lay: 1 }, team2: { back: 6, lay: 0 } }
  s.threeMinPnl = { team1: 3.5, team2: -2.25 }
  const windows = getBookiePlWindows(s, 'A', 'B')
  assert.deepEqual(windows.preMatch.byName, { A: 44.5, B: -39.25 })
  assert.deepEqual(windows.live.byName, { A: -10, B: 12 })
  assert.deepEqual(windows.threeMin.byName, { A: 3.5, B: -2.25 })
  assert.equal(windows.preMatch.source, 'provider')
  assert.equal(windows.preMatch.verified, false)
})

test('partial or malformed frozen periods are rejected instead of showing guessed P/L', () => {
  const s = snap()
  delete s.tradesComplete
  s.preMatchVolume = { team1: { back: 12, lay: 3 }, team2: { back: 8 } }
  s.preMatchPnl = { team1: 44.5, team2: -39.25 }
  assert.equal(getBookiePlWindows(s, 'A', 'B').preMatch.pl1, null)
})

test('ISO, numeric strings and seconds timestamps agree', () => {
  const s = snap()
  for (const t of Object.values(s.teams).flatMap(team => team.trades)) t.updatedAt = new Date(t.updatedAt).toISOString()
  s.serverTime /= 1000
  assert.equal(getBookiePlWindows(s, 'A', 'B').threeMin.pl2, -50)
})

test('original all-market display gives provider simplePL priority', () => {
  const s = snap()
  s.runners = [{ price: 100 }, { price: 100 }]
  s.deepMetrics = { simplePL: { team1_win: 10000, team2_win: 10000 } }
  assert.equal(getBookiePlWindows(s, 'A', 'B').all.pl1, 10000)
})

test('draw stakes and liabilities are included even when draw runner is between the teams', () => {
  const s = snap()
  s.teamNames = ['A', 'The Draw', 'B']
  s.teams['The Draw'] = { trades: [{ type: 'back', size: 20, price: 5, updatedAt: start - 1 }] }
  const w = getBookiePlWindows(s, 'A', 'B', 'The Draw')
  assert.deepEqual(w.preMatch.byName, { A: -130, 'The Draw': -30, B: 170 })
})

test('partial ledger requires exact scope volume reconciliation', () => {
  const s = snap()
  delete s.tradesComplete
  s.threeMinVolume = { team1: { back: 10, lay: 0 }, team2: { back: 30, lay: 0 } }
  assert.equal(getBookiePlWindows(s, 'A', 'B').threeMin.pl2, -50)
  s.threeMinVolume.team1.back = 15
  assert.equal(getBookiePlWindows(s, 'A', 'B').threeMin.pl2, null)
  assert.equal(getBookiePlWindows(s, 'A', 'B').all.pl1, -110)
})

test('original all-market display keeps the provider named P/L', () => {
  const s = { teamNames: ['A', 'B'], teams: { A: { pnlIfWins: 30 }, B: { pnlIfWins: -20 } }, preMatchPnl: { team1: 30, team2: -20 } }
  assert.equal(getBookiePl(s, 'A', 'B').source, 'api')
  const w = getBookiePlWindows(s, 'A', 'B')
  assert.equal(w.all.pl1, 30)
  assert.equal(w.all.pl2, -20)
  assert.equal(w.preMatch.pl1, null)
  assert.equal(w.live.pl1, null)
  assert.equal(w.threeMin.pl1, null)
})

test('empty or malformed market data cannot become a valid zero market', () => {
  for (const bad of [null, undefined, {}, { teams: { A: { trades: 'bad' }, B: { trades: [] } } }]) {
    assert.equal(getBookiePlWindows(bad, 'A', 'B').all.pl1, 0)
    assert.equal(getBookiePlWindows(bad, 'A', 'B').threeMin.pl1, null)
  }
  for (const value of [null, '', '   ', true, Infinity, {}, []]) assert.equal(finiteNumber(value), null)
  assert.equal(finiteNumber(' 12.5 '), 12.5)
})

test('invalid stakes or prices invalidate the calculation', () => {
  for (const trade of [null, { type: 'back', size: -1, price: 2 }, { type: 'back', size: 10, price: 1 }, { type: 'unknown', size: 10, price: 2 }]) {
    assert.equal(calcBookiePlMulti({ A: [trade], B: [] }).A, null)
  }
})

test('displayed stake volume uses V1 stakes rather than V2 liabilities or synthetic totals', () => {
  const s = { teamNames: ['A', 'B'], advancedMetrics: { team1: { back: 100, lay: 20 } }, advancedMetricsV2: { team1: { back: 900, lay: 700 } } }
  assert.deepEqual(getSelectionStakes(s, 'A'), { back: 100, lay: 20, totalBet: 120 })
  assert.equal(getSelectionStakes(s, 'B').totalBet, null)
})

test('matched price is the latest actual trade without an arbitrary odds clamp', () => {
  assert.equal(latestMatchedPrice([{ type: 'back', price: '3.20', size: '10', updatedAt: start }]), 3.2)
  assert.equal(latestMatchedPrice([{ type: 'back', price: 'invalid', size: 10, updatedAt: start }]), null)
})

for (const dataset of ['match_dataset', 'toss_dataset']) test(`${dataset}: original provider priority is preserved for retained outcomes`, () => {
  const data = JSON.parse(readFileSync(new URL(`../../../server/data/${dataset}.json`, import.meta.url), 'utf8'))
  let checked = 0
  for (const record of data.records) {
    const s = record.snapshot
    if (!s?.teamNames?.length) continue
    const result = getBookiePl(s, s.teamNames[0], s.teamNames[1])
    const expected1 = finiteNumber(s.deepMetrics?.simplePL?.team1_win ?? s.teams?.[s.teamNames[0]]?.pnlIfWins)
    const expected2 = finiteNumber(s.deepMetrics?.simplePL?.team2_win ?? s.teams?.[s.teamNames[1]]?.pnlIfWins)
    if (expected1 == null || expected2 == null) continue
    assert.equal(result.pl1, expected1, `${record.matchId}: team1 provider P/L`)
    assert.equal(result.pl2, expected2, `${record.matchId}: team2 provider P/L`)
    checked++
  }
  assert.ok(checked > 0)
})

for (const dataset of ['match_dataset', 'toss_dataset']) test(`${dataset}: every complete captured period keeps its P/L and team mapping`, () => {
  const data = JSON.parse(readFileSync(new URL(`../../../server/data/${dataset}.json`, import.meta.url), 'utf8'))
  let checked = 0
  for (const record of data.records) {
    const s = record.snapshot
    if (!s?.teamNames?.length) continue
    const windows = getBookiePlWindows(s, s.teamNames[0], s.teamNames[1], null, { startTime: record.startTime })
    for (const [windowKey, pnlField] of [['preMatch', 'preMatchPnl'], ['live', 'inPlayPnl'], ['threeMin', 'threeMinPnl']]) {
      const expected1 = finiteNumber(s[pnlField]?.team1)
      const expected2 = finiteNumber(s[pnlField]?.team2)
      if (expected1 == null || expected2 == null) continue
      assert.equal(windows[windowKey].pl1, expected1, `${record.matchId}: ${windowKey} team1`)
      assert.equal(windows[windowKey].pl2, expected2, `${record.matchId}: ${windowKey} team2`)
      checked++
    }
  }
  assert.ok(checked > 0)
})
