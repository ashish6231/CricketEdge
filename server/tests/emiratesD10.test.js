const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseCrexSeriesMatches } = require('../services/crexService');
const { createD10Store, summarizeD10, validateResultEvidence } = require('../services/emiratesD10Store');
const { captureEmiratesD10, matchFixture, DEFAULT_SERIES_URL } = require('../services/emiratesD10Capture');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { getLeagueMatchAlgorithm } = require('../utils/normalLeagueMatchPredictor.mjs');
const { startEmiratesD10Worker } = require('../services/emiratesD10Worker');

const START = Date.parse('2026-10-03T12:00:00Z');
const BEFORE = new Date(START - 60000);
const fixture = (id = 'one', time = START) => ({recordId:`crex:2NK:${id}`, competitionName:'Emirates D10 League 2026',
  team1:'Abu Dhabi', team2:'Dubai', matchName:'Abu Dhabi v Dubai', startTime:time, status:'upcoming',
  sourceProvider:'CREX', sourceUrl:DEFAULT_SERIES_URL, reportedWinner:null});
const snapshot = () => ({teamNames:['Abu Dhabi D10','Dubai D10'],
  preMatchVolume:{team1:{back:100,lay:30},team2:{back:20,lay:5}},
  preMatchPnl:{team1:-100,team2:100},preMatchTotalBets:{team1:130,team2:25}, status:'upcoming'});
async function storeFor(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'emirates-d10-test-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  return createD10Store({filePath:path.join(dir,'d10.json')});
}

test('D10 aliases select a separate normal-mode profile and ignore outcome/live fields', () => {
  for (const name of ['Emirates D10','Emirates D10 League 2026','Emirates D10 Tournament','Dafa News D10 2026','D10']) {
    const algo=getLeagueMatchAlgorithm(name);assert.equal(algo.algorithmId,'match-emirates-d10-league-independent-v1');
    const s={...snapshot(),competitionName:name}, a=predictMatchWinner(s);
    assert.equal(a.algorithmId,algo.algorithmId);assert.equal(a.mode,'rules');
    assert.equal(a.validation,'insufficient-history');assert.equal(a.adjustmentTrainingSamples,1);
    assert.equal(predictMatchWinner({...s,actualWinner:s.teamNames[1],marketSignals:{prediction:{prediction:s.teamNames[1]}},threeMinPnl:{team1:1e20,team2:-1e20}}).winner,a.winner);
    const swapped={...s,teamNames:[s.teamNames[1],s.teamNames[0]]};
    for(const key of ['preMatchVolume','preMatchPnl','preMatchTotalBets'])swapped[key]={team1:s[key].team2,team2:s[key].team1};
    assert.equal(predictMatchWinner(swapped).winner,a.winner);
  }
  assert.equal(getLeagueMatchAlgorithm('Abu Dhabi T10 League'),null);
  const s={...snapshot(),competitionName:'Emirates D10'};
  assert.equal(predictMatchWinner({...s,preMatchPnl:undefined}),null);
  assert.equal(predictMatchWinner({...s,preMatchVolume:{team1:{back:0,lay:0},team2:{back:0,lay:0}}}),null);
});

test('series parser preserves complete and upcoming fixture identities and does not infer a winner from score order', () => {
  const state={
    'https://stats.crickapi.com/series/getMatchesForSeriesID':[
      {sf:'2NK',mf:'M1',t1f:'A',t2f:'D',t:START,status:2,w:'D',s1:'99/1',s2:'100/2',result:'DUB Won by 8 wickets'},
      {sf:'2NK',id:123,nf:'M2',t1f:'A',t2f:'D',t:START+86400000,status:0},
      {sf:'2NK',mf:'M3',t1f:'A',t2f:'D',t:START+2*86400000,status:2,w:'UNKNOWN',result:'Unknown result'},
    ],
    'https://oc.crickapi.com/mapping/getHomeMapDataseriesmatches':{t:[{f_key:'A',n:'Abu Dhabi',sn:'ABD'},{f_key:'D',n:'Dubai',sn:'DUB'}],s:[{f_key:'2NK',n:'Emirates D10 League 2026'}]},
  };
  const rows=parseCrexSeriesMatches(`<script id="app-root-state" type="application/json">${JSON.stringify(state)}</script>`,DEFAULT_SERIES_URL);
  assert.equal(rows.length,3);assert.equal(rows[0].reportedWinner,'Dubai');assert.equal(rows[1].recordId,'crex:2NK:123');
  assert.equal(rows[1].status,'upcoming');assert.equal(rows[2].reportedWinner,null);
  state['https://stats.crickapi.com/series/getMatchesForSeriesID'][1].mf='LIVE_LOCATOR';
  const updated=parseCrexSeriesMatches(`<script id="app-root-state">${JSON.stringify(state)}</script>`,DEFAULT_SERIES_URL);
  assert.equal(updated[1].recordId,rows[1].recordId);
  assert.throws(()=>parseCrexSeriesMatches('<html></html>',DEFAULT_SERIES_URL),/unavailable/);
});

