const test = require('node:test');
const assert = require('node:assert/strict');
const {predictTossWinner,getLeagueTossPrediction} = require('../utils/tossPredictor');
const {isWomensInternationalToss,getWomensInternationalTossPrediction,WOMENS_INTERNATIONAL_TOSS_VERSION} = require('../utils/womensInternationalTossAlgorithm.mjs');
const input = () => ({teamNames:['Alpha','Beta'],preMatchTotalBets:{team1:100,team2:300}});
const categories = ['Womens International Twenty20 Matches','Womens One Day Internationals',
  'Womens Test Matches','WT20I','WODI','ICC Womens T20 World Cup 2026',"Women's Asia Cup T20",'Asian Games Women'];

test('all womens international formats and argument forms select lower frozen toss provider total', () => {
  for (const league of categories) for (const argument of [league,{competitionName:league},{seriesName:league}]) {
    const result = predictTossWinner(input(),argument);
    assert.equal(result.winnerName,'Alpha',league);
    assert.equal(result.predictorVersion,WOMENS_INTERNATIONAL_TOSS_VERSION);
    assert.equal(result.tier,'WOMENS_INTERNATIONAL_TOSS_LOWER_PREMATCH_PROVIDER_TOTAL');
    assert.equal(result.providerTotalEvidence.selection,'lower');
    assert.equal(result.algorithmEvidence.inputSource,'toss-pre-match');
    assert.equal(result.activeSignals,1);
    assert.equal(result.confidence.calibrated,false);
    assert.equal(result.risk.calibrated,false);
    assert.equal(getLeagueTossPrediction(input(),argument).winner,'Alpha');
  }
});

test('zero and strings are valid; explicit frozen values can supply the pre-match provider totals', () => {
  assert.equal(predictTossWinner({...input(),preMatchTotalBets:{team1:300,team2:0}},'WODI').winnerName,'Beta');
  assert.equal(predictTossWinner({...input(),preMatchTotalBets:{team1:'0',team2:'100'}},'WODI').winnerName,'Alpha');
  assert.equal(predictTossWinner({...input(),preMatchTotalBets:undefined,
    preMatchProviderTotals:{team1:300,team2:100}},'WODI').winnerName,'Beta');
});

test('scope excludes mens and domestic womens tosses and recognizes womens labels in generic internationals', () => {
  for (const name of ['International Twenty20 Matches','One Day Internationals','Test Matches','WBBL','WPL',
    "Women's T20 Spring Challenge",'World Championship of Legends T20','']) {
    assert.equal(isWomensInternationalToss(input(),name),false,name);
    const withFlow = {...input(),preMatchVolume:{team1:{back:100,lay:10},team2:{back:20,lay:5}}};
    assert.notEqual(predictTossWinner(withFlow,name)?.predictorVersion,WOMENS_INTERNATIONAL_TOSS_VERSION);
  }
  assert.equal(predictTossWinner({...input(),teamNames:['India Women','England Women']},'Test Matches').winnerName,'India Women');
  assert.equal(predictTossWinner({...input(),competitionName:'WODI'}).winnerName,'Alpha');
  assert.equal(predictTossWinner({...input(),seriesName:'WODI'}).winnerName,'Alpha');
});

test('live values, match market totals, result labels and back/lay traps cannot override or supply toss totals', () => {
  const original = input();
  const result = predictTossWinner(original,'WODI');
  const altered = {...original,actualWinner:'Beta',deepMetrics:{totals:{team1:99999,team2:1}},
    inPlayTotalBets:{team1:99999,team2:1},preMatchPnl:{team1:-99999,team2:99999},
    preMatchVolume:{team1:{back:99999,lay:99999},team2:{back:1,lay:0}},
    marketSignals:{prediction:{prediction:'Beta'}},cricket:{preMatchTotalBets:{team1:99999,team2:1}}};
  assert.deepEqual(predictTossWinner(altered,'WODI'),result);
  assert.deepEqual(original,input());
  assert.equal(predictTossWinner({...altered,preMatchTotalBets:undefined},'WODI'),null);
  assert.equal(predictTossWinner({...original,teamNames:['Beta','Alpha'],preMatchTotalBets:{team1:300,team2:100}},'WODI').winnerName,'Alpha');
});

test('missing, equal, invalid totals and invalid team identity abstain without generic waterfall fallback', () => {
  for (const totals of [undefined,{team1:0,team2:0},{team1:10,team2:10},{team1:10},
    {team1:null,team2:10},{team1:'',team2:10},{team1:-1,team2:10},{team1:Infinity,team2:10}]) {
    const snapshot = {...input(),preMatchTotalBets:totals,
      preMatchVolume:{team1:{back:100,lay:0},team2:{back:1,lay:1}}};
    assert.equal(predictTossWinner(snapshot,'WODI'),null);
    assert.equal(getLeagueTossPrediction(snapshot,'WODI').abstain,true);
  }
  assert.equal(predictTossWinner({...input(),teamNames:['Alpha',' alpha ']},'WODI'),null);
  assert.equal(getWomensInternationalTossPrediction({...input(),error:'failed'}).abstain,true);
});

test('frontend/backend and saved international womens tosses follow the same lower-total rule', async () => {
  const frontend = await import('../../frontend/src/utils/tossPredictor.js');
  assert.deepEqual(frontend.predictTossWinner(input(),'WODI'),predictTossWinner(input(),'WODI'));
  const rows = require('../data/toss_dataset.json').records.filter(record => isWomensInternationalToss(record.snapshot,record.competitionName));
  assert.ok(rows.length > 0);
  for (const record of rows) {
    const values = record.snapshot.preMatchTotalBets;
    if (values.team1 === values.team2) continue;
    assert.equal(predictTossWinner(record.snapshot,record.competitionName).winnerName,
      record.snapshot.teamNames[values.team1 < values.team2 ? 0 : 1],record.matchId);
  }
});
