import test from 'node:test'
import assert from 'node:assert/strict'
import {
  splitMatchOutcomes,
  isDrawOutcomeName,
  calcBookiePlMulti,
  calcBookiePlFromTrades,
  getBookiePl,
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
