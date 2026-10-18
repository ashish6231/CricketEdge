const test = require('node:test');
const assert = require('node:assert/strict');
const {predictMatchWinner} = require('../utils/matchWinnerPredictor');
const {LEAGUE_MATCH_ALGORITHMS,predictFrozenLeagueBase,predictFrozenLeagueRules,PREDICTOR_VERSION} = require('../utils/normalLeagueMatchPredictor.mjs');
const {isWomensCompetition,isWomensMatch} = require('../utils/providerTotalMatchPredictor.mjs');
const men = LEAGUE_MATCH_ALGORITHMS.filter(algorithm => !isWomensCompetition(algorithm.league));
const input = competitionName => ({competitionName,teamNames:['Alpha','Beta'],preMatchTotalBets:{team1:100,team2:300}});

test('every registered mens league uses higher provider total across all active entry points', () => {
  assert.ok(men.length >= 25);
  for (const algorithm of men) for (const predict of [predictMatchWinner,predictFrozenLeagueBase,predictFrozenLeagueRules]) {
    const result = predict(input(algorithm.league));
    assert.equal(result?.winner,'Beta',algorithm.league);
    assert.equal(result.providerTotalEvidence.selection,'higher');
    assert.equal(result.algorithmStrategy,'higher-prematch-provider-total');
    assert.equal(result.algorithmId,algorithm.algorithmId);
    assert.equal(result.confidenceCalibrated,false);
    assert.equal(predict({...input(algorithm.league),preMatchTotalBets:{team1:300,team2:0}}).winner,'Alpha');
  }
});

test('unregistered mens categories use the same rule and disclose their fallback profile', () => {
  for (const name of ['New Mens League','CSA Division 3','']) {
    const result = predictMatchWinner(input(name));
    assert.equal(result.winner,'Beta');
    assert.equal(result.leagueRegistered,false);
    assert.equal(result.algorithmId,'match-unregistered-league-fallback');
  }
});

test('old volume, trap, P/L, fitted adjustments, results and live totals cannot override any mens pick', () => {
  for (const algorithm of men) {
    const original = input(algorithm.league);
    const changed = {...original,actualWinner:'Alpha',inPlayTotalBets:{team1:999999,team2:0},
      preMatchVolume:{team1:{back:999999,lay:999999},team2:{back:1,lay:0}},
      preMatchPnl:{team1:-99999,team2:99999},marketSignals:{prediction:{prediction:'Alpha'}},
      deepMetrics:{totals:{team1:999999,team2:1}}};
    assert.deepEqual(predictMatchWinner(changed),predictMatchWinner(original),algorithm.league);
    assert.equal(predictFrozenLeagueRules(original,{rules:[{index:0}]}).winner,'Beta');
  }
});

test('missing, equal and invalid pre-match totals abstain for every mens league without live fallback', () => {
  for (const name of [...men.map(algorithm => algorithm.league),'Unknown Mens League']) {
    for (const values of [undefined,{team1:0,team2:0},{team1:10,team2:10},{team1:10},
      {team1:-1,team2:10},{team1:NaN,team2:10},{team1:'',team2:10}]) {
      assert.equal(predictMatchWinner({...input(name),preMatchTotalBets:values,
        preMatchVolume:{team1:{back:100,lay:0},team2:{back:1,lay:0}},
        deepMetrics:{totals:{team1:999,team2:1}}}),null,name);
    }
  }
});

test('saved matches reconcile the universal higher-for-men and lower-for-women selection', () => {
  const records = require('../data/match_dataset.json').records;
  for (const record of records) {
    const snapshot = {...record.snapshot,competitionName:record.competitionName};
    const values = snapshot.preMatchTotalBets;
    if (!values || !snapshot.teamNames || values.team1 === values.team2) continue;
    const winnerIdx = isWomensMatch(snapshot) ? (values.team1 < values.team2 ? 0 : 1) : (values.team1 > values.team2 ? 0 : 1);
    assert.equal(predictMatchWinner(snapshot)?.winner,snapshot.teamNames[winnerIdx],record.matchId);
  }
});

test('frontend shows one higher-provider signal and clears a prior predictor version lock', async () => {
  const {predictMatchStart,lockMatchStartPrediction} = await import('../../frontend/src/utils/matchStartPredictor.js');
  const current = predictMatchStart(input('Caribbean Premier League'));
  assert.equal(current.winnerName,'Beta');
  assert.equal(current.signals.length,1);
  assert.match(current.signals[0].sublabel,/Higher provider total/);
  const old = {...current,winnerName:'Alpha',predictorVersion:'match-v9-cross-market-support'};
  assert.equal(lockMatchStartPrediction(current,old,{inPlay:true}).winnerName,'Beta');
  assert.equal(current.predictorVersion,PREDICTOR_VERSION);
});
