const test = require('node:test');
const assert = require('node:assert/strict');
const cachePath = require.resolve('../services/dataCache');
require.cache[cachePath] = {id:cachePath,filename:cachePath,loaded:true,exports:{}};
const crexPath = require.resolve('../services/crexService');
require.cache[crexPath] = {id:crexPath,filename:crexPath,loaded:true,
  exports:{getCrexOverview:async () => [],findCrexMatch:() => null}};
const {captureEndedTosses} = require('../services/tossCapture');
const {WOMENS_INTERNATIONAL_TOSS_VERSION} = require('../utils/womensInternationalTossAlgorithm.mjs');

const input = {teamNames:['Alpha','Beta'],preMatchTotalBets:{team1:100,team2:300}};
const match = {matchId:'womens-provider-total',matchName:'Alpha v Beta',status:'ended',
  totalMatched:100,competitionName:'Womens One Day Internationals'};

async function capture(snapshot,records=[]) {
  const saved = [];
  const result = await captureEndedTosses({
    scraper:{getAllTossMatches:async () => [match],getTossSnapshot:async () => snapshot},
    store:{load:async () => ({records}),upsertPendingCapture:async row => {saved.push(row);return {created:!records.length,updated:!!records.length};}},
  });
  return {result,saved};
}

test('women international captures accept frozen provider totals without volume or P/L', async () => {
  const {result,saved} = await capture(input);
  assert.equal(result.captured,1);
  assert.equal(saved[0].predictedWinner,'Alpha');
  assert.equal(saved[0].predictorVersion,WOMENS_INTERNATIONAL_TOSS_VERSION);
});

test('invalid totals skip capture and equal totals do not invent a winner', async () => {
  const missing = await capture({...input,preMatchTotalBets:undefined,
    preMatchVolume:{team1:{back:100,lay:10},team2:{back:10,lay:5}},preMatchPnl:{team1:-100,team2:100}});
  assert.equal(missing.result.skipped,1);
  assert.equal(missing.saved.length,0);
  const tied = await capture({...input,preMatchTotalBets:{team1:100,team2:100}});
  assert.equal(tied.saved[0].predictedWinner,null);
});

test('old pending flow-only capture can be refreshed with the new provider-only input', async () => {
  const previous = {matchId:match.matchId,status:'pending',competitionName:match.competitionName,
    snapshot:{teamNames:input.teamNames,preMatchVolume:{team1:{back:100,lay:10},team2:{back:10,lay:5}},preMatchPnl:{team1:-100,team2:100}}};
  const {result,saved} = await capture(input,[previous]);
  assert.equal(result.skipped,0);
  assert.equal(saved.length,1);
  assert.equal(saved[0].predictedWinner,'Alpha');
});
