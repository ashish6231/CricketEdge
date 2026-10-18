const test = require('node:test');
const assert = require('node:assert/strict');
const {predictTossWinner,getLeagueTossPrediction} = require('../utils/tossPredictor');
const {getLeagueTossPrediction:dispatch} = require('../utils/tossLeagueAlgorithms');
const {isSouthAfricaT20TossLeague,SOUTH_AFRICA_T20_TOSS_VERSION,getTossRuleInputs,selectTossWinner} = require('../utils/universalTossAlgorithm.mjs');
const input = () => ({teamNames:['Alpha','Beta'],deepMetrics:{totals:{team1:100,team2:300}},
  teams:{Alpha:{trades:[]},Beta:{trades:[{type:'back',price:2,size:20}]}}});
const league = 'South Africa T20 Challenge';

test('South Africa T20 picks the higher current provider total only on confirmed zero-risk fallback', () => {
  for (const fn of [predictTossWinner,getLeagueTossPrediction,dispatch]) {
    const result = fn(input(),league);
    assert.equal(result.winner || result.winnerName,'Beta');
    assert.equal(result.predictorVersion,SOUTH_AFRICA_T20_TOSS_VERSION);
    assert.equal(result.activeSignals,1);
    assert.equal(result.algorithmEvidence.pl.team2,-20);
    assert.equal(result.algorithmEvidence.requirePositivePl,false);
    assert.equal(predictTossWinner({...input(),teams:undefined},league),null);
    assert.equal(fn({...input(),deepMetrics:{totals:{team1:300,team2:100}}},league).winnerName,'Alpha');
  }
});

test('explicit league metadata and aliases select the exception, never team nationality', () => {
  for (const name of [league,'South Africa T20 Challenge 2026','South African T20 Challenge','South Africa T20']) {
    assert.equal(isSouthAfricaT20TossLeague(name),true);
    for (const arg of [name,{competitionName:name},{seriesName:name}]) assert.equal(predictTossWinner(input(),arg).winnerName,'Beta');
  }
  for (const name of ['SA20','CSA Womens T20','South Africa T20 Challenge Women','International Twenty20 Matches',"Women's T20 Spring Challenge"]) {
    assert.equal(isSouthAfricaT20TossLeague(name),false);
    assert.equal(predictTossWinner(input(),name).winnerName,'Alpha');
  }
  const national = input();
  national.teamNames = ['South Africa','Australia'];
  national.teams = {'South Africa':national.teams.Alpha,Australia:national.teams.Beta};
  assert.equal(predictTossWinner(national,'International Twenty20 Matches').winnerName,'South Africa');
  assert.equal(predictTossWinner({...input(),competitionName:league}).winnerName,'Beta');
  assert.equal(predictTossWinner({...input(),competitionName:league},'Caribbean Premier League').winnerName,'Alpha');
});

test('missing or equal totals abstain and the exception never reads result labels or pre-match values over current totals', () => {
  for (const values of [undefined,{team1:100,team2:100},{team1:100},{team1:-1,team2:100}]) {
    const snapshot = {...input(),deepMetrics:values ? {totals:values} : undefined};
    assert.equal(predictTossWinner(snapshot,league),null);
  }
  assert.equal(predictTossWinner({...input(),actualWinner:'Alpha',preMatchTotalBets:{team1:999999,team2:1},preMatchPnl:{team1:999,team2:-999}},league).winnerName,'Beta');
});

test('saved South Africa T20 replay follows risk-first priority and its isolated fallback', async () => {
  const {predictTossWinner:frontend} = await import('../../frontend/src/utils/tossPredictor.js');
  const rows = require('../data/toss_dataset.json').records.filter(record => record.competitionName === league);
  assert.ok(rows.length > 0);
  for (const record of rows) {
    const inputs = getTossRuleInputs(record.snapshot,record.competitionName);
    const expected = inputs.available ? selectTossWinner(inputs)?.winner ?? null : null;
    assert.equal(frontend(record.snapshot,record.competitionName)?.winnerName ?? null,expected,record.matchId);
  }
});
