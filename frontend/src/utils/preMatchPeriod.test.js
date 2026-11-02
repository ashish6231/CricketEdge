import test from 'node:test'
import assert from 'node:assert/strict'
import { getPreMatchPeriod } from './preMatchPeriod.js'

const start = Date.parse('2026-11-01T08:00:00Z')
const snapshot = () => ({
  teamNames: ['A', 'B'], startTime: start, serverTime: start + 60000,
  preMatchPnl: {team1:0,team2:0}, preMatchTotalBets: {team1:0,team2:0},
  preMatchVolume: {team1:{back:0,lay:0},team2:{back:0,lay:0}},
  teams: {
    A:{trades:[{type:'back',price:3,size:100,updatedAt:start-1},
      {type:'back',price:100,size:5000,updatedAt:start}]},
    B:{trades:[{type:'lay',price:2,size:50,updatedAt:start-2}]},
  },
})
const captured = () => ({teamNames:['A','B'],startTime:start,
  volume:{team1:{back:300,lay:20},team2:{back:40,lay:70}},
  pnl:{team1:-80,team2:180},bets:{team1:12,team2:34}})

test('zero provider placeholders reveal recorded pre-match stakes and settlement without inventing totals', () => {
  const data=getPreMatchPeriod(snapshot())
  assert.deepEqual(data.volume,{team1:{back:100,lay:0},team2:{back:0,lay:50}})
  assert.deepEqual(data.pnl,{team1:-250,team2:150})
  assert.deepEqual(data.providerTotals,[null,null])
  assert.deepEqual(data.bets,{team1:null,team2:null})
  assert.equal(data.usesRecorded,true)
})

test('updated provider period values replace an older browser capture after kickoff', () => {
  const snap=snapshot();snap.preMatchVolume={team1:{back:400,lay:30},team2:{back:50,lay:80}}
  snap.preMatchPnl={team1:-100,team2:200};snap.preMatchTotalBets={team1:20,team2:40}
  const data=getPreMatchPeriod(snap,{captured:captured()})
  assert.deepEqual(data.volume,snap.preMatchVolume)
  assert.deepEqual(data.pnl,snap.preMatchPnl)
  assert.equal(data.usesRecorded,false)
})

test('a valid pre-start capture survives empty provider fields and remaps selections by name', () => {
  const saved=captured();saved.teamNames=['B','A']
  const data=getPreMatchPeriod(snapshot(),{captured:saved})
  assert.deepEqual(data.volume.team1,saved.volume.team2)
  assert.equal(data.pnl.team1,180);assert.equal(data.bets.team1,34)
  assert.deepEqual(data.providerTotals,[34,12])
  assert.equal(data.usesRecorded,false)
})

test('unrelated captures and unknown kickoff times cannot supply period values', () => {
  const saved=captured();saved.startTime=start-3600000
  assert.equal(getPreMatchPeriod(snapshot(),{captured:saved}).volume.team1.back,100)
  const snap=snapshot();delete snap.startTime
  assert.equal(getPreMatchPeriod(snap,{captured:captured()}).volume.team1.back,null)
  assert.deepEqual(getPreMatchPeriod(snap,{startTime:start}).volume.team1,{back:100,lay:0})
})

test('true zeros and balanced provider P/L remain valid when reported volume is present', () => {
  const snap=snapshot();snap.preMatchVolume={team1:{back:100,lay:0},team2:{back:0,lay:50}}
  const data=getPreMatchPeriod(snap)
  assert.equal(data.pnl.team1,0);assert.equal(data.volume.team1.lay,0)
  assert.equal(data.bets.team1,0);assert.equal(data.providerTotals[0],0)
  snap.teams={A:{trades:[]},B:{trades:[]}};snap.preMatchVolume={team1:{back:0,lay:0},team2:{back:0,lay:0}}
  assert.equal(getPreMatchPeriod(snap).volume.team1.back,0)
})

test('malformed or untimed history stays unavailable when provider fields are missing', () => {
  for(const corrupt of [s=>delete s.teams.A.trades[0].updatedAt,s=>s.teams.A.trades[0].price=1]) {
    const snap=snapshot();corrupt(snap);delete snap.preMatchVolume;delete snap.preMatchPnl
    const data=getPreMatchPeriod(snap)
    assert.equal(data.volume.team1.back,null);assert.equal(data.pnl.team2,null)
    assert.equal(data.volume.team2.lay,50)
  }
})

test('Draw contributes to multi-outcome settlement and live/future rows stay excluded', () => {
  const snap=snapshot();snap.teamNames=['B','The Draw','A']
  snap.teams['The Draw']={trades:[{type:'back',price:5,size:10,updatedAt:start-1}]}
  snap.teams.B.trades.push({type:'back',price:4,size:900,updatedAt:snap.serverTime+1})
  const data=getPreMatchPeriod(snap)
  assert.deepEqual(data.pnl,{team1:160,team2:10,team3:-240})
  assert.deepEqual(data.volume.team3,{back:100,lay:0})
})

test('missing one provider side is recovered without replacing its valid opposite side', () => {
  const snap=snapshot();snap.preMatchVolume.team1={back:400}
  const data=getPreMatchPeriod(snap)
  assert.deepEqual(data.volume.team1,{back:400,lay:0})
  assert.equal(data.sources.volume.team1.back,'provider')
  assert.equal(data.sources.volume.team1.lay,'recorded')
})

test('an empty recorded selection still participates in observed settlement but is not claimed complete', () => {
  const snap=snapshot();snap.teams.B.trades=[];delete snap.preMatchVolume;delete snap.preMatchPnl
  const data=getPreMatchPeriod(snap)
  assert.equal(data.pnl.team1,-200);assert.equal(data.pnl.team2,100)
  assert.equal(data.volume.team2.back,null)
})

test('seeded list data cannot masquerade as captured pre-match metrics', () => {
  const snap=snapshot();snap._seeded=true
  const data=getPreMatchPeriod(snap,{captured:captured()})
  assert.equal(data.pnl.team1,null);assert.equal(data.volume.team1.back,null)
  assert.deepEqual(data.providerTotals,[null,null])
})

test('server-retained exposure also recovers stakes and observed P/L when live history has rolled away',()=>{
  const snap=snapshot();snap.teams={A:{trades:[]},B:{trades:[]}}
  snap.preMatchExposure={team1:{backExposure:200,layExposure:0,backStake:100,layStake:0,recordedTrades:1},
    team2:{backExposure:0,layExposure:50,backStake:0,layStake:50,recordedTrades:1}}
  const data=getPreMatchPeriod(snap)
  assert.deepEqual(data.volume,{team1:{back:100,lay:0},team2:{back:0,lay:50}})
  assert.deepEqual(data.pnl,{team1:-250,team2:150})
  assert.equal(data.usesRecorded,true)
})
