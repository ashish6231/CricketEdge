import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAllSessions,
  buildLinesFromTrades,
  calcSessionPlBreakdown,
  calcSessionPlAtScore,
  computeSessionMetrics,
} from './sessionMetrics.js'

test('session P/L uses the bookie side of customer YES and NO stakes', () => {
  const lines = buildLinesFromTrades([
    { type: 'back', price: '100.5', size: '100' },
    { type: 'lay', price: '102.5', size: '60' },
  ])

  // 100 runs: YES loses (+100), NO wins (-60).
  assert.equal(calcSessionPlAtScore(lines, 100), 40)
  assert.deepEqual(calcSessionPlBreakdown(lines, 100), { receives: 100, pays: 60, pl: 40 })
  // 101 runs: first YES wins (-100), second NO wins (-60).
  assert.equal(calcSessionPlAtScore(lines, 101), -160)
  assert.deepEqual(calcSessionPlBreakdown(lines, 101), { receives: 0, pays: 160, pl: -160 })
  // 103 runs: YES wins (-100), NO loses (+60).
  assert.equal(calcSessionPlAtScore(lines, 103), -40)
  assert.deepEqual(calcSessionPlBreakdown(lines, 103), { receives: 60, pays: 100, pl: -40 })
})

test('compacted tradeCount changes bet count but never P/L or matched money', () => {
  const marketName = '1st Innings 10 Overs Line'
  const metrics = computeSessionMetrics(
    { marketName, bestYes: '78.5', bestNo: '79.5' },
    [
      { team: marketName, type: 'back', price: '78.5', size: '250.50', tradeCount: 4 },
      { team: marketName, type: 'lay', price: '79.5', size: '100.25', tradeCount: 2 },
    ],
    { marketName, tradeCount: 6, totalVolume: 350.75 },
  )

  assert.equal(metrics.marketMid, 79)
  assert.equal(metrics.tradeCount, 6)
  assert.equal(metrics.totalVol, 350.75)
  assert.equal(metrics.ledgerStatus, 'verified')
  assert.equal(metrics.plRowsFull.find(row => row.score === 79)?.pl, -350.75)
  assert.equal(metrics.plRowsFull.find(row => row.score === 80)?.pl, -150.25)
})

test('market summaries are merged and a mismatched ledger is marked syncing', () => {
  const marketName = '1st Innings 6 Overs Line'
  const [session] = buildAllSessions(
    [{ marketName, bestYes: 48.5, bestNo: 49.5 }],
    [{ team: marketName, type: 'back', price: 48.5, size: 10 }],
    [{ marketName, tradeCount: 2, totalVolume: 25 }],
  )

  assert.equal(session.ledgerStatus, 'syncing')
  assert.equal(session.providerTradeCount, 2)
  assert.equal(session.providerVolume, 25)
})
