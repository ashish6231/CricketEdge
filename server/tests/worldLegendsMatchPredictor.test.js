const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { predictNormalLeagueMatch, predictFrozenLeagueBase, predictFrozenLeagueRules, getLeagueMatchAlgorithm } = require('../utils/normalLeagueMatchPredictor.mjs');
const league='World Championship of Legends T20';
const input={competitionName:league,teamNames:['India Legends','England Legends'],preMatchTotalBets:{team1:100,team2:300}};

test('Legends match picks higher reported activity without requiring back/lay or P/L',()=>{
  for(const predict of [predictNormalLeagueMatch,predictFrozenLeagueBase,predictFrozenLeagueRules]) {
    const result=predict(input);
    assert.equal(result.winner,'England Legends');
    assert.equal(result.reportedActivityEvidence.selection,'higher');
    assert.equal(result.reportedActivityEvidence.signalCount,1);
    assert.equal(result.tier,'WORLD_LEGENDS_MATCH_HIGHER_ACTIVITY');
    assert.equal(result.confidenceCalibrated,false);
  }
  assert.equal(predictNormalLeagueMatch({...input,preMatchTotalBets:{team1:300,team2:0}}).winner,'India Legends');
});

test('Legends ignores support, provider totals, trap, P/L, live activity and result labels',()=>{
  const baseline=predictNormalLeagueMatch(input);
  const altered={...input,preMatchVolume:{team1:{back:99999,lay:0},team2:{back:0,lay:0}},
    preMatchPnl:{team1:-999999,team2:999999},inPlayTotalBets:{team1:999999,team2:1},
    preMatchProviderTotals:{team1:999999,team2:1},actualWinner:'India Legends',marketSignals:{prediction:{prediction:'India Legends'}}};
  assert.deepEqual(predictNormalLeagueMatch(altered),baseline);
  assert.equal(predictNormalLeagueMatch({...input,teamNames:[...input.teamNames].reverse(),preMatchTotalBets:{team1:300,team2:100}}).winner,baseline.winner);
});

test('Legends missing, equal and invalid activity abstains without fallback; aliases route correctly',()=>{
  for(const activity of [undefined,{team1:0,team2:0},{team1:10,team2:10},{team1:10},{team1:10,team2:null},{team1:-1,team2:10},{team1:10,team2:NaN},{team1:10,team2:Infinity}])
    assert.equal(predictNormalLeagueMatch({...input,preMatchTotalBets:activity,preMatchVolume:{team1:{back:10,lay:1},team2:{back:1,lay:1}}}),null);
  for(const name of [league,'World Championship of Legends 2026','WCL','WCL T20 2026']) assert.equal(getLeagueMatchAlgorithm(name).algorithmId,getLeagueMatchAlgorithm(league).algorithmId);
  assert.notEqual(getLeagueMatchAlgorithm('Legends League Cricket')?.algorithmId,getLeagueMatchAlgorithm(league).algorithmId);
});

test('historical Legends match replay scores the requested rule without claiming perfection',async()=>{
  const dataset=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/match_dataset.json'),'utf8'));
  const outcomes=JSON.parse(fs.readFileSync(path.join(__dirname,'../../reports/match-predictions/world-legends/outcomes.json'),'utf8'));
  const {runWorldLegendsBacktest}=await import('../../reports/match-predictions/world-legends/backtest.mjs');
  const report=runWorldLegendsBacktest(dataset,outcomes);
  assert.equal(report.summary.completedWithVerifiedWinner,3);
  assert.equal(report.summary.correct,2);
  assert.equal(report.summary.wrong,1);
  assert.equal(report.rows.find(r=>r.matchId==='36130557').currentPrediction,'West Indies Legends');
  assert.equal(report.rows.find(r=>r.matchId==='36128071').verdict,'Unscored');
});

test('frontend uses one higher-activity signal and discards previous profile locks',async()=>{
  const {predictMatchStart,lockMatchStartPrediction}=await import('../../frontend/src/utils/matchStartPredictor.js');
  const result=predictMatchStart(input);
  assert.equal(result.winnerName,'England Legends');
  assert.equal(result.signals.length,1);
  assert.match(result.signals[0].sublabel,/Higher activity/);
  const old={...result,profileVersion:'league-v1-0cae91a464f8',winnerName:'India Legends'};
  assert.equal(lockMatchStartPrediction(result,old).winnerName,result.winnerName);
});
