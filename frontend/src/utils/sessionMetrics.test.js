import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAllSessions,
  buildLinesFromTrades,
  calcSessionPlBreakdown,
  calcSessionPlAtScore,
  computeSessionMetrics,
  computePlRows,
  fmtRs,
  sessionDataFingerprint,
  settleSessionLines,
  summarizeLineOutcome,
} from './sessionMetrics.js'

test('session P/L uses Betfair Line Market rules (back = NO/Under, lay = YES/Over)', () => {
  const lines = buildLinesFromTrades([
    { type: 'back', price: '100.5', size: '100' },
    { type: 'lay', price: '102.5', size: '60' },
  ])

  // 100 runs: NO (100.5 back) wins (-100), YES (102.5 lay) loses (+60).
  assert.equal(calcSessionPlAtScore(lines, 100), -40)
  assert.deepEqual(calcSessionPlBreakdown(lines, 100), { receives: 60, pays: 100, pl: -40 })
  // 101 runs: NO (100.5 back) loses (+100), YES (102.5 lay) loses (+60).
  assert.equal(calcSessionPlAtScore(lines, 101), 160)
  assert.deepEqual(calcSessionPlBreakdown(lines, 101), { receives: 160, pays: 0, pl: 160 })
  // 103 runs: NO (100.5 back) loses (+100), YES (102.5 lay) wins (-60).
  assert.equal(calcSessionPlAtScore(lines, 103), 40)
  assert.deepEqual(calcSessionPlBreakdown(lines, 103), { receives: 100, pays: 60, pl: 40 })
})

