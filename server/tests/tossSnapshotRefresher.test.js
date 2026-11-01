const test=require('node:test');
const assert=require('node:assert/strict');
const {createTossSnapshotRefresher}=require('../services/tossSnapshotRefresher');

test('toss-list viewers receive snapshots for toss-only IDs and refreshed values on later cycles',async()=>{
  let time=0,value=10;const fetched=[],ingested=[];
  const worker=createTossSnapshotRefresher({now:()=>time,fetchSnapshot:async id=>{fetched.push(id);return {value};},
    ingestSnapshot:async(id,data)=>ingested.push({id,...data})});
  const matches=[{matchId:'toss-only',status:'live'}];
  await worker.refresh(matches);assert.equal(fetched.length,0);
  await worker.refresh(matches,{watchingFeed:true});assert.deepEqual(ingested,[{id:'toss-only',value:10}]);
  time=9999;await worker.refresh(matches,{watchingFeed:true});assert.equal(fetched.length,1);
  time=10000;value=20;await worker.refresh(matches,{watchingFeed:true});assert.equal(ingested.at(-1).value,20);
});

test('detail subscribers are refreshed even when absent from the match list',async()=>{
  const fetched=[];
  const worker=createTossSnapshotRefresher({fetchSnapshot:async id=>{fetched.push(id);return {};},ingestSnapshot:async()=>{}});
  await worker.refresh([],{subscribedIds:['detail-only']});assert.deepEqual(fetched,['detail-only']);
});

test('overlapping refreshes coalesce and failed feeds do not publish invented snapshots',async()=>{
  let finish,calls=0;const ingested=[];
  const worker=createTossSnapshotRefresher({fetchSnapshot:async()=>{calls++;return new Promise(resolve=>{finish=resolve;});},
    ingestSnapshot:async(id,data)=>ingested.push(data)});
  const first=worker.refresh([{id:'one',status:'live'}],{watchingFeed:true});
  await Promise.resolve();
  await worker.refresh([{id:'one',status:'live'}],{watchingFeed:true});
  assert.equal(calls,1);finish({error:'HTTP 401'});await first;assert.equal(ingested.length,0);
});

test('completed list cards warm gradually while upcoming cards retain a slower cadence',async()=>{
  let time=0;const fetched=[];
  const worker=createTossSnapshotRefresher({now:()=>time,fetchSnapshot:async id=>{fetched.push(id);return {};},ingestSnapshot:async()=>{}});
  const matches=[{id:'soon',status:'upcoming'},...['a','b','c'].map(id=>({id,status:'ended'}))];
  await worker.refresh(matches,{watchingFeed:true});assert.deepEqual(fetched,['soon','a','b']);
  time=10000;await worker.refresh(matches,{watchingFeed:true});assert.deepEqual(fetched,['soon','a','b','c']);
  time=60000;await worker.refresh(matches,{watchingFeed:true});assert.equal(fetched.at(-1),'soon');
});