test('linking market to fixture respects the match date and refuses ambiguous matches', () => {
  const market={team1:'Dubai D10',team2:'Abu Dhabi D10',startTime:START/1000};
  const first=fixture(),later=fixture('later',START+86400000);
  assert.equal(matchFixture(market,[later,first]).recordId,first.recordId);
  assert.equal(matchFixture(market,[first,{...first,recordId:'duplicate'}]),null);
  assert.equal(matchFixture({...market,startTime:null},[first]),null);
});

test('fixture-only and both-zero imports create no saved records, including after a source outage', async t => {
  const store=await storeFor(t);
  const completed={...fixture('old',START-86400000),status:'completed',reportedWinner:'Dubai'};
  const deps={store,now:()=>BEFORE,seriesUrls:[DEFAULT_SERIES_URL],fetchSeries:async()=>[completed,fixture()],
    scraper:{getCricketMatches:()=>[{id:'market',competitionName:'Emirates D10',team1:'Abu Dhabi',team2:'Dubai',startTime:START}],getCricketSnapshot:async()=>({...snapshot(),preMatchVolume:{team1:{back:0,lay:0},team2:{back:0,lay:0}}})}};
  const summary=await captureEmiratesD10(deps);
  assert.equal(summary.total,0);assert.equal(summary.completed,0);assert.equal(summary.correct+summary.wrong,0);
  assert.equal(summary.unscored,0);assert.equal(summary.sync.invalidInputs,1);
  const data=await store.load();assert.deepEqual(data.records,[]);
  await captureEmiratesD10({...deps,fetchSeries:async()=>{throw Error('Source temporarily down')}});
  assert.equal((await store.load()).records.length,0);
});

test('first pre-match forecast is immutable; verified outcomes score it; later or invalid inputs cannot rewrite it', async t => {
  const store=await storeFor(t),f=fixture();let raw=snapshot();
  const deps={store,now:()=>BEFORE,seriesUrls:[DEFAULT_SERIES_URL],fetchSeries:async()=>[f],
    scraper:{getCricketMatches:()=>[{id:'market',competitionName:'Emirates D10 2026',team1:'Abu Dhabi D10',team2:'Dubai D10',startTime:START}],getCricketSnapshot:async()=>raw}};
  await captureEmiratesD10(deps);
  let r=(await store.load()).records[0];const original=structuredClone(r.markets.match);
  assert.equal(original.prediction.winner,'Abu Dhabi');assert.equal(summarizeD10(await store.load()).preMatchPredictions,1);
  raw={...snapshot(),preMatchVolume:{team1:{back:10,lay:1},team2:{back:1000,lay:500}},preMatchPnl:{team1:100,team2:-100},status:'ended'};
  await captureEmiratesD10({...deps,now:()=>new Date(START+3600000),fetchSeries:async()=>[{...f,status:'completed',reportedWinner:'Abu Dhabi'}]});
  r=(await store.load()).records[0];assert.deepEqual(r.markets.match.prediction,original.prediction);assert.deepEqual(r.markets.match.snapshot,original.snapshot);
  assert.equal(summarizeD10(await store.load()).correct,0);
  await store.confirmResult({recordId:f.recordId,actualWinner:'Abu Dhabi',sourceUrl:'https://www.emiratescricket.com/scorecard/match-1'});
  assert.equal(summarizeD10(await store.load()).correct,1);
  await store.confirmResult({recordId:f.recordId,actualWinner:'Dubai',sourceUrl:'https://www.espncricinfo.com/series/d10/match-1'});
  assert.equal(summarizeD10(await store.load()).wrong,1);
  raw={error:'feed unavailable'};await captureEmiratesD10({...deps,now:()=>new Date(START+7200000)});
  r=(await store.load()).records[0];assert.equal(r.actualWinner,'Dubai');assert.deepEqual(r.markets.match.prediction,original.prediction);
  await captureEmiratesD10({...deps,now:()=>new Date(START+7200000),fetchSeries:async()=>{throw Error('Source unavailable')}});
  r=(await store.load()).records[0];assert.equal(r.actualWinner,'Dubai');assert.equal(r.resultVerification.status,'verified');
  assert.deepEqual(r.markets.match.prediction,original.prediction);
});

