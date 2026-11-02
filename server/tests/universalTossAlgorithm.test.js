const test = require('node:test');
const assert = require('node:assert/strict');
const {predictTossWinner,getLeagueTossPrediction} = require('../utils/tossPredictor');
const {getLeagueTossPrediction:dispatch} = require('../utils/tossLeagueAlgorithms');
const {getTossRuleInputs,selectTossWinner} = require('../utils/universalTossAlgorithm.mjs');
const {getSimpleBookiePl} = require('../utils/bookiePl.mjs');
const fixture = () => ({teamNames:['Alpha','Beta'],deepMetrics:{totals:{team1:100,team2:300}},
  teams:{Alpha:{trades:[{type:'back',price:2,size:1},{type:'lay',price:2,size:11}]},Beta:{trades:[{type:'back',price:2,size:21},{type:'lay',price:2,size:1}]}}});

test('signed net exposure selects higher or lower only with complete positive back and lay values', () => {
  const teamNames = ['Alpha','Beta'];
  for (const risk of [{back:[5,10],lay:[5,20]},{back:[5,10],lay:[20,20]}]) {
    assert.equal(selectTossWinner({teamNames,risk}).winner,risk.lay[0]===5 ? 'Beta' : 'Alpha');
    assert.equal(selectTossWinner({teamNames,risk,selection:'higher'}).winner,risk.lay[0]===5 ? 'Alpha' : 'Beta');
  }
  for (const risk of [undefined,{back:[10,20],lay:[5,15]},{back:[0,10],lay:[5,20]},
    {back:[5,10],lay:[null,20]},{back:[Infinity,10],lay:[5,20]}]) {
    assert.equal(selectTossWinner({teamNames,risk}),null);
  }
});

test('all league entry points use net exposure ahead of provider and P/L rules', () => {
  const {LEAGUE_MATCH_ALGORITHMS} = require('../utils/normalLeagueMatchPredictor.mjs');
  for (const name of [...LEAGUE_MATCH_ALGORITHMS.map(profile => profile.league),'Unknown League','']) {
    const snapshot = {...fixture(),competitionName:name};
    const inputs = getTossRuleInputs(snapshot,name);
    for (const fn of [predictTossWinner,getLeagueTossPrediction,dispatch]) {
      const result = fn(snapshot,name);
      assert.equal(result.winner || result.winnerName,inputs.rule.selection === 'higher' ? 'Beta' : 'Alpha',name);
      assert.equal(result.predictorVersion,inputs.rule.predictorVersion);
      assert.equal(result.activeSignals,inputs.rule.signalCount);
      assert.equal(result.algorithmEvidence.inputSource,'toss-current-display');
    }
  }
});

test('P/L matches the match-page formula while pre-match values and result labels cannot affect the toss selection', () => {
  const original = fixture();
  const changed = {...original,preMatchPnl:{team1:-999,team2:999},preMatchTotalBets:{team1:999,team2:1},
    actualWinner:'Beta',marketSignals:{prediction:{prediction:'Beta'}},
    deepMetrics:{...original.deepMetrics,simplePL:{team1_win:-999,team2_win:999}},
    cricket:{preMatchTotalBets:{team1:999,team2:1}}};
  assert.equal(predictTossWinner(changed).winnerName,predictTossWinner(original).winnerName);
  assert.deepEqual(predictTossWinner(changed).algorithmEvidence.risk,predictTossWinner(original).algorithmEvidence.risk);
  assert.deepEqual(getTossRuleInputs(changed).pl,[-999,999]);
  assert.deepEqual(getTossRuleInputs(original).pl,[10,-20]);
  const flipped = fixture();
  flipped.deepMetrics.totals = {team1:300,team2:100};
  [flipped.teams.Alpha.trades,flipped.teams.Beta.trades] = [flipped.teams.Beta.trades,flipped.teams.Alpha.trades];
  assert.equal(predictTossWinner(flipped).winnerName,'Beta');
});

test('missing, equal, invalid values or unavailable trades never trigger an old league fallback', () => {
  const changes = [
    {teams:undefined},{teams:{Alpha:{trades:[]},Beta:{trades:[]}}},
    {teams:{Alpha:{trades:[{type:'back',size:10,price:1}]},Beta:{trades:[]}}},
    {teamNames:['Alpha',' alpha ']},{error:'feed failed'},
  ];
  for (const change of changes) {
    const snapshot = {...fixture(),...change};
    assert.equal(predictTossWinner(snapshot,'World Championship of Legends T20'),null);
    assert.equal(dispatch(snapshot,'WODI').abstain,true);
  }
});

test('zero exposure blocks predictions even when provider totals are available', () => {
  const snapshot = {...fixture(),deepMetrics:undefined,preMatchTotalBets:{team1:100,team2:300}};
  snapshot.teams.Alpha.trades=[];
  assert.equal(predictTossWinner(snapshot),null);
  assert.deepEqual(getTossRuleInputs(snapshot).providerTotals,[100,300]);
});

test('frontend and backend share both the exact P/L calculation and toss prediction', async () => {
  const frontend = await import('../../frontend/src/utils/tossPredictor.js');
  const bookie = await import('../../frontend/src/utils/bookiePl.js');
  assert.equal(bookie.getSimpleBookiePl,getSimpleBookiePl);
  assert.deepEqual(frontend.predictTossWinner(fixture()),predictTossWinner(fixture()));
  for (const record of require('../data/toss_dataset.json').records) {
    const inputs = getTossRuleInputs(record.snapshot,record.competitionName);
    const pl = bookie.getSimpleBookiePl(record.snapshot,...record.snapshot.teamNames);
    assert.deepEqual(inputs.pl,[pl.pl1,pl.pl2]);
    const pick = inputs.available ? selectTossWinner(inputs) : null;
    assert.equal(predictTossWinner(record.snapshot,record.competitionName)?.winnerName ?? null,pick?.winner ?? null,record.matchId);
  }
});
