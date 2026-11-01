const test=require('node:test');
const assert=require('node:assert/strict');
function stub(name,exports){const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports};}
const requests=[],jobs=[];
let done;
const ready=new Promise(resolve=>{done=resolve;});
class Adapter {
  async getMatches(){return [];}
  async getTossMatches(){return [{matchId:'toss-only-id',status:'live'}];}
  async getSessionMatches(){return [];}
  async getTossSnapshot(id){requests.push(id);return {teamNames:['A','B'],totalMatched:123};}
}
stub('../services/scraper-tennisliveload/adapter',Adapter);
stub('../services/scraper-tennisliveload/session',{
  loadSavedSession:async()=>true,acquireSingletonLock:async()=>true,isSingletonLeader:()=>true,
});
stub('../services/normalizer/queue',{getIngestQueue:()=>({add:async(_,job)=>{
  jobs.push(job);if(job.type==='toss:snapshot')done();
}})});
stub('../services/socketService',{
  getConnectedClientsCount:()=>1,getActiveSubscribedMatchIds:()=>[],hasActiveFeedSubscribers:feed=>feed==='toss',
});
stub('../services/dataCache',{getCricketMatches:()=>[]});
const worker=require('../services/scraper-tennisliveload');

test('the actual ingestion loop fetches toss-only list cards without detail-room subscriptions',async t=>{
  t.after(()=>worker.stop());
  let timeout;
  t.after(()=>clearTimeout(timeout));
  await worker.start();
  await Promise.race([ready,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Toss list was not refreshed')),1000);})]);
  assert.deepEqual(requests,['toss-only-id']);
  assert.equal(jobs.find(job=>job.type==='toss:snapshot').data.totalMatched,123);
});
