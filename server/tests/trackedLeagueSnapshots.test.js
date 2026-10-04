const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createWNCLStore } = require('../services/wnclStore');
const { captureWNCL } = require('../services/wnclCapture');

const START = Date.parse('2026-12-14T00:00:00Z');
const fixture = id => ({recordId:id,competitionName:'WNCL',team1:'NSW Women',team2:'Queensland Fire Women',
  startTime:START,status:'upcoming',sourceProvider:'CREX'});
const snapshot = () => ({teamNames:['New South Wales Women','Queensland Women'],
  preMatchVolume:{team1:{back:100,lay:30},team2:{back:20,lay:5}},preMatchPnl:{team1:-100,team2:100}});
async function setup(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'snapshot-only-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const filePath=path.join(dir,'data.json');return {filePath,store:createWNCLStore({filePath})};
}

test('store removes legacy metadata, invalid markets and wrong-team snapshots while preserving usable match/toss data',async t=>{
  const {store,filePath}=await setup(t),good=snapshot(),bad={...snapshot(),preMatchPnl:undefined};
  const record={...fixture('valid'),markets:{match:{snapshot:good,latestSnapshot:bad},toss:{snapshot:bad}}};
  const tossOnly={...fixture('toss-only'),markets:{toss:{snapshot:good}}};
  const wrong={...fixture('wrong'),markets:{match:{snapshot:{...good,teamNames:['Victoria Women','SA Scorpions Women']}}}};
  const zero={...fixture('zero'),markets:{match:{snapshot:{...good,preMatchVolume:{team1:{back:0,lay:0},team2:{back:0,lay:0}}}}}};
  await fs.writeFile(filePath,JSON.stringify({records:[fixture('metadata'),record,tossOnly,wrong,zero]}));
  await store.update(()=>{});
  const saved=JSON.parse(await fs.readFile(filePath,'utf8'));
  assert.deepEqual(saved.records.map(r=>r.recordId),['valid','toss-only']);
  assert.deepEqual(saved.records[0].markets.match.snapshot,good);
  assert.equal(saved.records[0].markets.match.latestSnapshot,undefined);
  assert.equal(saved.records[0].markets.toss,undefined);
  assert.deepEqual(saved.records[1].markets.toss.snapshot,good);
});

test('repeated fixture discovery never repopulates a metadata-only dataset; valid data can later create its first record',async t=>{
  const {store}=await setup(t),f=fixture('crex:2NG:one');
  const deps={store,seriesUrls:[],initialFixtures:[f],now:()=>new Date(START-60000),scraper:{getCricketMatches:()=>[]}};
  for(let i=0;i<2;i++)assert.equal((await captureWNCL(deps)).total,0);
  const result=await captureWNCL({...deps,scraper:{getCricketMatches:()=>[{id:'market-one',competitionName:'WNCL',
    team1:f.team1,team2:f.team2,startTime:START}],getCricketSnapshot:async()=>snapshot()}});
  assert.equal(result.total,1);assert.equal(result.preMatchPredictions,1);
  const saved=structuredClone((await store.load()).records[0].markets.match);
  assert.equal((await captureWNCL(deps)).total,1);
  assert.deepEqual((await store.load()).records[0].markets.match,saved);
});
