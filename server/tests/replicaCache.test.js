const test=require('node:test');
const assert=require('node:assert/strict');
const {encodeCacheValue}=require('../shared/redisCacheCodec');
const rows=new Map();let batches=0;
const redis={async get(key){return rows.get(key)},async mget(...keys){batches++;return keys.map(key=>rows.get(key)||null)}};
function stub(path,exports){const id=require.resolve(path);require.cache[id]={id,filename:id,loaded:true,exports}}
stub('../shared/redis',{REDIS_URL:'offline-test',getRedisClient:()=>redis,getCacheRedisClient:()=>redis});
stub('../db/prisma',{});
stub('../services/crexService',{findCrexMatch:()=>null});
stub('../services/providerTotalStore',{getDefaultProviderTotalStore:()=>({})});
const normalizer=require('../services/normalizer/normalizer');

test('a cold replica mirrors feed state and fetches compressed bundles in a single batch',async()=>{
  const updatedAt='2026-11-02T06:00:00Z';
  rows.set('matches:cricket',JSON.stringify({matches:[{matchId:'a'},{matchId:'b'}],updatedAt}));
  rows.set('matches:toss',JSON.stringify([{matchId:'a'}]));
  const snapshot={teamNames:['A','B'],teams:{A:{trades:Array.from({length:100},()=>({price:2,size:10}))}}};
  rows.set('match:a:bundle',encodeCacheValue(JSON.stringify({cricket:snapshot})));
  rows.set('match:b:bundle',JSON.stringify({toss:{teamNames:['C','D']}}));
  await normalizer.syncCachedState();
  assert.equal(normalizer.getCricketMatches().length,2);
  assert.equal(normalizer.getTossMatches().length,1);
  assert.equal(normalizer.getCricketMatchesUpdatedAt(),updatedAt);
  await normalizer.syncCachedBundles(['a','a','b']);
  assert.equal(batches,1);
  assert.deepEqual(normalizer.getMatchBundle('a').cricket,snapshot);
  assert.deepEqual(normalizer.getMatchBundle('b').toss.teamNames,['C','D']);
  await normalizer.syncCachedBundles(['a','b']);assert.equal(batches,1);
});
