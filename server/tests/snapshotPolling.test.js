const test=require('node:test');
const assert=require('node:assert/strict');
const {snapshotPollingPolicy}=require('../utils/snapshotPolling');
test('watched detail retains every-cycle updates and toss requests',()=>{
 for(const status of ['live','upcoming','ended'])assert.deepEqual(snapshotPollingPolicy({status},{subscribed:true}),{refreshMs:0,fetchToss:true});
});
test('unwatched live matches use one-minute snapshots without repeatedly fetching a decided toss',()=>{
 assert.deepEqual(snapshotPollingPolicy({status:'live'}),{refreshMs:60000,fetchToss:false});
 assert.deepEqual(snapshotPollingPolicy({inPlay:true}),{refreshMs:60000,fetchToss:false});
});
test('upcoming cadence and configured idle cadence are preserved',()=>{
 assert.deepEqual(snapshotPollingPolicy({status:'upcoming'}),{refreshMs:180000,fetchToss:false});
 assert.equal(snapshotPollingPolicy({status:'live'},{liveIdleMs:120000}).refreshMs,120000);
});
