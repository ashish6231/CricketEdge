const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createProviderTotalStore } = require('../services/providerTotalStore');
const { getExplicitPreMatchProviderTotals: totals } = require('../utils/providerTotals.mjs');
const { createNormalizedMatch } = require('../shared/schema');

function stub(modulePath, exports) {
  const id = require.resolve(modulePath);
  require.cache[id] = {id,filename:id,loaded:true,exports};
}

const redisRows = new Map();
stub('../shared/redis',{getRedisClient:() => ({
  async set(key,value) { redisRows.set(key,JSON.parse(value)); }, async publish() {},
})});
stub('../db/prisma',{});
stub('../services/crexService',{findCrexMatch:() => null});
let store;
stub('../services/providerTotalStore',{getDefaultProviderTotalStore:() => store});
const normalizer = require('../services/normalizer/normalizer');
const { getMatchBundlePayload } = require('../services/matchPayloadService');

const ingest = (type,data,matchId) => normalizer.processIngestJob({data:{type,data,matchId}});

test('normalization preserves real kickoff times and leaves unknown times unknown', () => {
  const iso = '2026-10-19T10:00:00Z', ms = Date.parse(iso);
  for (const time of [iso,ms,ms/1000,String(ms)]) assert.equal(createNormalizedMatch({startTime:time}).startTime,ms);
  assert.equal(createNormalizedMatch({}).startTime,null);
  assert.equal(createNormalizedMatch({startTime:'invalid'}).startTime,null);
  assert.equal(createNormalizedMatch({startTime:'',openDate:iso}).startTime,ms);
});

test('ingestion, Redis broadcast and API restore independent cricket/toss captures after restart', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'provider-integration-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  const options = {filePath:path.join(dir,'totals.json'),database:false};
  store = createProviderTotalStore(options);
  const id = 'provider-integration-fixture';
  const future = new Date(Date.now()+3600000).toISOString();
  const info = {matchId:id,matchName:'Alpha v Beta',startTime:future,status:'upcoming'};
  await ingest('cricket:matches',[info]);
  await ingest('toss:matches',[info]);
  // Start time comes from the match list, not the detail payload.
  const snapshot = values => ({teamNames:['Alpha','Beta'],serverTime:new Date().toISOString(),deepMetrics:{totals:values}});
  await ingest('cricket:snapshot',snapshot({team1:0,team2:200}),id);
  await ingest('toss:snapshot',snapshot({team1:30,team2:40}),id);
  assert.deepEqual(totals(redisRows.get(`match:${id}:bundle`).cricket),[0,200]);
  assert.deepEqual(totals(redisRows.get(`match:${id}:toss`)),[30,40]);

  store = createProviderTotalStore(options);
  await ingest('cricket:matches',[{...info,status:'live',inPlay:true}]);
  await ingest('toss:matches',[{...info,status:'live',inPlay:true}]);
  await ingest('cricket:snapshot',snapshot({team1:999,team2:888}),id);
  await ingest('toss:snapshot',snapshot({team1:777,team2:666}),id);
  normalizer.setCrexDetail(id,{scorecard:{status:'live'}});
  const bundle = await getMatchBundlePayload(id,{isBroadcaster:true});
  assert.deepEqual(totals(bundle.cricket),[0,200]);
  assert.deepEqual(totals(bundle.toss),[30,40]);
  assert.deepEqual(bundle.cricket.deepMetrics.totals,{team1:999,team2:888});
  assert.deepEqual(bundle.toss.deepMetrics.totals,{team1:777,team2:666});
});

test('captured pre-match exposure reaches Redis and the detail bundle after its source rows disappear',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'exposure-integration-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const options={filePath:path.join(dir,'captures.json'),database:false};
  store=createProviderTotalStore(options);
  const id='exposure-history-integration',start=Date.now()+3600000;
  const info={matchId:id,matchName:'A v B',startTime:start,status:'upcoming'};
  await ingest('cricket:matches',[info]);
  const raw={teamNames:['A','B'],serverTime:Date.now(),
    preMatchVolume:{team1:{back:100,lay:10},team2:{back:20,lay:50}},
    teams:{A:{trades:[{type:'back',size:100,price:3,updatedAt:Date.now()-1000},{type:'lay',size:10,price:2,updatedAt:Date.now()-1000}]},
      B:{trades:[{type:'lay',size:50,price:2,updatedAt:Date.now()-1000},{type:'back',size:20,price:2,updatedAt:Date.now()-1000}]}}};
  await ingest('cricket:snapshot',raw,id);
  assert.equal(redisRows.get(`match:${id}:bundle`).cricket.preMatchExposure.team1.netExposure,190);
  store=createProviderTotalStore(options);
  await ingest('cricket:matches',[{...info,inPlay:true,status:'live'}]);
  await ingest('cricket:snapshot',{...raw,serverTime:start+60000,teams:{A:{trades:[]},B:{trades:[]}}},id);
  const bundle=await getMatchBundlePayload(id,{isBroadcaster:true});
  assert.equal(bundle.cricket.preMatchExposure.team1.backExposure,200);
  assert.equal(bundle.cricket.preMatchExposure.team2.layExposure,50);
  assert.equal(bundle.cricket.preMatchExposure.team2.recordedTrades,2);
});
