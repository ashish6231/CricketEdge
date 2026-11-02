const test=require('node:test');
const assert=require('node:assert/strict');
const {pagination,paginateMatches}=require('../lib/pagination');
const {createReadCache}=require('../lib/readCache');
const {createLocalJobQueue}=require('../services/adminJobs');
const {parseVital}=require('../middleware/performance');
const {setStaticCacheHeaders}=require('../lib/staticCaching');
const {RedisSessionStore}=require('../lib/redisSessionStore');

test('query pages reject invalid limits, cap large pages, and filter before slicing',()=>{
  for(const value of [-1,0,'abc',1.2,Infinity])assert.deepEqual(pagination({page:value,limit:value}),{page:1,limit:20,skip:0});
  assert.equal(pagination({limit:100000}).limit,100);
  const payload={matches:[{matchName:'A v B'},{matchName:'C v D'},{matchName:'A v E'}]};
  assert.equal(paginateMatches(payload),payload);
  const result=paginateMatches(payload,{page:2,limit:1,search:'A v'});
  assert.equal(result.total,2);assert.equal(result.matches[0].matchName,'A v E');
});

test('public cache deduplicates misses, tolerates a Redis outage, and invalidates',async()=>{
  let calls=0;
  const redis={async get(){throw new Error('offline')},async set(){throw new Error('offline')},async del(){}};
  const cache=createReadCache({getRedis:()=>redis});
  const load=async()=>{calls++;return {price:10}};
  await Promise.all([cache.remember('plan',load),cache.remember('plan',load)]);
  await cache.remember('plan',load);assert.equal(calls,1);
  await cache.invalidate('plan');await cache.remember('plan',load);assert.equal(calls,2);
});

test('capture requests return before slow work, coalesce active jobs, and record completion',async()=>{
  let finish,calls=0;
  const queue=createLocalJobQueue({toss:async()=>{calls++;return new Promise(resolve=>{finish=resolve})}});
  const first=await queue.add('toss'),second=await queue.add('toss');
  assert.equal(first.id,second.id);assert.equal(first.state,'waiting');assert.equal(calls,0);
  await new Promise(setImmediate);assert.equal(calls,1);assert.equal((await queue.get(first.id)).state,'active');
  finish({captured:3});await new Promise(setImmediate);
  assert.deepEqual((await queue.get(first.id)).data,{captured:3});
});

test('failed jobs report failure while later work can continue',async()=>{
  const queue=createLocalJobQueue({fail:async()=>{throw new Error('private error')},ok:async()=>1});
  const failed=await queue.add('fail'),good=await queue.add('ok');
  await new Promise(setImmediate);
  assert.equal((await queue.get(failed.id)).state,'failed');
  assert.equal((await queue.get(good.id)).data,1);
});

test('browser vitals accept only bounded metrics and discard identifiers and query strings',()=>{
  const input={name:'LCP',value:2500,rating:'good',page:'/cricket/match/:id',connection:'3g',email:'secret'};
  assert.deepEqual(parseVital(input),{event:'web_vital',name:'LCP',value:2500,rating:'good',page:'/cricket/match/:id',connection:'3g'});
  assert.equal(parseVital({...input,value:-1}),null);
  assert.equal(parseVital({...input,name:'raw-data'}),null);
  assert.equal(parseVital({...input,page:'/admin?email=secret'}).page,'/other');
});

test('only hashed build assets are immutable; HTML always revalidates',()=>{
  const headers={},res={setHeader(key,value){headers[key]=value}};
  setStaticCacheHeaders(res,'/dist/assets/index-1234abcd.js');assert.match(headers['Cache-Control'],/immutable/);
  setStaticCacheHeaders(res,'/dist/index.html');assert.equal(headers['Cache-Control'],'no-cache');
  setStaticCacheHeaders(res,'/dist/logo-long-name.webp');assert.equal(headers['Cache-Control'],'public, max-age=86400');
});

test('replicas share HTTP sessions with bounded TTL and can delete them',async()=>{
  const values=new Map();let ttl;
  const redis={async get(key){return values.get(key)},async set(key,value,_mode,seconds){values.set(key,value);ttl=seconds},
    async del(key){values.delete(key)},async expire(_key,seconds){ttl=seconds}};
  const first=new RedisSessionStore(redis),second=new RedisSessionStore(redis);
  const session={cookie:{maxAge:60000},redirectTo:'/cricket'};
  await new Promise((resolve,reject)=>first.set('id',session,error=>error?reject(error):resolve()));
  assert.equal(ttl,60);
  const restored=await new Promise((resolve,reject)=>second.get('id',(error,value)=>error?reject(error):resolve(value)));
  assert.deepEqual(restored,session);
  await new Promise((resolve,reject)=>second.destroy('id',error=>error?reject(error):resolve()));
  assert.equal(values.size,0);
});
