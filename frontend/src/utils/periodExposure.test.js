import test from 'node:test'
import assert from 'node:assert/strict'
import {getPeriodExposure} from './periodExposure.js'
import {capturePreMatchExposure} from '../../../server/utils/preMatchExposure.mjs'
import {getPreMatchTradeActivity} from './selectionVolume.js'
const start=Date.parse('2026-11-01T08:00:00Z')
const trade=(type,size,price,time)=>({type,size,price,updatedAt:time})
const fixture=()=>({teamNames:['A','B'],startTime:start,serverTime:start+600000,tradesComplete:true,teams:{
  A:{trades:[trade('back',100,3,start-1),trade('lay',20,4,start-1),trade('lay',5,3,start),trade('back',10,2.5,start+420000)]},
  B:{trades:[trade('back',30,5,start-1),trade('lay',50,2,start-1),trade('back',30,5,start+600000),trade('lay',10,2,start+600000)]},
}})

test('all four positive exposures allow net while every live period keeps its own priced scope',()=>{
  const snap=fixture(),pre=getPeriodExposure(snap,'A','B')
  assert.deepEqual(pre.team1,{teamName:'A',backExposure:200,layExposure:60,netExposure:140})
  assert.deepEqual(pre.team2,{teamName:'B',backExposure:120,layExposure:50,netExposure:70})
  assert.equal(pre.capture.state,'locked')
  const live=getPeriodExposure(snap,'A','B',{period:'live'})
  assert.equal(live.team1.netExposure,5);assert.equal(live.team2.netExposure,110)
  const recent=getPeriodExposure(snap,'A','B',{period:'3min'})
  assert.equal(recent.team1.netExposure,15);assert.equal(recent.team2.netExposure,110)
})

test('one missing side blocks both net values, never uses P/L and does not display zero exposure',()=>{
  const snap=fixture();snap.serverTime=start-1;snap.teams.A.trades=snap.teams.A.trades.filter(row=>row.type==='back')
  snap.preMatchPnl={team1:12345,team2:67890};snap.bookmakerExposure={team1:{netExposure:99999}}
  const result=getPeriodExposure(snap,'A','B')
  assert.equal(result.team1.backExposure,200);assert.equal(result.team1.layExposure,null)
  assert.equal(result.team1.netExposure,null);assert.equal(result.team2.netExposure,null)
  assert.equal(result.capture.state,'waiting')
})

test('waits for late pre-start data after kickoff without using live trades',()=>{
  const snap=fixture();snap.teams.A.trades=snap.teams.A.trades.filter(row=>row.updatedAt>=start || row.type==='back')
  const pending=getPeriodExposure(snap,'A','B')
  assert.equal(pending.capture.state,'waiting');assert.equal(pending.team1.netExposure,null)
  snap.teams.A.trades.push(trade('lay',30,4,start-1))
  const result=getPeriodExposure(snap,'A','B')
  assert.equal(result.capture.mode,'pre-match');assert.equal(result.capture.capturedAfterStart,true)
  assert.equal(result.team1.backExposure,200);assert.equal(result.team1.layExposure,90)
  assert.equal(result.team1.netExposure,110)
})

test('saved coherent capture freezes exposures, counts and lock time despite newer live history',()=>{
  const snap=capturePreMatchExposure(fixture(),null,{now:start+600000})
  const lockedAt=snap.preMatchCapture.lockedAt
  snap.teams={A:{trades:[]},B:{trades:[]}}
  snap.serverTime=start+3600000
  const result=getPeriodExposure(snap,'A','B')
  assert.equal(result.team1.netExposure,140);assert.equal(result.capture.lockedAt,lockedAt)
  assert.deepEqual(getPreMatchTradeActivity(snap).counts,{A:2,B:2})
})

test('empty, untimed, malformed or future rows do not complete the lock',()=>{
  for(const corrupt of [s=>s.teams.A.trades=[],s=>delete s.teams.A.trades[0].updatedAt,
    s=>s.teams.A.trades[0].price=1,s=>s.teams.A.trades.filter(row=>row.type==='back').forEach(row=>row.updatedAt=s.serverTime+1)]) {
    const snap=fixture();corrupt(snap)
    assert.equal(getPeriodExposure(snap,'A','B').capture.state,'waiting')
    assert.equal(getPeriodExposure(snap,'A','B').team1.netExposure,null)
  }
  const snap=fixture();delete snap.startTime
  assert.equal(getPeriodExposure(snap,'A','B').available,false)
})

test('Draw ordering and repeated zero values cannot bypass the four-value requirement',()=>{
  const snap=fixture();snap.teamNames=['B','The Draw','A'];snap.teams['The Draw']={trades:[]}
  assert.equal(getPeriodExposure(snap,'A','B').team1.netExposure,140)
  snap.teams.A.trades=[];snap.teams.B.trades=[]
  const result=getPeriodExposure(snap,'A','B')
  assert.equal(result.available,false);assert.equal(result.team1.backExposure,null)
})

test('provider-ledger capture fills exposures without inventing missing recorded trade counts',()=>{
  const snap=fixture()
  snap.teams={A:{trades:[trade('back',.01,1.01,start-1)]},B:{trades:[]}}
  snap.preMatchVolume={team1:{back:100,lay:20},team2:{back:30,lay:50}}
  snap.preMatchTotalBets={team1:250,team2:140}
  snap.preMatchPnl={team1:-160,team2:10}
  const captured=capturePreMatchExposure(snap,null,{now:start+600000})
  const exposure=getPeriodExposure(captured,'A','B')
  assert.equal(exposure.team1.backExposure,200);assert.equal(exposure.team2.backExposure,120)
  assert.equal(exposure.team1.layExposure,60);assert.equal(exposure.team2.layExposure,50)
  const counts=getPreMatchTradeActivity(captured)
  assert.equal(counts.counts.A,1);assert.equal(counts.counts.B,null);assert.equal(counts.total,null)
})
