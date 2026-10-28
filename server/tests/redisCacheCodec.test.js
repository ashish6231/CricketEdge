const test=require('node:test');
const assert=require('node:assert/strict');
const {encodeCacheValue,decodeCacheValue,installCacheCompression}=require('../shared/redisCacheCodec');

test('large repeated trade snapshots shrink and round-trip without changing values',()=>{
  const raw=JSON.stringify({teamNames:['India','England'],teams:{India:{trades:Array.from({length:2000},(_,i)=>({type:i%2?'back':'lay',price:1.95,size:100+i,updatedAt:1792840000000+i}))}}});
  const encoded=encodeCacheValue(raw);
  assert(Buffer.byteLength(encoded)<Buffer.byteLength(raw)/4);
  assert.equal(decodeCacheValue(encoded),raw);
});
test('small values and pre-deploy plain JSON remain readable',()=>{
  for(const raw of [null,'{}','{"team1":0,"team2":12}']){
    assert.equal(encodeCacheValue(raw),raw);assert.equal(decodeCacheValue(raw),raw);
  }
});
test('cache compression preserves expiry and never changes queue, lock or auth writes',async()=>{
  const rows=new Map(),writes=[];
  const client=installCacheCompression({async set(key,value,...args){rows.set(key,value);writes.push({key,value,args});return 'OK';},async get(key){return rows.get(key)??null;}});
  const raw=JSON.stringify({trades:Array.from({length:500},()=>({price:2,size:100,type:'back'}))});
  assert.equal(await client.set('match:123:bundle',raw,'EX',120),'OK');
  assert.notEqual(rows.get('match:123:bundle'),raw);assert.equal(await client.get('match:123:bundle'),raw);
  assert.deepEqual(writes[0].args,['EX',120]);
  for(const key of ['bull:cricket-ingest-queue:123','tll:session:cookies','lock:tll']){
    await client.set(key,raw,'NX','EX',30);assert.equal(rows.get(key),raw);assert.equal(await client.get(key),raw);
  }
});
