const test = require('node:test');
const assert = require('node:assert/strict');
const {predictTossWinner,getLeagueTossPrediction} = require('../utils/tossPredictor');
const {getLeagueTossPrediction:dispatch} = require('../utils/tossLeagueAlgorithms');
const {getTossRuleInputs,UNIVERSAL_TOSS_VERSION,SOUTH_AFRICA_T20_TOSS_VERSION} = require('../utils/universalTossAlgorithm.mjs');
const fixture = (aBack=1098,aLay=115,bBack=734,bLay=46) => ({teamNames:['Alpha','Beta'],
  teams:{Alpha:{trades:[{type:'back',price:2,size:aBack},{type:'lay',price:2,size:aLay}]},
    Beta:{trades:[{type:'back',price:2,size:bBack},{type:'lay',price:2,size:bLay}]}},
  deepMetrics:{totals:{team1:100,team2:300}}});

test('screenshot risk totals 1213 vs 780 select the second team before every existing rule', () => {
  for (const league of ['South Africa T20 Challenge','World Championship of Legends T20','WODI',"Women's T20 Spring Challenge",'Unknown League','']) {
    for (const fn of [predictTossWinner,getLeagueTossPrediction,dispatch]) {
      const result=fn(fixture(),league);
      assert.equal(result.winnerName,'Beta',league);
      assert.equal(result.ruleFamily,'lower-combined-back-lay-risk');
      assert.equal(result.predictorVersion,UNIVERSAL_TOSS_VERSION);
      assert.equal(result.usedFallback,false);
      assert.deepEqual(result.algorithmEvidence.risk.total,[1213,780]);
    }
  }
});

test('risk uses current displayed liabilities rather than stakes, provider exposure, P/L or provider total', () => {
  const snapshot={teamNames:['Alpha','Beta'],teams:{
    Alpha:{trades:[{type:'back',price:2,size:10}]},Beta:{trades:[{type:'lay',price:1.02,size:1000}]}},
    deepMetrics:{totals:{team1:300,team2:100}},bookmakerExposure:{team1:{backExposure:99999,layExposure:99999},team2:{backExposure:1,layExposure:0}}};
  const result=predictTossWinner(snapshot,'South Africa T20 Challenge');
  assert.equal(result.winnerName,'Alpha');
  assert.ok(result.algorithmEvidence.pl.team1<0);
  assert.equal(result.usedFallback,false);
  assert.equal(result.algorithmEvidence.risk.total[0],10);
  assert.ok(Math.abs(result.algorithmEvidence.risk.total[1]-20)<1e-9);
  assert.equal(getTossRuleInputs(snapshot).mode,'risk');
});

test('a single zero component does not activate fallback; swapping teams preserves the selected team', () => {
  const snapshot=fixture(10,0,0,20);
  assert.equal(predictTossWinner(snapshot).winnerName,'Alpha');
  assert.equal(predictTossWinner(snapshot).usedFallback,false);
  const swapped={...snapshot,teamNames:['Beta','Alpha']};
  assert.equal(predictTossWinner(swapped).winnerName,'Alpha');
});

test('confirmed double-zero side enables the previous general or South Africa fallback only', () => {
  const snapshot=fixture(0,0,20,0);
  const general=predictTossWinner(snapshot,'Caribbean Premier League');
  assert.equal(general.winnerName,'Alpha');
  assert.equal(general.usedFallback,true);
  assert.equal(general.ruleFamily,'positive-pl-and-lower-provider-total');
  assert.match(general.reason,/Fallback: Alpha has zero/);
  const southAfrica=predictTossWinner(snapshot,'South Africa T20 Challenge');
  assert.equal(southAfrica.winnerName,'Beta');
  assert.equal(southAfrica.usedFallback,true);
  assert.equal(southAfrica.predictorVersion,SOUTH_AFRICA_T20_TOSS_VERSION);
  const conflicting={...snapshot,deepMetrics:{totals:{team1:300,team2:100}}};
  assert.equal(predictTossWinner(conflicting,'Caribbean Premier League'),null);
  const bothZero=fixture(0,0,0,0);
  assert.equal(predictTossWinner(bothZero,'Caribbean Premier League'),null);
  assert.equal(predictTossWinner(bothZero,'South Africa T20 Challenge').winnerName,'Beta');
});

test('missing, malformed or tied nonzero risk abstains rather than falling through to a provider rule', () => {
  for (const snapshot of [
    {...fixture(),teams:undefined},
    {...fixture(),teams:{Alpha:{trades:[{type:'back',price:2,size:1}]}}},
    {...fixture(),teams:{Alpha:{trades:[{type:'back',price:0,size:1}]},Beta:fixture().teams.Beta}},
    fixture(10,5,5,10),{...fixture(),error:'feed unavailable'},
  ]) {
    assert.equal(predictTossWinner(snapshot,'South Africa T20 Challenge'),null);
    assert.equal(getTossRuleInputs(snapshot).mode,'risk');
  }
});

test('frontend and all saved snapshot predictions follow the priority and only zero-risk fallback', async () => {
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
    if (inputs.mode==='risk' && inputs.available && inputs.risk.total[0]!==inputs.risk.total[1]) {
      assert.equal(result.winnerName,snapshot.teamNames[inputs.risk.total[0]<inputs.risk.total[1]?0:1]);
    }
    if (result?.usedFallback) assert.ok(inputs.risk.zeroTeams.length>0);
  }
});
