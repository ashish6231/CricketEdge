const test = require('node:test');
const assert = require('node:assert/strict');
const {predictMatchWinner} = require('../utils/matchWinnerPredictor');
const {predictFrozenLeagueBase,predictFrozenLeagueRules,getLeagueMatchAlgorithm,LEAGUE_MATCH_ALGORITHMS} = require('../utils/normalLeagueMatchPredictor.mjs');
const categories = [
  'Womens International Twenty20 Matches','Womens One Day Internationals','Womens Test Matches',
  'Asian Games Women','CSA Womens Pro50','CSA Womens T20','Canada Super 60 Women',
  'Metro Bank Womens One Day Cup','The Hundred - Womens',"Women's Asia Cup T20",
  "Women's Caribbean Premier League","Women's One Day Matches","Women's T20 County Cup",
  "Women's National Cricket League","Women's T20 Spring Challenge",'Womens Big Bash League',
  'WNCL','WBBL','WCPL','WPL','WT20I','WODI','WBBL 2026','WomensT20', 'ICC Womens T20 World Cup 2026',
];
const input = competitionName => ({competitionName,teamNames:['Alpha','Beta'],preMatchTotalBets:{team1:100,team2:300}});

test('all womens categories and aliases select only the lower pre-match provider total', () => {
  for (const category of categories) for (const predict of [predictMatchWinner,predictFrozenLeagueBase,predictFrozenLeagueRules]) {
    const result = predict(input(category));
    assert.equal(result?.winner,'Alpha',category);
    assert.equal(result.tier,'WOMENS_MATCH_LOWER_PREMATCH_PROVIDER_TOTAL');
    assert.equal(result.providerTotalEvidence.selection,'lower');
    assert.equal(result.algorithmStrategy,'lower-prematch-provider-total');
    assert.equal(result.confidenceCalibrated,false);
    assert.equal(predict({...input(category),preMatchTotalBets:{team1:300,team2:0}}).winner,'Beta');
  }
});

test('women team labels route generic competition names to the lower rule', () => {
  for (const names of [['India Women','England Women'],['India W','England W'],['IND-W','ENG-W']]) {
    const prediction = predictMatchWinner({...input('Test Matches'),teamNames:names});
    assert.equal(prediction.winner,names[0]);
    assert.equal(prediction.providerTotalEvidence.selection,'lower');
  }
  assert.equal(predictMatchWinner({...input('One Day Internationals'),teamNames:['West Indies','England']}).winner,'England');
});

test('zero is valid; equal, missing and invalid pre-match totals abstain without live or old-rule fallbacks', () => {
  for (const category of categories) for (const totals of [undefined,{team1:0,team2:0},{team1:10,team2:10},
    {team1:10},{team1:10,team2:null},{team1:-1,team2:10},{team1:'',team2:10},{team1:NaN,team2:10}]) {
    assert.equal(predictMatchWinner({...input(category),preMatchTotalBets:totals,
      preMatchVolume:{team1:{back:100,lay:0},team2:{back:10,lay:0}},
      preMatchPnl:{team1:100,team2:-100},deepMetrics:{totals:{team1:999,team2:1}}}),null,category);
  }
});

test('live updates, P/L, support, odds, winner labels and old league rules cannot override the lower total', () => {
  const original = input('Womens International Twenty20 Matches');
  const result = predictMatchWinner(original);
  const changed = {...original,actualWinner:'Beta',inPlayTotalBets:{team1:1,team2:999999},
    preMatchVolume:{team1:{back:1,lay:1},team2:{back:999999,lay:999999}},
    preMatchPnl:{team1:-999999,team2:999999},marketSignals:{prediction:{prediction:'Beta'}},
    deepMetrics:{totals:{team1:999999,team2:1}}};
  assert.deepEqual(predictMatchWinner(changed),result);
  assert.equal(predictMatchWinner({...original,teamNames:['Beta','Alpha'],preMatchTotalBets:{team1:300,team2:100}}).winner,'Alpha');
  assert.equal(predictMatchWinner({...original,preMatchTotalBets:undefined,preMatchProviderTotals:{team1:300,team2:100}}).winner,'Beta');
});

test('all registered womens profiles have new independent versions and mens international stays higher', () => {
  const women = LEAGUE_MATCH_ALGORITHMS.filter(profile => /women/i.test(profile.league));
  assert.ok(women.length >= 10);
  assert.equal(new Set(women.map(profile => profile.profile.profileVersion)).size,women.length);
  for (const profile of women) assert.equal(profile.profile.strategy,'lower-prematch-provider-total',profile.league);
  for (const name of ['International Twenty20 Matches','One Day Internationals','Test Matches']) {
    assert.equal(getLeagueMatchAlgorithm(name).profile.strategy,'higher-prematch-provider-total');
    assert.equal(predictMatchWinner(input(name)).winner,'Beta');
  }
});

test('frontend displays the lower signal and replaces a previous higher-total womens lock', async () => {
  const {predictMatchStart,lockMatchStartPrediction} = await import('../../frontend/src/utils/matchStartPredictor.js');
  const current = predictMatchStart(input('Womens International Twenty20 Matches'));
  assert.equal(current.winnerName,'Alpha');
  assert.equal(current.signals.length,1);
  assert.match(current.signals[0].sublabel,/Lower provider total/);
  const old = {...current,winnerName:'Beta',profileVersion:'womens-international-twenty20-matches-higher-prematch-provider-total-v2'};
  assert.equal(lockMatchStartPrediction(current,old,{inPlay:true}).winnerName,'Alpha');
});
