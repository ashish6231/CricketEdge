import test from 'node:test'
import assert from 'node:assert/strict'
import { canCapturePreMatchProviderTotals, getFrozenPreMatchProviderTotals, getLiveProviderTotals, getMarketBetActivity, processTeamData } from './selectionVolume.js'

test('pre-match provider total stays on the frozen value after live totals change', () => {
  const beforeStart = {
    startTime: '2026-10-17T10:00:00Z',
    inPlay: false,
    deepMetrics: { totals: { team1: 406000, team2: 181000 } },
    preMatchTotalBets: { team1: 406000, team2: 181000 },
  }
  const frozen = getLiveProviderTotals(beforeStart)
  const liveUpdate = {
    ...beforeStart,
    inPlay: true,
    deepMetrics: { totals: { team1: 900000, team2: 700000 } },
  }

  assert.deepEqual(frozen, [406000, 181000])
  assert.deepEqual(getFrozenPreMatchProviderTotals(liveUpdate, frozen), [406000, 181000])
  assert.equal(canCapturePreMatchProviderTotals(liveUpdate, Date.parse('2026-10-17T09:00:00Z')), false)
})

test('direct live load uses explicit provider frozen pre-match totals', () => {
  const snapshot = {
    inPlay: true,
    deepMetrics: { totals: { team1: 900000, team2: 700000 } },
    preMatchProviderTotals: { team1: 433.65, team2: 2220 },
  }
  assert.deepEqual(getFrozenPreMatchProviderTotals(snapshot), [433.65, 2220])
})

test('live load uses the provider frozen pre-match activity instead of changing live totals', () => {
  assert.deepEqual(getFrozenPreMatchProviderTotals({ inPlay: true,
    preMatchTotalBets: { team1: 33577.6517, team2: 183175.629 },
    deepMetrics: { totals: { totalBetTeam1: 900000, totalBetTeam2: 700000 } },
  }), [33577.6517, 183175.629])
})

test('market Total bets uses the provider activity ledger, not exposure-based provider totals', () => {
  const snapshot = {
    status: 'live',
    inPlayTotalBets: { team1: 12790, team2: 7640 },
    preMatchTotalBets: { team1: 266, team2: 229 },
    deepMetrics: { totals: { team1: 405847.61, team2: 180658.69 } },
  }

  assert.deepEqual(getMarketBetActivity(snapshot, { live: true }), {
    values: [12790, 7640],
    total: 20430,
    period: 'in-play',
  })
  assert.deepEqual(getLiveProviderTotals(snapshot), [405847.61, 180658.69])
})

test('upcoming market Total bets uses frozen pre-match activity', () => {
  const snapshot = { status: 'upcoming', preMatchTotalBets: { team1: 120, team2: 80 } }
  assert.deepEqual(getMarketBetActivity(snapshot, {
    frozenPreMatchBets: { team1: 266, team2: 229 },
  }), {
    values: [266, 229],
    total: 495,
    period: 'pre-match',
  })
})

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

test('server provider capture takes precedence over old browser state and merges partial values', () => {
  assert.deepEqual(getFrozenPreMatchProviderTotals({preMatchProviderTotals:{team1:0,team2:null}},[900,800]),[0,800])
  assert.deepEqual(getLiveProviderTotals({deepMetrics:{totals:{team1:'',team2:0}}}),[null,0])
})

test('unknown kickoff or completed CREX status cannot be frozen as pre-match', () => {
  assert.equal(canCapturePreMatchProviderTotals({deepMetrics:{totals:{team1:10,team2:20}}}),false)
  assert.equal(canCapturePreMatchProviderTotals({startTime:'2026-10-19T10:00:00Z',crex:{scorecard:{status:'completed'}}},Date.parse('2026-10-18T10:00:00Z')),false)
})


test('provider pre-match ledger wins over an older capture and browser state, preserving zero', () => {
  const input = { status: 'live',
    preMatchTotalBets: {team1:0,team2:183175.629},
    preMatchProviderTotals: {team1:5,team2:180000},
    deepMetrics: {totals:{team1:900000,team2:700000}},
  }
  assert.deepEqual(getFrozenPreMatchProviderTotals(input,[3,170000]),[0,183175.629])
  assert.deepEqual(getFrozenPreMatchProviderTotals({...input,deepMetrics:{totals:{team1:1000000,team2:800000}}}),[0,183175.629])
})

test('missing pre-match fields never fall back to current or in-play totals', () => {
  assert.equal(getFrozenPreMatchProviderTotals({inPlay:true,inPlayTotalBets:{team1:1,team2:2},
    deepMetrics:{totals:{team1:3,team2:4}}}),null)
})
