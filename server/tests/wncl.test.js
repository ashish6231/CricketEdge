const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createWNCLStore, summarizeWNCL } = require('../services/wnclStore');
const { captureWNCL, overviewFixtures } = require('../services/wnclCapture');
const { startWNCLWorker } = require('../services/wnclWorker');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { getLeagueMatchAlgorithm } = require('../utils/normalLeagueMatchPredictor.mjs');
const { wnclTeamKey, isWNCLLeague } = require('../utils/wnclMatchPredictor.mjs');
const START = Date.parse('2026-12-14T00:00:00Z');
const market = { id:'wncl-one',competitionName:'WNCL 2026-27',team1:'NSW Women',team2:'Queensland Fire',startTime:START,status:'upcoming' };
const snapshot = () => ({ teamNames:['NSW Women','Queensland Fire'],status:'upcoming',
  preMatchVolume:{team1:{back:100,lay:30},team2:{back:20,lay:5}},preMatchPnl:{team1:-100,team2:100} });
async function storeFor(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wncl-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));return createWNCLStore({filePath:path.join(dir,'wncl.json')});
}
function deps(store, raw = snapshot()) { return {store,seriesUrls:[],now:()=>new Date(START-60000),
  scraper:{getCricketMatches:()=>[market],getCricketSnapshot:async()=>raw}}; }

test('WNCL aliases select an independent normal-default algorithm, with no measured accuracy claim',()=>{
  for(const name of ['WNCL',"Women's National Cricket League",'Womens National Cricket League 2026-27','WNCL 2026/2027']) {
    const algorithm=getLeagueMatchAlgorithm(name);assert.equal(algorithm.algorithmId,'match-women-s-national-cricket-league-independent-v1');
    const s={...snapshot(),competitionName:name},a=predictMatchWinner(s);
    assert.equal(a.mode,'rules');assert.equal(a.algorithmId,algorithm.algorithmId);assert.equal(a.validation,'awaiting-data');
    assert.equal(a.adjustmentTrainingSamples,0);assert.equal(a.confidenceCalibrated,false);
    assert.equal(predictMatchWinner({...s,actualWinner:s.teamNames[1],marketSignals:{prediction:{prediction:s.teamNames[1]}},threeMinPnl:{team1:1e12,team2:-1e12}}).winner,a.winner);
    const swapped={...s,teamNames:[s.teamNames[1],s.teamNames[0]],preMatchVolume:{team1:s.preMatchVolume.team2,team2:s.preMatchVolume.team1},preMatchPnl:{team1:s.preMatchPnl.team2,team2:s.preMatchPnl.team1}};
    assert.equal(predictMatchWinner(swapped).winner,a.winner);
    assert.equal(predictMatchWinner({...s,preMatchPnl:undefined}),null);
  }
  for(const name of ['National Cricket League','WBBL','Emirates D10'])assert.equal(isWNCLLeague(name),false);
  assert.notEqual(getLeagueMatchAlgorithm('WNCL').parameters,getLeagueMatchAlgorithm('Emirates D10').parameters);
  assert.equal(wnclTeamKey('Tasmanian Tigers Women'),wnclTeamKey('Tasmania W'));
  assert.equal(wnclTeamKey('NSW Women'),wnclTeamKey('New South Wales Women'));
});

test('captures genuine pre-match data, preserves issued forecast, and scores only against source-verified outcomes',async t=>{
  const store=await storeFor(t),d=deps(store);await captureWNCL(d);
  const initial=(await store.load()).records[0];const prediction=structuredClone(initial.markets.match.prediction);
  assert.equal(prediction.winner,'NSW Women');assert.equal(prediction.algorithmId,'match-women-s-national-cricket-league-independent-v1');
  assert.equal(summarizeWNCL(await store.load()).preMatchPredictions,1);
  const later=snapshot();later.preMatchVolume={team1:{back:1,lay:1},team2:{back:1000,lay:300}};
  later.preMatchPnl={team1:1000,team2:-1000};
  await captureWNCL(deps(store,later));
  assert.deepEqual((await store.load()).records[0].markets.match.prediction,prediction);
  assert.deepEqual((await store.load()).records[0].markets.match.snapshot,initial.markets.match.snapshot);
  const ended={...market,status:'completed'};
  await captureWNCL({...d,now:()=>new Date(START+3600000),scraper:{getCricketMatches:()=>[ended],getCricketSnapshot:async()=>later}});
  const record=(await store.load()).records[0];assert.equal(record.status,'completed');assert.equal(record.actualWinner,null);
  assert.deepEqual(record.markets.match.prediction,prediction);assert.equal(summarizeWNCL(await store.load()).correct,0);
  await store.confirmResult({recordId:record.recordId,actualWinner:'NSW Women',sourceUrl:'https://www.cricket.com.au/matches/CA:WNCL-one'});
  assert.equal(summarizeWNCL(await store.load()).correct,1);
  await store.confirmResult({recordId:record.recordId,actualWinner:'Queensland Fire',sourceUrl:'https://www.espncricinfo.com/series/wncl/match-one'});
  assert.equal(summarizeWNCL(await store.load()).wrong,1);
});

test('missing, both-zero, failed, and wrong-team inputs are excluded; one-zero inputs remain usable',async t=>{
  for(const raw of [null,{error:'unavailable'},{...snapshot(),preMatchPnl:undefined},
    {...snapshot(),preMatchVolume:{team1:{back:0,lay:0},team2:{back:0,lay:0}}},
    {...snapshot(),teamNames:['Victoria Women','South Australia Women']}]) {
    const store=await storeFor(t);const result=await captureWNCL(deps(store,raw));
    assert.equal(result.preMatchPredictions,0);assert.equal((await store.load()).records.length,0);
  }
  const store=await storeFor(t),raw={...snapshot(),preMatchVolume:{team1:{back:0,lay:0},team2:{back:20,lay:5}}};
  await captureWNCL(deps(store,raw));assert.equal(summarizeWNCL(await store.load()).preMatchPredictions,1);
});

