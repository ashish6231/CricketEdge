const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
for (const [name,exports] of [['../services/dataCache',{}],['../services/crexService',{getCrexOverview:async()=>[],findCrexMatch:()=>null}]]) {
  const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports};
}
const {captureEndedTosses} = require('../services/tossCapture');
const {createStore} = require('../services/tossDatasetStore');
const {UNIVERSAL_TOSS_VERSION,SOUTH_AFRICA_T20_TOSS_VERSION} = require('../utils/universalTossAlgorithm.mjs');
const fixture = () => ({teamNames:['Alpha','Beta'],deepMetrics:{totals:{team1:100,team2:300}},
  teams:{Alpha:{trades:[{type:'lay',price:2,size:10}]},Beta:{trades:[{type:'back',price:2,size:20}]}}});
const match = {matchId:'new-rule',matchName:'Alpha v Beta',competitionName:'World Championship of Legends T20',status:'ended',totalMatched:100};

async function setup(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'universal-toss-capture-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return createStore({filePath:path.join(dir,'toss.json')});
}
const capture = (store,snapshot) => captureEndedTosses({store,scraper:{getAllTossMatches:async()=>[match],getTossSnapshot:async()=>snapshot}});

test('captures current rule inputs without frozen P/L or back/lay summaries', async t => {
  const store=await setup(t);
  const result=await capture(store,fixture());
  assert.equal(result.captured,1);
  const record=(await store.load()).records[0];
  assert.equal(record.predictedWinner,'Alpha');
  assert.equal(record.predictorVersion,UNIVERSAL_TOSS_VERSION);
  assert.equal(record.inputTiming,'current-displayed-back-and-lay-risk');
});

test('zero-risk fallback conflicts stay unpredicted; missing risk is skipped', async t => {
  const store=await setup(t);
  const snapshot=fixture();snapshot.teams.Alpha.trades=[];snapshot.deepMetrics.totals={team1:300,team2:100};
  await capture(store,snapshot);
  assert.equal((await store.load()).records[0].predictedWinner,null);
  const missing=await captureEndedTosses({store:{load:async()=>({records:[]})},
    scraper:{getAllTossMatches:async()=>[match],getTossSnapshot:async()=>({...fixture(),teams:undefined,preMatchPnl:{team1:100,team2:-100}})}});
  assert.equal(missing.skipped,1);
});

test('real store refreshes incomplete pending input from a previous algorithm but preserves confirmed results', async t => {
  const store=await setup(t);
  await store.upsertPendingCapture({matchId:match.matchId,competitionName:match.competitionName,
    predictorVersion:'old-league-rule',predictedWinner:'Beta',snapshot:{teamNames:['Alpha','Beta']}});
  const result=await capture(store,fixture());
  assert.equal(result.captured,1);
  assert.equal((await store.load()).records[0].predictedWinner,'Alpha');
  await store.confirmActualWinner({matchId:match.matchId,actualWinner:'Beta',admin:{email:'reviewer@example.test',userId:1}});
  const confirmed=await capture(store,{...fixture(),teams:undefined});
  assert.equal(confirmed.skipped,1);
  const record=(await store.load()).records[0];
  assert.equal(record.actualWinner,'Beta');
  assert.equal(record.status,'verified');
});

test('South Africa T20 captures its higher-total fallback when a team has zero risk', async t => {
  const store=await setup(t);
  const snapshot=fixture();snapshot.teams.Alpha.trades=[];
  const result=await captureEndedTosses({store,scraper:{
    getAllTossMatches:async()=>[{...match,competitionName:'South Africa T20 Challenge'}],
    getTossSnapshot:async()=>snapshot,
  }});
  assert.equal(result.captured,1);
  const record=(await store.load()).records[0];
  assert.equal(record.predictedWinner,'Beta');
  assert.equal(record.predictorVersion,SOUTH_AFRICA_T20_TOSS_VERSION);
  assert.equal(record.inputTiming,'current-displayed-provider-total');
});

 test('risk-first capture needs neither provider totals nor pre-match data', async t => {
  const store=await setup(t);
  const snapshot=fixture();delete snapshot.deepMetrics;
  assert.equal((await capture(store,snapshot)).captured,1);
  const record=(await store.load()).records[0];
  assert.equal(record.predictedWinner,'Alpha');
  assert.equal(record.inputTiming,'current-displayed-back-and-lay-risk');
});