test('compacted tradeCount changes bet count, un-inverts TLL Betfair quotes, and computes exact P/L', () => {
  const marketName = '1st Innings 10 Overs Line'
  const metrics = computeSessionMetrics(
    { marketName, bestYes: '78.5', bestNo: '79.5' },
    [
      { team: marketName, type: 'back', price: '78.5', size: '250.50', tradeCount: 4 },
      { team: marketName, type: 'lay', price: '79.5', size: '100.25', tradeCount: 2 },
    ],
    { marketName, tradeCount: 6, totalVolume: 350.75 },
  )

  assert.equal(metrics.bestNo, 78.5)
  assert.equal(metrics.bestYes, 79.5)
  assert.equal(metrics.marketMid, 79)
  assert.equal(metrics.tradeCount, 6)
  assert.equal(metrics.totalVol, 350.75)
  assert.equal(metrics.ledgerStatus, 'verified')
  assert.equal(metrics.plRowsFull.find(row => row.score === 79)?.pl, 350.75)
  assert.equal(metrics.plRowsFull.find(row => row.score === 80)?.pl, 150.25)
  assert.equal(fmtRs(-296000), '−€2.96L')
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


test('every score includes all YES and NO trades, not just bets on that run line', () => {
  const marketName = '1st Innings 10 Overs Line'
  const trades = [
    {team:marketName,type:'yes',price:50.5,size:100},
    {team:marketName,type:'no',price:50.5,size:40},
    {team:marketName,type:'back',price:52.5,size:80},
    {team:marketName,type:'lay',price:54.5,size:200},
  ]
  const session = computeSessionMetrics({marketName},trades)
  // Independent per-bet settlement, before any line aggregation.
  for (let score=0; score<=100; score++) {
    const expected=trades.reduce((net,trade) => {
      const customerWins=(trade.type==='yes'||trade.type==='lay') ? score>trade.price : score<=trade.price
      return net+(customerWins ? -trade.size : trade.size)
    },0)
    assert.equal(calcSessionPlAtScore(session.lines,score),expected,`score ${score}`)
    const rows=settleSessionLines(session.lines,score)
    assert.equal(rows.reduce((net,row)=>net+row.pl,0),expected)
    assert.equal(rows.reduce((sum,row)=>sum+row.receives+row.pays,0),420)
  }
  assert.equal(session.plRowsFull[0].score,0)
  assert.equal(session.plRowsFull.at(-1).score,55)
  assert.deepEqual(session.plRanges,[{from:0,to:54,outcome:'profit'},{from:55,to:null,outcome:'loss'}])
  assert.equal(session.predicted,null)
})

test('all lower and upper outcomes are represented, with an unlimited constant upper tail', () => {
  const lines=buildLinesFromTrades([{type:'yes',price:100.5,size:10},{type:'no',price:102.5,size:20}])
  const rows=computePlRows(lines,{full:true,bestYes:101.5,bestNo:104.5})
  assert.equal(rows.length,106)
  assert.equal(rows[0].score,0)
  assert.equal(rows.at(-1).score,105)
  for (const score of [105,106,200,10000]) assert.equal(calcSessionPlAtScore(lines,score),10)
  assert.ok(computePlRows(lines,{bestYes:0.5,bestNo:1.5,marketMid:1,over:6}).every(row=>row.score>=0))
})

test('same-line opposing bets net correctly at integer and fractional boundaries', () => {
  for (const price of [50,50.5]) {
    const lines=buildLinesFromTrades([{type:'yes',price,size:100},{type:'no',price,size:40}])
    assert.equal(calcSessionPlAtScore(lines,50),60)
    assert.equal(calcSessionPlAtScore(lines,51),-60)
  }
  for (const score of [0,50,51,100]) {
    assert.equal(calcSessionPlAtScore(buildLinesFromTrades([{type:'yes',price:50,size:100},{type:'no',price:50,size:100}]),score),0)
  }
})

test('market and innings isolation use the same identifier as backend compaction', () => {
  const first='1st Innings 6 Overs Line',second='2nd Innings 6 Overs Line'
  const sessions=buildAllSessions([], [
    {team:first,marketName:second,type:'yes',price:40.5,size:10},
    {team:second,type:'no',price:40.5,size:30},
  ])
  assert.equal(sessions.length,2)
  assert.equal(sessions[0].totalVol,10)
  assert.equal(sessions[1].totalVol,30)
  assert.equal(calcSessionPlAtScore(sessions[0].lines,40),10)
  assert.equal(calcSessionPlAtScore(sessions[1].lines,40),-30)
})

test('invalid matched rows suppress partial P/L instead of silently becoming complete', () => {
  const marketName='1st Innings 6 Overs Line'
  const valid={team:marketName,type:'yes',price:40.5,size:10}
  for (const change of [{size:' '},{size:-10},{size:Infinity},{price:null},{price:' '},{type:'unknown'},{tradeCount:1.5}]) {
    const session=computeSessionMetrics({marketName},[valid,{...valid,...change}])
    assert.equal(session.invalidTradeCount,1)
    assert.equal(session.ledgerStatus,'invalid')
    assert.equal(session.canCalculatePl,false)
    assert.deepEqual(session.plRowsFull,[])
    assert.equal(session.bestPlRow,null)
  }
  for (const score of [-1,NaN,null,'50',50.5]) assert.equal(calcSessionPlAtScore(buildLinesFromTrades([valid]),score),null)
  assert.equal(calcSessionPlAtScore([{price:50,yes:-10,no:0}],50),null)
})

test('trade corrections refresh even with unchanged count, money, and final timestamp', () => {
  const data={trades:[{team:'6 Overs Line',type:'yes',price:40.5,size:100,updatedAt:1}],odds:[]}
  for (const changes of [{price:45.5},{type:'no'},{size:100.01},{team:'10 Overs Line'}]) {
    assert.notEqual(sessionDataFingerprint(data),sessionDataFingerprint({...data,trades:[{...data.trades[0],...changes}]}))
  }
  assert.equal(sessionDataFingerprint(data),sessionDataFingerprint(JSON.parse(JSON.stringify(data))))
})

test('summarizeLineOutcome compares NO (<= line) vs YES (> line) bookie edge accurately', () => {
  const lines = buildLinesFromTrades([
    { type: 'yes', price: 57.5, size: 200 },
    { type: 'no', price: 57.5, size: 50 },
    { type: 'yes', price: 58.5, size: 100 },
    { type: 'no', price: 58.5, size: 400 },
  ])
  const summary = summarizeLineOutcome(lines, 58)
  assert.equal(summary.line, 58)
  assert.equal(summary.yesFrom, 59)
  assert.equal(summary.noSide.pl, -450)
  assert.equal(summary.yesSide.pl, 150)
  assert.equal(summary.favoredSide, 'YES')
  assert.equal(summary.advantage, 600)
  assert.equal(summarizeLineOutcome([], 58), null)
  assert.equal(summarizeLineOutcome(lines, -1), null)
})