test('after-start and live inputs never create retrospective WNCL forecasts or snapshots',async t=>{
  const store=await storeFor(t),d=deps(store);
  let result=await captureWNCL({...d,now:()=>new Date(START+1)});
  assert.equal(result.sync.lateInputs,1);assert.equal((await store.load()).records.length,0);
  result=await captureWNCL({...d,scraper:{getCricketMatches:()=>[{...market,status:'live',inPlay:true}],getCricketSnapshot:async()=>snapshot()}});
  assert.equal(result.sync.lateInputs,1);assert.equal(result.preMatchPredictions,0);
});

test('capture time is measured after snapshot response and prediction issuance, preventing deadline-crossing lookahead',async t=>{
  let clock=START-1;const store=await storeFor(t);
  const d={...deps(store),now:()=>new Date(clock),scraper:{getCricketMatches:()=>[market],getCricketSnapshot:async()=>{clock=START+1;return snapshot()}}};
  await captureWNCL(d);assert.equal((await store.load()).records.length,0);
  const other=await storeFor(t);clock=START-1;
  await captureWNCL({...deps(other),now:()=>new Date(clock),predict:raw=>{clock=START+1;return predictMatchWinner(raw)}});
  assert.equal((await other.load()).records[0].markets.match.prediction,null);
});

test('overview fixtures normalise team aliases and do not count reported winners as verified',async t=>{
  const rows=overviewFixtures([{crexMatchId:'crex-one',seriesName:"Women's National Cricket League 2026-27",
    team1Name:'New South Wales Women',team1Short:'NSW',team2Name:'Queensland Women',team2Short:'QLD',
    startTime:START,status:'completed',statusText:'NSW Won by 10 runs',url:'/cricket-live-score/one'}]);
  assert.equal(rows[0].reportedWinner,'New South Wales Women');assert.equal(rows[0].sourceUrl,'https://crex.com/cricket-live-score/one');
  const store=await storeFor(t);await captureWNCL({...deps(store),initialFixtures:rows});
  assert.equal(summarizeWNCL(await store.load()).verifiedResults,0);
});

test('overview and market feed outages preserve saved forecasts and do not silently erase records',async t=>{
  const store=await storeFor(t);await captureWNCL(deps(store));
  const initial=structuredClone((await store.load()).records[0].markets);
  const result=await captureWNCL({...deps(store),scraper:{getCrexOverview:()=>{throw Error('Overview down')},getCricketMatches:()=>({error:'HTTP 401'})}});
  assert.equal(result.sync.errors.length,2);assert.deepEqual((await store.load()).records[0].markets,initial);
  assert.equal((await store.load()).marketFeedHealth.error,'HTTP 401');
});

test('overview and full-series aliases merge into one fixture and retain the issued winner namespace',async t=>{
  const store=await storeFor(t);
  const overview={recordId:'crex:wncl:one',sourceProvider:'CREX',competitionName:'WNCL',
    seriesId:'WNCL 2026-27',team1:'NSW Women',team2:'Queensland Fire',startTime:START,status:'upcoming'};
  await captureWNCL({...deps(store),initialFixtures:[overview]});
  const original=(await store.load()).records[0];
  const full={...overview,recordId:'crex:2NG:one',seriesId:'2NG',
    team1:'Queensland Fire Women',team2:'New South Wales Women',matchName:'QLD v NSW'};
  const result=await captureWNCL({...deps(store),initialFixtures:[overview],seriesUrls:['https://crex.com/series/wncl/matches'],
    fetchSeries:async()=>[full]});
  const data=await store.load();assert.equal(result.total,1);assert.equal(result.sync.fixturesSeen,1);
  assert.equal(data.records[0].recordId,full.recordId);
  assert.equal(data.records[0].team1,original.team1);assert.equal(data.records[0].team2,original.team2);
  assert.deepEqual(data.records[0].markets.match.prediction,original.markets.match.prediction);
  await captureWNCL({...deps(store),initialFixtures:[{...full,status:'completed'}],
    now:()=>new Date(START+3600000),scraper:{getCricketMatches:()=>[]}});
  await store.confirmResult({recordId:full.recordId,actualWinner:original.team1,
    sourceUrl:'https://www.cricket.com.au/matches/CA:WNCL-one'});
  assert.equal(summarizeWNCL(await store.load()).correct,1);
});

test('WNCL verification rejects unrelated domains and incomplete/upcoming result claims',async t=>{
  const store=await storeFor(t);await captureWNCL(deps(store));
  const recordId=(await store.load()).records[0].recordId;
  await assert.rejects(store.confirmResult({recordId,actualWinner:'NSW Women',sourceUrl:'https://emiratescricket.com/scorecard/one'}),/Cricket Australia/);
  await assert.rejects(store.confirmResult({recordId,actualWinner:'NSW Women',sourceUrl:'https://www.cricbuzz.com/live-cricket-scores/one'}),/completed/);
});

test('WNCL worker prevents overlapping polls and stops cleanly',async t=>{
  t.mock.timers.enable({apis:['setInterval']});let count=0,release;
  const worker=startWNCLWorker({capture:()=>{count++;return new Promise(resolve=>{release=resolve})}});
  t.mock.timers.tick(60000);assert.equal(count,1);release();await Promise.resolve();await Promise.resolve();
  t.mock.timers.tick(30000);assert.equal(count,2);worker.stop();release();await Promise.resolve();
  t.mock.timers.tick(60000);assert.equal(count,2);
});
