const test = require('node:test');
const assert = require('node:assert/strict');
const {checkPreMatchDataQuality} = require('../utils/preMatchDataQuality.mjs');
const valid = {teamNames:['A','B'],preMatchVolume:{team1:{back:100,lay:0},team2:{back:0,lay:0}},preMatchPnl:{team1:-100,team2:100}};

test('one zero-flow team is permitted; both zero-flow teams and missing fields are rejected',()=>{
 assert.equal(checkPreMatchDataQuality(valid).valid,true);
 assert.equal(checkPreMatchDataQuality({...valid,preMatchVolume:{team1:{back:0,lay:0},team2:{back:0,lay:0}}}).reason,'both-teams-zero-pre-match-flow');
 assert.equal(checkPreMatchDataQuality({...valid,preMatchVolume:{team1:{back:null,lay:null},team2:{back:null,lay:null}}}).valid,false);
 assert.equal(checkPreMatchDataQuality({...valid,preMatchPnl:null}).valid,false);
 assert.equal(checkPreMatchDataQuality({...valid,preMatchTotalBets:{team1:NaN,team2:1}}).valid,false);
 assert.equal(checkPreMatchDataQuality({...valid,teamNames:['A',' a ']}).valid,false);
});

test('all active match and toss records meet the quality gate',()=>{
 for(const file of ['match_dataset.json','toss_dataset.json']){
  const rows=require('../data/'+file).records;
  for(const r of rows)assert.equal(checkPreMatchDataQuality(r.snapshot).valid,true,`${file}: ${r.matchId}`);
 }
});

// Keep capture integration independent of external score services.
const crexPath=require.resolve('../services/crexService');
require.cache[crexPath]={id:crexPath,filename:crexPath,loaded:true,exports:{getCrexOverview:async()=>[],findCrexMatch:()=>null,getCrexMatchDetail:async()=>null}};
const {captureEndedMatches}=require('../services/matchCapture');
const {captureEndedTosses}=require('../services/tossCapture');
for(const [name,capture] of [['match',captureEndedMatches],['toss',captureEndedTosses]]){
 test(`${name} capture never saves incomplete, both-zero or failed snapshots`,async()=>{
  const snapshots=[valid,{...valid,preMatchVolume:{team1:{back:0,lay:0},team2:{back:0,lay:0}}},{...valid,preMatchPnl:null},{error:'failed feed'}];
  const records=[],matches=snapshots.map((_,i)=>({matchId:String(i),status:'ended',totalMatched:100,matchName:'A v B',competitionName:'T20 Matches'}));
  const scraper={getAllCricketMatches:async()=>({matches}),getAllTossMatches:async()=>matches,getCricketSnapshot:async id=>structuredClone(snapshots[Number(id)]),getTossSnapshot:async id=>structuredClone(snapshots[Number(id)])};
  const store={load:async()=>({records:[]}),upsertPendingCapture:async row=>{records.push(row);return {created:true};}};
  const summary=await capture({scraper,store,predictMatchWinner:()=>({winner:'A'}),predictTossWinner:()=>({winnerName:'A',risk:{},matchedRules:[]})});
  assert.equal(summary.captured,1);assert.equal(summary.skipped,2);assert.equal(summary.failed,1);
  assert.equal(records.length,1);assert.equal(records[0].matchId,'0');
 });
}
