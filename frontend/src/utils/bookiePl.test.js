import test from 'node:test'
import assert from 'node:assert/strict'
import {
  splitMatchOutcomes,
  isDrawOutcomeName,
  calcBookiePlMulti,
  calcBookiePlFromTrades,
  getBookiePl,
  getSettledBookiePl,
} from './bookiePl.js'

test('splitMatchOutcomes pulls Draw out of teamNames', () => {
  const split = splitMatchOutcomes(['England', 'The Draw', 'Pakistan'])
  assert.equal(split.t1, 'England')
  assert.equal(split.t2, 'Pakistan')
  assert.equal(split.drawName, 'The Draw')
  assert.deepEqual(split.outcomes, ['England', 'Pakistan', 'The Draw'])
})

test('isDrawOutcomeName matches variants', () => {
  assert.equal(isDrawOutcomeName('The Draw'), true)
  assert.equal(isDrawOutcomeName('draw'), true)
  assert.equal(isDrawOutcomeName('England'), false)
})

test('calcBookiePlMulti returns three outcomes', () => {
  const byName = calcBookiePlMulti({
    A: [{ type: 'back', size: 100, price: 2 }],
    B: [{ type: 'lay', size: 50, price: 3 }],
    'The Draw': [{ type: 'back', size: 20, price: 4 }],
  })
  assert.ok(Object.prototype.hasOwnProperty.call(byName, 'A'))
  assert.ok(Object.prototype.hasOwnProperty.call(byName, 'B'))
  assert.ok(Object.prototype.hasOwnProperty.call(byName, 'The Draw'))
})

test('bookie P/L if a backed team wins is negative — bookie laid that back', () => {
  const { team1Win, team2Win } = calcBookiePlFromTrades(
    [{ type: 'back', size: 100, price: 2 }],
    [],
  )
  // Customer backed A 100 at 2.0. Bookie laid A. A wins → bookie pays 100.
  assert.equal(team1Win, -100)
  // A loses → bookie keeps the 100 stake.
  assert.equal(team2Win, 100)
})

test('calcBookiePlMulti matches two-way bookie sign', () => {
  const byName = calcBookiePlMulti({
    A: [{ type: 'back', size: 100, price: 2 }],
    B: [],
  })
  assert.equal(byName.A, -100)
  assert.equal(byName.B, 100)
})

test('getBookiePl includes plDraw from pnlIfWins', () => {
  const snap = {
    teams: {
      England: { pnlIfWins: 10, trades: [] },
      Pakistan: { pnlIfWins: -5, trades: [] },
      'The Draw': { pnlIfWins: 2, trades: [] },
    },
  }
  const pl = getBookiePl(snap, 'England', 'Pakistan', 'The Draw')
  assert.equal(pl.pl1, 10)
  assert.equal(pl.pl2, -5)
  assert.equal(pl.plDraw, 2)
})

test('getBookiePl restores original simplePL priority over reconstructed values', () => {
  const snap = {
    deepMetrics: { simplePL: { team1_win: 125, team2_win: -90 } },
    teams: {
      India: { pnlIfWins: 999, trades: [{ type: 'back', size: 100, price: 2 }] },
      England: { pnlIfWins: -999, trades: [] },
    },
  }
  const pl = getBookiePl(snap, 'India', 'England')
  assert.equal(pl.pl1, 125)
  assert.equal(pl.pl2, -90)
  assert.equal(pl.source, 'api')
})

test('getSettledBookiePl computes full trade settlement ignoring deepMetrics.simplePL', () => {
  const snap = {
    deepMetrics: { simplePL: { team1_win: -999, team2_win: -888 } },
    teams: {
      India: { trades: [{ type: 'back', size: 100, price: 2.5 }, { type: 'lay', size: 30, price: 3 }] },
      England: { trades: [{ type: 'back', size: 80, price: 1.75 }, { type: 'lay', size: 25, price: 2 }] },
    },
  }
  const res = getSettledBookiePl(snap, 'India', 'England')
  // India wins: -150 + 60 + 80 - 25 = -35
  // England wins: -60 + 25 + 100 - 30 = +35
  assert.equal(res.pl1, -35)
  assert.equal(res.pl2, 35)
  assert.equal(res.plDraw, null)
  assert.equal(res.source, 'per-odds-trades')
})

test('getSettledBookiePl supports 3-way markets with Draw and guards incomplete snapshots', () => {
  const drawSnap = {
    teams: {
      India: { trades: [{ type: 'back', size: 100, price: 2 }] },
      England: { trades: [{ type: 'lay', size: 40, price: 3 }] },
      'The Draw': { trades: [{ type: 'back', size: 20, price: 4 }] },
    },
  }
  const drawRes = getSettledBookiePl(drawSnap, 'India', 'England', 'The Draw')
  // India wins: -100 + (0 - 40) + (20 - 0) = -120
  // England wins: (0 + 80) + (100 - 0) + (20 - 0) = +200
  // Draw wins: (-60 + 0) + (100 - 0) + (0 - 40) = 0
  assert.equal(drawRes.pl1, -120)
  assert.equal(drawRes.pl2, 200)
  assert.equal(drawRes.plDraw, 0)

  const emptyIncomplete = {
    teams: { India: { trades: [] }, England: { trades: [] } },
  }
  assert.equal(getSettledBookiePl(emptyIncomplete, 'India', 'England').pl1, null)

  const emptyComplete = {
    tradesComplete: true,
    teams: { India: { trades: [] }, England: { trades: [] } },
  }
  assert.equal(getSettledBookiePl(emptyComplete, 'India', 'England').pl1, 0)
})
