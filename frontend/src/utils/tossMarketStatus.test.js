import test from 'node:test'
import assert from 'node:assert/strict'
import {getTossMarketStatus,formatTossTime} from './tossMarketStatus.js'
const now=Date.parse('2026-11-01T14:30:00Z')
const snap=()=>({teamNames:['Afghanistan','Zimbabwe'],serverTime:now-30000,
  teams:{Afghanistan:{trades:[{updatedAt:now-600000}]},Zimbabwe:{trades:[{updatedAt:now-500000}]}}})

test('reported toss result takes precedence over an upcoming match status without changing the rule selection',()=>{
  const s=snap();s.status='upcoming';s.crex={scorecard:{tossText:'Toss Winner: Afghanistan (opt to Bowl)'}}
  const result=getTossMarketStatus(s,{},now)
  assert.equal(result.winner,'Afghanistan');assert.equal(result.resultReported,true);assert.equal(result.closed,true)
  assert.equal(result.stale,false);assert.equal(result.lastTradeTime,now-500000)
})

test('only explicit toss text or toss actualWinner resolves a result, not a match winner or team mention',()=>{
  for(const text of ['Afghanistan vs Zimbabwe','Toss not announced','Zimbabwe won by 6 wickets','Toss Winner: Unknown']) {
    const s=snap();s.tossText=text;s.crex={statusText:'Zimbabwe won by 6 wickets'}
    assert.equal(getTossMarketStatus(s,{},now).winner,null)
  }
  const s=snap();s.actualWinner='Zimbabwe'
  assert.equal(getTossMarketStatus(s,{},now).winner,'Zimbabwe')
})

test('winner aliases follow team identity even when the public scorecard reverses its runners',()=>{
  const s=snap();s.crex={scorecard:{team1:{name:'Zimbabwe',shortName:'ZIM'},team2:{name:'Afghanistan',shortName:'AFG'},
    tossText:'AFG won the toss and chose to bowl'}}
  assert.equal(getTossMarketStatus(s,{},now).winner,'Afghanistan')
})

test('fresh snapshots can have old trades; stale snapshots do not become fresh when the UI re-renders',()=>{
  const s=snap();const first=getTossMarketStatus(s,{},now)
  assert.equal(first.stale,false)
  assert.equal(getTossMarketStatus(s,{},now+120000).stale,true)
  delete s.serverTime
  assert.equal(getTossMarketStatus(s,{},now).sourceTime,null)
  assert.equal(getTossMarketStatus(s,{},now).stale,true)
  assert.match(formatTossTime(now),/8:00 pm IST/i)
})
