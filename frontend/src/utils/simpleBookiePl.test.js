import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {calcSimpleBookiePl,getSimpleBookiePl} from './bookiePl.js'
import {capturePreMatchExposure} from '../../../server/utils/preMatchExposure.mjs'
const start=Date.parse('2026-11-01T08:00:00Z')
const trade=(type,size,price,time)=>({type,size,price,updatedAt:time})
const fixture=()=>({teamNames:['A','B'],startTime:start,serverTime:start+600000,tradesComplete:true,
  teams:{A:{trades:[trade('back',100,3,start-1),trade('lay',20,4,start-1),trade('lay',5,3,start),trade('back',10,2.5,start+420000)]},
    B:{trades:[trade('back',30,5,start-1),trade('lay',50,2,start-1),trade('back',30,5,start+600000),trade('lay',10,2,start+600000)]}}})

test('simple P/L is own Lay STAKE minus own Back exposure, independent of other stakes and Lay liability',()=>{
  assert.equal(calcSimpleBookiePl(200,20),-180)
  const snap=fixture()
  assert.equal(getSimpleBookiePl(snap,'A','B').pl1,-190)
  snap.teams.B.trades=[trade('lay',99999,99,start-1)]
  assert.equal(getSimpleBookiePl(snap,'A','B').pl1,-190)
})

test('overview keeps original provider simplePL and falls back to the identical raw-field formula',()=>{
  const snap=fixture();snap.deepMetrics={simplePL:{team1_win:123,team2_win:-456},raw:{A_back_expo:200,A_lay_stake:20}}
  assert.equal(getSimpleBookiePl(snap,'A','B').pl1,123)
  delete snap.deepMetrics.simplePL
  assert.equal(getSimpleBookiePl(snap,'A','B').pl1,-180)
  delete snap.deepMetrics
  assert.equal(getSimpleBookiePl(snap,'A','B').pl1,-190)
})

test('pre-match, in-play and last 3 minutes use the same formula on their respective trades',()=>{
  const snap=fixture()
  snap.preMatchPnl={team1:999,team2:999};snap.inPlayPnl={team1:888,team2:888};snap.threeMinPnl={team1:777,team2:777}
  const pre=getSimpleBookiePl(snap,'A','B',null,{period:'pre'})
  const live=getSimpleBookiePl(snap,'A','B',null,{period:'live'})
  const recent=getSimpleBookiePl(snap,'A','B',null,{period:'3min'})
  assert.deepEqual(pre.byName,{A:-180,B:-70})
  assert.deepEqual(live.byName,{A:-10,B:-110})
  assert.deepEqual(recent.byName,{A:-15,B:-110})
  assert.equal(pre.pl1+live.pl1,getSimpleBookiePl(snap,'A','B').pl1)
})

test('locked captures use their frozen exposure and stake after history rolls away and the formula is updated',()=>{
  const snap=capturePreMatchExposure(fixture(),null,{now:start+600000})
  snap.preMatchCapture.pnl={team1:999999,team2:999999}
  snap.teams={A:{trades:[]},B:{trades:[]}}
  const pre=getSimpleBookiePl(snap,'A','B',null,{period:'pre'})
  assert.deepEqual(pre.byName,{A:-180,B:-70})
  const restored=capturePreMatchExposure({...snap,serverTime:start+3600000},snap,{now:start+3600000})
  assert.deepEqual(restored.preMatchCapture.pnl,{team1:-180,team2:-70})
  assert.equal(restored.preMatchCapture.lockedAt,start+600000)
})

