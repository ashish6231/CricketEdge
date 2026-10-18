const test = require('node:test');
const assert = require('node:assert/strict');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { predictFrozenLeagueBase, predictFrozenLeagueRules, getLeagueMatchAlgorithm } = require('../utils/normalLeagueMatchPredictor.mjs');
const league = 'International Twenty20 Matches';
const categories = ['International Twenty20 Matches','One Day Internationals','Test Matches',
  'Womens International Twenty20 Matches','Womens One Day Internationals','Unofficial International Matches'];
const input = {competitionName:league,teamNames:['India','West Indies'],preMatchTotalBets:{team1:100,team2:300}};

for (const predict of [predictMatchWinner,predictFrozenLeagueBase,predictFrozenLeagueRules]) {
  test(`${predict.name}: higher frozen provider total is the only rule without volume or P/L requirements`, () => {
    const result = predict(input);
    assert.equal(result.winner,'West Indies');
    assert.equal(result.providerTotalEvidence.selection,'higher');
    assert.equal(result.tier,'INTERNATIONAL_MATCH_HIGHER_PREMATCH_PROVIDER_TOTAL');
    assert.equal(result.algorithmStrategy,'higher-prematch-provider-total');
    assert.equal(result.confidenceCalibrated,false);
    assert.equal(predict({...input,preMatchTotalBets:{team1:300,team2:0}}).winner,'India');
    const changed = {...input,actualWinner:'India',preMatchVolume:{team1:{back:999999,lay:0},team2:{back:1,lay:0}},
      preMatchPnl:{team1:-99999,team2:99999},inPlayTotalBets:{team1:999999,team2:0},
      deepMetrics:{totals:{team1:999999,team2:1}},marketSignals:{prediction:{prediction:'India'}}};
    assert.deepEqual(predict(changed),result);
  });
}

test('equal, missing, partial or malformed pre-match values abstain without a live fallback', () => {
  for (const values of [undefined,{team1:0,team2:0},{team1:10,team2:10},{team1:10},
    {team1:10,team2:null},{team1:-1,team2:10},{team1:10,team2:NaN},{team1:10,team2:Infinity},{team1:'',team2:10}]) {
    assert.equal(predictMatchWinner({...input,preMatchTotalBets:values,
      preMatchVolume:{team1:{back:100,lay:1},team2:{back:1,lay:0}},
      inPlayTotalBets:{team1:999,team2:1},deepMetrics:{totals:{team1:999,team2:1}}}),null);
  }
});

test('explicit frozen totals work without activity; provider period ledger takes precedence over an old capture', () => {
  assert.equal(predictMatchWinner({...input,preMatchTotalBets:undefined,preMatchProviderTotals:{team1:400,team2:100}}).winner,'India');
  assert.equal(predictMatchWinner({...input,preMatchProviderTotals:{team1:400,team2:100}}).winner,'West Indies');
  assert.equal(predictMatchWinner({...input,teamNames:[...input.teamNames].reverse(),preMatchTotalBets:{team1:300,team2:100}}).winner,'West Indies');
  assert.equal(predictMatchWinner({...input,teamNames:['India',' India ']}),null);
});

test('international aliases use higher totals for men and lower totals for women', () => {
  for (const name of [...categories,'T20I','International T20 Matches','ODI','WODI','WT20I',
    'Women’s Test Matches','ICC Cricket World Cup League 2',
    "ICC Men's T20 WC Asia Qualifier",'ICC Womens T20 World Cup 2026']) {
    const women = /women|^wodi$|^wt20i$/i.test(name);
    assert.equal(predictMatchWinner({...input,competitionName:name}).winner,women ? 'India' : 'West Indies');
    assert.equal(getLeagueMatchAlgorithm(name).profile.strategy,`${women ? 'lower' : 'higher'}-prematch-provider-total`);
  }
  for (const name of ["Women's T20 Spring Challenge",'World Championship of Legends T20','Caribbean Premier League','One Day Matches']) {
    assert.equal(getLeagueMatchAlgorithm(name).profile.strategy,`${/women/i.test(name) ? 'lower' : 'higher'}-prematch-provider-total`);
  }
});

test('saved international replay follows the configured provider-total direction', () => {
  const records = require('../data/match_dataset.json').records.filter(record => /^(?:higher|lower)-prematch-provider-total$/.test(getLeagueMatchAlgorithm(record.competitionName)?.profile.strategy || ''));
  assert.ok(records.length > 0);
  for (const record of records) {
    const snapshot = {...record.snapshot,competitionName:record.competitionName};
    const values = snapshot.preMatchTotalBets;
    const lower = getLeagueMatchAlgorithm(record.competitionName).profile.strategy.startsWith('lower');
    const winnerIdx = lower ? (values.team1 < values.team2 ? 0 : 1) : (values.team1 > values.team2 ? 0 : 1);
    const expected = values.team1 === values.team2 ? null : snapshot.teamNames[winnerIdx];
    assert.equal(predictMatchWinner(snapshot)?.winner ?? null,expected,record.matchId);
  }
});

test('frontend agrees with backend, shows one provider-total signal and invalidates older profile locks', async () => {
  const {predictMatchStart,lockMatchStartPrediction} = await import('../../frontend/src/utils/matchStartPredictor.js');
  const current = predictMatchStart(input);
  assert.equal(current.winnerName,predictMatchWinner(input).winner);
  assert.equal(current.signals.length,1);
  assert.equal(current.signals[0].label,'Pre-match provider total');
  const old = {...current,winnerName:'India',profileVersion:'league-v1-d09f91f0465c'};
  assert.equal(lockMatchStartPrediction(current,old,{inPlay:true}).winnerName,'West Indies');
});


test('every international category ignores generic adjustments and abstains on a missing pre-match signal', () => {
  for (const category of categories) {
    const snapshot = {...input,competitionName:category};
    for (const predict of [predictMatchWinner,predictFrozenLeagueBase,predictFrozenLeagueRules]) {
      assert.equal(predict(snapshot).winner,/womens/i.test(category) ? 'India' : 'West Indies',category);
      assert.equal(predict({...snapshot,preMatchTotalBets:undefined,
        preMatchVolume:{team1:{back:100,lay:0},team2:{back:0,lay:1}},
        deepMetrics:{totals:{team1:999,team2:1}}}),null,category);
    }
  }
});
