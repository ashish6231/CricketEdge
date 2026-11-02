const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
function stub(path,exports){const id=require.resolve(path);require.cache[id]={id,filename:id,loaded:true,exports}}
const original={matchLoad:{team1:{name:'Alpha',money:123,percent:60,odds:null},team2:{name:'Beta',money:82,percent:40,odds:null},totalMatched:205},runners:[],totalMatched:205};
let writes=0,reads=0,archiveReads=0;
stub('fs',{...fs,existsSync:file=>String(file).endsWith('ended_matches_cache.json') || fs.existsSync(file),
  readFileSync:(file,...args)=>String(file).endsWith('ended_matches_cache.json')?JSON.stringify({saved:original}):fs.readFileSync(file,...args),
  writeFileSync:()=>{writes++}});
stub('../db/prisma',{});
stub('../services/crexService',{});
stub('../services/providerTotalStore',{getDefaultProviderTotalStore:()=>({})});
stub('../services/dataCache',{
  getCricketMatches:()=>[{matchId:'saved',matchName:'Alpha v Beta',status:'ended',totalMatched:205}],
  getCricketSnapshot:async()=>{reads++;return null},getCrexOverview:()=>[],getTossMatches:()=>[],
  getCricketMatchesUpdatedAt:()=>null,
});
stub('../services/tossDatasetStore',{getDefaultStore:()=>({load:async()=>({records:[]})})});
stub('../services/matchDatasetStore',{getDefaultStore:()=>({load:async()=>{
  archiveReads++;return {records:[{matchId:'saved',snapshot:{teams:{
    Alpha:{trades:[{type:'back',price:2.3,updatedAt:1700000000000}]},
    Beta:{trades:[{type:'back',price:1.8,updatedAt:1700000000000}]},
  }}}]};
}})});
const {getCricketMatchesPayload}=require('../services/matchPayloadService');

test('an old ended-card cache with null odds repairs itself from the archive and stays repaired',async()=>{
  const first=await getCricketMatchesPayload(),card=first.matches.find(match=>match.matchId==='saved');
  assert.equal(card.matchLoad.team1.odds,2.3);assert.equal(card.matchLoad.team2.odds,1.8);
  assert.equal(card.matchLoad.team1.money,123);assert.equal(card.matchLoad.team2.percent,40);
  assert.equal(writes,1);assert.equal(reads,1);assert.equal(archiveReads,1);
  const next=await getCricketMatchesPayload();
  assert.equal(next.matches[0].matchLoad.team1.odds,2.3);
  assert.equal(reads,1);assert.equal(writes,1);
});
