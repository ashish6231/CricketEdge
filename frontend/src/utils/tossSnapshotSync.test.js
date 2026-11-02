import test from 'node:test'
import assert from 'node:assert/strict'
import { createTossSnapshotSync } from './tossSnapshotSync.js'
const time=1793517000000
const feed=updatedAt=>({matches:[{matchId:'one',tossLoad:{updatedAt}}]})

test('a newer card refreshes detail immediately and older bundles cannot overwrite it',async()=>{
  const applied=[];let calls=0
  const sync=createTossSnapshotSync({matchId:'one',onSnapshot:snapshot=>applied.push(snapshot),
    fetchSnapshot:async()=>{calls++;return {serverTime:time+10000,value:200}}})
  sync.apply({serverTime:time,value:100})
  await sync.refreshFromFeed(feed(time+10000))
  assert.equal(calls,1);assert.equal(applied.at(-1).value,200)
  assert.equal(sync.apply({serverTime:time,value:100}),false)
  await sync.refreshFromFeed(feed(time+10000));assert.equal(calls,1)
  await sync.refreshFromFeed({matches:[{matchId:'other',tossLoad:{updatedAt:time+20000}}]});assert.equal(calls,1)
})

test('in-flight refreshes coalesce and catch up when another list update arrives',async()=>{
  const applied=[];let resolveFirst,calls=0
  const sync=createTossSnapshotSync({matchId:'one',onSnapshot:snapshot=>applied.push(snapshot),fetchSnapshot:async()=>{
    calls++
    if(calls===1)return new Promise(resolve=>{resolveFirst=resolve})
    return {serverTime:time+20000,value:300}
  }})
  sync.apply({serverTime:time,value:100})
  const first=sync.refreshFromFeed(feed(time+10000))
  const second=sync.refreshFromFeed(feed(time+20000))
  assert.equal(first,second);assert.equal(calls,1)
  resolveFirst({serverTime:time+10000,value:200})
  await first;assert.equal(calls,2);assert.equal(applied.at(-1).value,300)
})

test('cancellation ignores late responses and failed requests retain the last valid snapshot',async()=>{
  const applied=[],errors=[];let resolve
  const sync=createTossSnapshotSync({matchId:'one',onSnapshot:snapshot=>applied.push(snapshot),onError:error=>errors.push(error),
    fetchSnapshot:async()=>new Promise(done=>{resolve=done})})
  sync.apply({serverTime:time,value:100})
  const pending=sync.refreshFromFeed(feed(time+10000));sync.cancel();resolve({serverTime:time+10000,value:200})
  await pending;assert.equal(applied.length,1)
  const failed=createTossSnapshotSync({matchId:'one',onSnapshot:snapshot=>applied.push(snapshot),onError:error=>errors.push(error),
    fetchSnapshot:async()=>{throw new Error('offline')}})
  failed.apply({serverTime:time,value:100});await failed.refreshFromFeed(feed(time+10000))
  assert.equal(applied.at(-1).value,100);assert.equal(errors.length,1)
})

test('runner quote metadata follows the same list feed even when trade totals are unchanged',async()=>{
  const metadata=[]
  const sync=createTossSnapshotSync({matchId:'one',onSummary:match=>metadata.push(match),onSnapshot:()=>{},
    fetchSnapshot:async()=>{throw new Error('Already current; no fetch expected')}})
  sync.apply({serverTime:time})
  await sync.refreshFromFeed({matches:[{matchId:'one',runners:[{name:'Alpha',back:2.04}],tossLoad:{updatedAt:time}}]})
  assert.equal(metadata[0].runners[0].back,2.04)
  sync.cancel()
  await sync.refreshFromFeed(feed(time+10000))
  assert.equal(metadata.length,1)
})

test('periodic recovery refreshes unchanged source timestamps and receives a separately reported result',async()=>{
  let calls=0;const applied=[]
  const sync=createTossSnapshotSync({matchId:'one',onSnapshot:s=>applied.push(s),fetchSnapshot:async()=>{
    calls++;return {serverTime:time,tossText:'Toss Winner: Afghanistan (opt to Bowl)'}
  }})
  sync.apply({serverTime:time})
  await sync.refreshNow()
  assert.equal(calls,1);assert.match(applied.at(-1).tossText,/Afghanistan/)
  await sync.refreshNow();assert.equal(calls,2)
  sync.cancel();await sync.refreshNow();assert.equal(calls,2)
})

test('simultaneous periodic refreshes share one request and failures remain retryable',async()=>{
  let calls=0,resolve;const errors=[]
  const sync=createTossSnapshotSync({matchId:'one',onSnapshot:()=>{},onError:error=>errors.push(error),
    fetchSnapshot:()=>{calls++;return new Promise(done=>{resolve=done})}})
  const a=sync.refreshNow(),b=sync.refreshNow();assert.equal(a,b);assert.equal(calls,1)
  resolve({serverTime:time});await a
  let attempts=0
  const retry=createTossSnapshotSync({matchId:'one',onSnapshot:()=>{},onError:error=>errors.push(error),
    fetchSnapshot:async()=>{attempts++;throw new Error('offline')}})
  await retry.refreshNow();await retry.refreshNow()
  assert.equal(attempts,2);assert.equal(errors.length,2)
})
