import test from 'node:test'
import assert from 'node:assert/strict'
import { processTeamData } from './selectionVolume.js'

test('summary and ladder sum the same normalized stake rows, not liability', () => {
  const d = processTeamData('A', { trades: [
    { price: '3', size: '10', type: 'BACK', updatedAt: '2026-10-10T00:00:00Z' },
    { price: 3, size: 7, side: 'l', updatedAt: 1791590460 },
    { price: 2, size: 5, type: 'back', updatedAt: 1791590520000 },
  ] })
  assert.equal(d.totalBack, 15)
  assert.equal(d.totalLay, 7)
  assert.equal(d.totalBet, 22)
  assert.equal(d.orderBook.reduce((s, r) => s + r.traded, 0), 22)
  assert.deepEqual(d.orderBook.map(r => r.price), [2, 3])
  assert.equal(d.lastPrice, 2)
  assert.equal(d.trend, 'Dropping')
})

test('time filters are relative to latest recorded time, including ended matches', () => {
  const trades = [0, 2, 4].map(hour => ({ price: 2, size: 10, type: 'back', updatedAt: `2026-10-10T0${hour}:00:00Z` }))
  assert.equal(processTeamData('A', { trades }, '1h').totalBack, 10)
  assert.equal(processTeamData('A', { trades }, '3h').totalBack, 20)
  assert.equal(processTeamData('A', { trades }, 'all').totalBack, 30)
})

test('missing, empty, invalid and missing-time data are distinguishable', () => {
  assert.equal(processTeamData('A', {}).totalBack, null)
  assert.equal(processTeamData('A', { trades: [] }).totalBack, 0)
  const trades = [{ price: 2, size: 10, type: 'back' }, { price: 'bad', size: 8, type: 'lay' }, { price: 2, size: -1, type: 'back' }, { price: 2, size: 3, type: 'unknown' }]
  const d = processTeamData('A', { trades })
  assert.equal(d.invalid, 3)
  assert.equal(d.totalBet, 10)
  assert.equal(d.lastPrice, null)
  assert.equal(processTeamData('A', { trades }, '1h').totalBet, null)
})

test('session run lines including zero are preserved', () => {
  const d = processTeamData('Runs', { trades: [{ price: 0, size: 10, type: 'back' }, { price: 10.5, size: 3, type: 'lay' }] })
  assert.equal(d.low, 0)
  assert.equal(d.high, 10.5)
  assert.equal(d.totalBet, 13)
})

test('current To Back and To Lay use live order-book sizes, not recorded trade totals', () => {
  const team = { trades: [
    { price: 1.7, size: 9000, type: 'back' },
    { price: 1.71, size: 8000, type: 'lay' },
  ] }
  const runner = {
    ex: {
      availableToBack: [{ price: 1.7, size: 125 }],
      availableToLay: [{ price: 1.71, size: 240 }],
      tradedVolume: [{ price: 1.7, size: 5000 }],
    },
  }
  const d = processTeamData('A', team, 'all', runner)
  assert.equal(d.totalBack, 9000)
  assert.equal(d.totalLay, 8000)
  assert.equal(d.liquidityAvailable, true)
  assert.deepEqual(d.liquidityBook, [
    { price: 1.7, back: 125, lay: 0, traded: 5000 },
    { price: 1.71, back: 0, lay: 240, traded: 0 },
  ])
})

test('top-of-book sizes are supported and recorded fallback uses latest per-price amounts, not totals', () => {
  const noDepth = processTeamData('A', { trades: [
    { price: 2, size: 10, type: 'back', updatedAt: 1000 },
    { price: 2, size: 25, type: 'back', updatedAt: 2000 },
    { price: 2, size: 7, type: 'lay', updatedAt: 1500 },
  ] })
  assert.equal(noDepth.liquidityAvailable, true)
  assert.equal(noDepth.liquiditySource, 'recorded-level')
  assert.deepEqual(noDepth.liquidityBook, [{ price: 2, back: 25, lay: 7, traded: 42 }])

  const d = processTeamData('A', { trades: [] }, 'all', { back: 1.8, backSize: 42, lay: 1.81, laySize: 17 })
  assert.equal(d.liquiditySource, 'live')
  assert.deepEqual(d.liquidityBook, [
    { price: 1.8, back: 42, lay: 0, traded: 0 },
    { price: 1.81, back: 0, lay: 17, traded: 0 },
  ])
})
