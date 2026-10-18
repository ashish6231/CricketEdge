const test = require('node:test');
const assert = require('node:assert/strict');
const {predictTossWinner,getLeagueTossPrediction,PREDICTOR_VERSION} = require('../utils/tossPredictor');
const {getLeagueTossPrediction:dispatch} = require('../utils/tossLeagueAlgorithms');
const {getTossRuleInputs,selectTossWinner} = require('../utils/universalTossAlgorithm.mjs');
const {getBookiePlFromMatchedTrades} = require('../utils/bookiePl.mjs');
const fixture = () => ({teamNames:['Alpha','Beta'],deepMetrics:{totals:{team1:100,team2:300}},
  teams:{Alpha:{trades:[{type:'lay',price:2,size:10}]},Beta:{trades:[{type:'back',price:2,size:20}]}}});

test('positive P/L and lower provider total must belong to the same team', () => {
  const names = ['Alpha','Beta'];
  assert.equal(selectTossWinner({teamNames:names,providerTotals:[100,300],pl:[30,-30]}).winner,'Alpha');
  assert.equal(selectTossWinner({teamNames:names,providerTotals:[300,100],pl:[-30,30]}).winner,'Beta');
  assert.equal(selectTossWinner({teamNames:names,providerTotals:[100,300],pl:[30,40]}).winner,'Alpha');
  for (const values of [[100,300,-30,30],[100,300,0,30],[100,300,-10,-20],[100,100,30,-30]]) {
    assert.equal(selectTossWinner({teamNames:names,providerTotals:values.slice(0,2),pl:values.slice(2)}),null);
  }
  assert.equal(selectTossWinner({teamNames:names,providerTotals:[0,100],pl:[1,-1]}).winner,'Alpha');
});

test('all leagues prioritize combined risk ahead of provider and P/L rules', () => {
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

test('uses displayed current settlement and totals, ignoring conflicting pre-match and provider P/L summaries', () => {
  const original = fixture();
  const changed = {...original,preMatchPnl:{team1:-999,team2:999},preMatchTotalBets:{team1:999,team2:1},
    actualWinner:'Beta',marketSignals:{prediction:{prediction:'Beta'}},
    deepMetrics:{...original.deepMetrics,simplePL:{team1_win:-999,team2_win:999}},
    cricket:{preMatchTotalBets:{team1:999,team2:1}}};
  assert.deepEqual(predictTossWinner(changed),predictTossWinner(original));
  assert.deepEqual(getTossRuleInputs(changed).pl,[30,-30]);
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

test('zero-risk provider fallback matches the toss screen when current totals are absent', () => {
  const snapshot = {...fixture(),deepMetrics:undefined,preMatchTotalBets:{team1:100,team2:300}};
  snapshot.teams.Alpha.trades=[];
  assert.equal(predictTossWinner(snapshot).winnerName,'Alpha');
  assert.deepEqual(getTossRuleInputs(snapshot).providerTotals,[100,300]);
});

test('frontend and backend share both the exact P/L calculation and toss prediction', async () => {
  const frontend = await import('../../frontend/src/utils/tossPredictor.js');
  const bookie = await import('../../frontend/src/utils/bookiePl.js');
  assert.equal(bookie.getBookiePlFromMatchedTrades,getBookiePlFromMatchedTrades);
  assert.deepEqual(frontend.predictTossWinner(fixture()),predictTossWinner(fixture()));
  for (const record of require('../data/toss_dataset.json').records) {
    const inputs = getTossRuleInputs(record.snapshot,record.competitionName);
    const pl = bookie.getBookiePlFromMatchedTrades(record.snapshot,...record.snapshot.teamNames);
    assert.deepEqual(inputs.pl,[pl.pl1,pl.pl2]);
    const pick = inputs.available ? selectTossWinner(inputs) : null;
    assert.equal(predictTossWinner(record.snapshot,record.competitionName)?.winnerName ?? null,pick?.winner ?? null,record.matchId);
  }
});
