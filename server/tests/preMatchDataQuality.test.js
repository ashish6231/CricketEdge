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

test('support/activity capture quality requires activity while allowing missing context P/L',()=>{
 const options={requirePnl:false,requireActivity:true};
 const snapshot={...valid,preMatchPnl:null,preMatchTotalBets:{team1:200,team2:100}};
 assert.equal(checkPreMatchDataQuality(snapshot,options).valid,true);
 assert.equal(checkPreMatchDataQuality(snapshot).valid,false);
 for(const activity of [undefined,{team1:200},{team1:200,team2:-1},{team1:Infinity,team2:100}]){
  assert.equal(checkPreMatchDataQuality({...snapshot,preMatchTotalBets:activity},options).valid,false);
 }
});

test('all active match and toss records meet the quality gate',()=>{
 for(const file of ['match_dataset.json','toss_dataset.json']){
  const rows=require('../data/'+file).records;
  for(const r of rows)assert.equal(checkPreMatchDataQuality(r.snapshot).valid,true,`${file}: ${r.matchId}`);
 }
});