test('completed match inputs do not create new saved snapshots or retrospective forecasts', async t => {
  const store=await storeFor(t),f={...fixture(),status:'completed',reportedWinner:'Abu Dhabi'};
  await captureEmiratesD10({store,now:()=>new Date(START+3600000),fetchSeries:async()=>[f],seriesUrls:[DEFAULT_SERIES_URL],scraper:{
    getCricketMatches:()=>[{id:'market',competitionName:'Emirates D10',team1:f.team1,team2:f.team2,startTime:START,status:'completed'}],getCricketSnapshot:async()=>snapshot()}});
  assert.equal((await store.load()).records.length,0);
  const summary=summarizeD10(await store.load());assert.equal(summary.verifiedResults,0);assert.equal(summary.unscored,0);assert.equal(summary.accuracy,null);
});

test('result verification accepts only approved scorecard domains', () => {
  for(const url of ['https://evil.example/?source=espncricinfo.com','https://emiratescricket.com.evil.example/','http://cricbuzz.com/scores','not a url'])assert.throws(()=>validateResultEvidence(url));
  assert.equal(validateResultEvidence('https://www.cricbuzz.com/live-cricket-scores/123'),'https://www.cricbuzz.com/live-cricket-scores/123');
});

test('market-only fixture merges into series identity without losing the forecast; completed status forbids a forecast even before listed start time', async t => {
  const store=await storeFor(t),market={id:'market',competitionName:'Emirates D10',team1:'Abu Dhabi',team2:'Dubai',startTime:START};
  const scraper={getCricketMatches:()=>[market],getCricketSnapshot:async()=>snapshot()};
  await captureEmiratesD10({store,scraper,fetchSeries:async()=>[],seriesUrls:[DEFAULT_SERIES_URL],now:()=>BEFORE});
  const prediction=structuredClone((await store.load()).records[0].markets.match.prediction);
  await captureEmiratesD10({store,scraper,fetchSeries:async()=>[fixture()],seriesUrls:[DEFAULT_SERIES_URL],now:()=>BEFORE});
  const data=await store.load();assert.equal(data.records.length,1);assert.equal(data.records[0].recordId,fixture().recordId);
  assert.deepEqual(data.records[0].markets.match.prediction,prediction);
  const other=await storeFor(t);
  await captureEmiratesD10({store:other,scraper,fetchSeries:async()=>[{...fixture(),status:'completed'}],seriesUrls:[DEFAULT_SERIES_URL],now:()=>BEFORE});
  assert.equal((await other.load()).records.length,0);
});

test('worker polls without overlapping capture jobs and stops cleanly', async t => {
  t.mock.timers.enable({apis:['setInterval']});
  let count=0,release;
  const worker=startEmiratesD10Worker({capture:()=>{count++;return new Promise(resolve=>{release=resolve})}});
  t.mock.timers.tick(30000);assert.equal(count,1);
  release();await Promise.resolve();await Promise.resolve();
  t.mock.timers.tick(30000);assert.equal(count,2);
  worker.stop();release();await Promise.resolve();t.mock.timers.tick(60000);assert.equal(count,2);
});
