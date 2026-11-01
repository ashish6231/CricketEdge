const test = require('node:test');
const assert = require('node:assert/strict');
const {predictTossWinner,getLeagueTossPrediction} = require('../utils/tossPredictor');
const {getLeagueTossPrediction:dispatch} = require('../utils/tossLeagueAlgorithms');
const {getTossRuleInputs,UNIVERSAL_TOSS_VERSION} = require('../utils/universalTossAlgorithm.mjs');
const fixture = (aBack=1098,aLay=115,bBack=734,bLay=46) => ({teamNames:['Alpha','Beta'],
  teams:{Alpha:{trades:[{type:'back',price:2,size:aBack},{type:'lay',price:2,size:aLay}]},
    Beta:{trades:[{type:'back',price:2,size:bBack},{type:'lay',price:2,size:bLay}]}},
  deepMetrics:{totals:{team1:100,team2:300}}});

test('net exposures 983 vs 688 select the second team before every existing rule', () => {
  for (const league of ['South Africa T20 Challenge','World Championship of Legends T20',"Women's T20 Spring Challenge",'Unknown League','']) {
    for (const fn of [predictTossWinner,getLeagueTossPrediction,dispatch]) {
      const result=fn(fixture(),league);
      assert.equal(result.winnerName,'Beta',league);
      assert.equal(result.ruleFamily,'lower-net-back-minus-lay-exposure');
      assert.equal(result.predictorVersion,UNIVERSAL_TOSS_VERSION);
      assert.equal(result.usedFallback,false);
      assert.deepEqual(result.algorithmEvidence.risk.net,[983,688]);
    }
  }
});

test('risk uses current displayed liabilities rather than stakes, provider exposure, P/L or provider total', () => {
  const snapshot={teamNames:['Alpha','Beta'],teams:{
    Alpha:{trades:[{type:'back',price:2,size:10},{type:'lay',price:2,size:1}]},Beta:{trades:[{type:'back',price:2,size:50},{type:'lay',price:1.02,size:1000}]}},
    deepMetrics:{totals:{team1:300,team2:100}},bookmakerExposure:{team1:{backExposure:99999,layExposure:99999},team2:{backExposure:1,layExposure:0}}};
  const result=predictTossWinner(snapshot,'South Africa T20 Challenge');
  assert.equal(result.winnerName,'Alpha');
  assert.ok(result.algorithmEvidence.pl.team1<0);
  assert.equal(result.usedFallback,false);
  assert.equal(result.algorithmEvidence.risk.net[0],9);
  assert.ok(Math.abs(result.algorithmEvidence.risk.net[1]-30)<1e-9);
  assert.equal(getTossRuleInputs(snapshot).mode,'risk');
});

test('any zero back or lay component blocks every league and cannot fall back', () => {
  for (const league of ['Caribbean Premier League','South Africa T20 Challenge','WBBL','WODI','']) {
    for (const values of [[0,5,20,10],[10,0,20,5],[10,5,0,20],[10,5,20,0],[0,0,20,0],[0,0,0,0]]) {
      const snapshot=fixture(...values);
      const inputs=getTossRuleInputs(snapshot,league);
      assert.equal(inputs.available,false);
      assert.equal(predictTossWinner(snapshot,league),null);
      const result=getLeagueTossPrediction(snapshot,league);
      assert.equal(result.abstain,true);
      assert.equal(result.reason,"Prediction data is incomplete, can't predict.");
      assert.equal(result.usedFallback,false);
    }
  }
});

test('swapping complete teams preserves the selected team', () => {
  const snapshot=fixture(10,5,20,5);
  assert.equal(predictTossWinner(snapshot).winnerName,'Alpha');
  assert.equal(predictTossWinner({...snapshot,teamNames:['Beta','Alpha']}).winnerName,'Alpha');
});

test('missing, malformed or tied nonzero risk abstains rather than falling through to a provider rule', () => {
  for (const snapshot of [
    {...fixture(),teams:undefined},
    {...fixture(),teams:{Alpha:{trades:[{type:'back',price:2,size:1}]}}},
    {...fixture(),teams:{Alpha:{trades:[{type:'back',price:0,size:1}]},Beta:fixture().teams.Beta}},
    fixture(10,5,15,10),{...fixture(),error:'feed unavailable'},
  ]) {
    assert.equal(predictTossWinner(snapshot,'South Africa T20 Challenge'),null);
    assert.equal(getTossRuleInputs(snapshot).mode,'risk');
  }
});

test('frontend and saved snapshots follow league exposure direction without fallback', async () => {
  const {predictTossWinner:frontend}=await import('../../frontend/src/utils/tossPredictor.js');
  const {getMarketExposureFromTrades}=await import('../../frontend/src/utils/bookiePl.js');
  for (const record of require('../data/toss_dataset.json').records) {
    const snapshot=record.snapshot;
    const result=predictTossWinner(snapshot,record.competitionName);
    assert.deepEqual(frontend(snapshot,record.competitionName),result);
    const inputs=getTossRuleInputs(snapshot,record.competitionName);
    const exposure=getMarketExposureFromTrades(snapshot,...snapshot.teamNames);
    assert.equal(inputs.risk.back[0],exposure.team1.backExposure);
    assert.equal(inputs.risk.lay[1],exposure.team2.layExposure);
    if (inputs.mode==='risk' && inputs.available && inputs.risk.net[0]!==inputs.risk.net[1]) {
      assert.equal(result.winnerName,snapshot.teamNames[(inputs.selection==='higher' ? inputs.risk.net[0]>inputs.risk.net[1] : inputs.risk.net[0]<inputs.risk.net[1])?0:1]);
    }
    if (result) assert.equal(result.usedFallback,false);
  }
});