test('pre-match formula rejects old locks made from live data and never copies overview P/L',()=>{
  const snap=fixture()
  snap.deepMetrics={simplePL:{team1_win:1000000,team2_win:2000000}}
  const contaminated=capturePreMatchExposure(snap,null,{now:start+600000}).preMatchCapture
  contaminated.version=1;contaminated.mode='after-start';contaminated.exposure.team1.backExposure=999999
  snap.preMatchCapture=contaminated
  assert.deepEqual(getSimpleBookiePl(snap,'A','B',null,{period:'pre'}).byName,{A:-180,B:-70})
  snap.teams.A.trades=snap.teams.A.trades.filter(row=>row.updatedAt>=start)
  snap.teams.B.trades=snap.teams.B.trades.filter(row=>row.updatedAt>=start)
  const resolved=capturePreMatchExposure(snap,contaminated,{now:start+600000})
  assert.equal(resolved.preMatchCapture.state,'waiting')
  assert.deepEqual(getSimpleBookiePl(resolved,'A','B',null,{period:'pre'}).byName,{A:null,B:null})
  assert.equal(getSimpleBookiePl(snap,'A','B').pl1,1000000)
})

test('each tab uses its own reported Lay stake with its own priced Back exposure',()=>{
  const snap=fixture()
  snap.preMatchVolume={team1:{back:100,lay:40},team2:{back:30,lay:60}}
  snap.inPlayVolume={team1:{back:10,lay:12},team2:{back:30,lay:15}}
  snap.threeMinVolume={team1:{back:10,lay:2},team2:{back:30,lay:3}}
  assert.deepEqual(getSimpleBookiePl(snap,'A','B',null,{period:'pre'}).byName,{A:-160,B:-60})
  assert.deepEqual(getSimpleBookiePl(snap,'A','B',null,{period:'live'}).byName,{A:-3,B:-105})
  assert.deepEqual(getSimpleBookiePl(snap,'A','B',null,{period:'3min'}).byName,{A:-13,B:-117})
})

test('future trades and pre-kickoff entries cannot leak into the 3-minute live window',()=>{
  const snap=fixture();snap.serverTime=start+120000
  snap.teams.A.trades=[trade('lay',25,2,start-1),trade('back',10,3,start),trade('lay',999,9,start+120001)]
  assert.equal(getSimpleBookiePl(snap,'A','B',null,{period:'3min'}).pl1,-20)
})

test('missing prices, timestamps, scopes and ledgers stay unavailable rather than borrowing current P/L',()=>{
  for(const corrupt of [s=>delete s.teams.A.trades,s=>delete s.teams.A.trades[0].updatedAt,
    s=>s.teams.A.trades[2].price=1,s=>delete s.startTime,s=>delete s.serverTime]) {
    const snap=fixture();corrupt(snap);snap.deepMetrics={simplePL:{team1_win:12345}}
    assert.equal(getSimpleBookiePl(snap,'A','B',null,{period:'live'}).pl1,null)
  }
  for(const [a,b] of [[null,20],[200,undefined],[-1,20],[200,''],[Infinity,20]])assert.equal(calcSimpleBookiePl(a,b),null)
})

test('Draw ordering keeps every selection P/L attached to its own stakes and matched prices',()=>{
  const snap=fixture();snap.teamNames=['B','The Draw','A'];snap.teams['The Draw']={trades:[trade('back',10,5,start-1),trade('lay',5,9,start-1)]}
  const result=getSimpleBookiePl(snap,'A','B','The Draw',{period:'pre'})
  assert.deepEqual(result.byName,{A:-180,B:-70,'The Draw':-35})
})

test('original overview formula reproduces the saved provider raw fields',()=>{
  const data=JSON.parse(readFileSync(new URL('../../../server/data/match_dataset.json',import.meta.url)))
  let checked=0
  for(const {snapshot:snap} of data.records) {
    if(!snap?.deepMetrics?.simplePL || !snap.deepMetrics.raw)continue
    for(const [field,prefix] of [['team1_win','A'],['team2_win','B']]) {
      const expected=calcSimpleBookiePl(snap.deepMetrics.raw[`${prefix}_back_expo`],snap.deepMetrics.raw[`${prefix}_lay_stake`])
      if(expected==null || snap.deepMetrics.simplePL[field]==null)continue
      assert.ok(Math.abs(expected-snap.deepMetrics.simplePL[field])<.00001)
      checked++
    }
  }
  assert.ok(checked>100)
})
