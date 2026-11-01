const test=require('node:test');
const assert=require('node:assert/strict');
function stub(name,exports){const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports};}
let snapshot=null;
const matches=[{matchId:'live-toss',matchName:'New Zealand v India',competitionName:'International Twenty20 Matches',status:'live',inPlay:true}];
stub('../db/prisma',{});
stub('../services/dataCache',{getTossMatches:()=>matches,getTossSnapshot:async()=>snapshot,getTossMatchesUpdatedAt:()=>new Date().toISOString()});
stub('../services/crexService',{});
stub('../services/tossDatasetStore',{getDefaultStore:()=>({load:async()=>({records:[]})})});
const {getTossMatchesPayload}=require('../services/matchPayloadService');
const {snapshotFeed,diffFeed}=require('../utils/feedDelta');

test('HTTP/socket toss list includes current values and produces a delta when only a snapshot changes',async()=>{
  const initial=await getTossMatchesPayload();
  assert.equal(initial.matches[0].totalMatched,null);
  assert.equal(initial.matches[0].tossLoad.team1.money,null);
  snapshot={teamNames:['New Zealand','India'],advancedMetrics:{team1:{back:100,lay:20},team2:{back:60,lay:40}},
    teams:{'New Zealand':{trades:[{type:'back',price:1.98,size:100,updatedAt:10},{type:'lay',price:2,size:20,updatedAt:11}]},
      India:{trades:[{type:'back',price:1.98,size:60,updatedAt:10},{type:'lay',price:2,size:40,updatedAt:11}]}},
    runners:[{name:'New Zealand',back:1.98,backSize:1000},{name:'India',back:2.02,backSize:2000}]};
  const next=await getTossMatchesPayload();
  const card=next.matches[0];
  assert.equal(card.totalMatched,220);assert.equal(card.tossLoad.team1.odds,1.98);
  assert.equal(card.tossLoad.team1.liquidity,1000);assert.equal(card.tossLoad.team1.netExposure,78);
  const delta=diffFeed(snapshotFeed(initial),snapshotFeed(next));
  assert.equal(delta.changed.length,1);assert.equal(delta.changed[0].tossLoad.team2.odds,2.02);
  snapshot.runners[0].back=2.04;
  const refreshed=await getTossMatchesPayload();
  assert.equal(diffFeed(snapshotFeed(next),snapshotFeed(refreshed)).changed[0].tossLoad.team1.odds,2.04);
});
