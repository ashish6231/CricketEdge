const test=require('node:test');
const assert=require('node:assert/strict');
const {snapshotPollingPolicy,shouldCapturePreMatch}=require('../utils/snapshotPolling');
test('watched detail retains every-cycle updates and toss requests',()=>{
 for(const status of ['live','upcoming','ended'])assert.deepEqual(snapshotPollingPolicy({status},{subscribed:true}),{refreshMs:0,fetchToss:true});
});
test('pre-match history is captured without viewers and refreshes near kickoff',()=>{
 const now=Date.now(),match={status:'upcoming',startTime:now+5*60000};
 assert.equal(shouldCapturePreMatch(match,{now}),true);
 assert.equal(snapshotPollingPolicy(match,{now}).refreshMs,30000);
 for(const invalid of [{...match,status:'ended'},{...match,inPlay:true},{...match,startTime:null},
   {...match,startTime:now-1},{...match,startTime:now+7*3600000}])assert.equal(shouldCapturePreMatch(invalid,{now}),false);
});
test('unwatched live matches use one-minute snapshots without repeatedly fetching a decided toss',()=>{
 assert.deepEqual(snapshotPollingPolicy({status:'live'}),{refreshMs:60000,fetchToss:false});
 assert.deepEqual(snapshotPollingPolicy({inPlay:true}),{refreshMs:60000,fetchToss:false});
});
test('upcoming cadence and configured idle cadence are preserved',()=>{
 assert.deepEqual(snapshotPollingPolicy({status:'upcoming'}),{refreshMs:180000,fetchToss:false});
 assert.equal(snapshotPollingPolicy({status:'live'},{liveIdleMs:120000}).refreshMs,120000);
});
test('an unlocked started match continues collecting until all four exposures arrive',()=>{
 const now=Date.now(),match={status:'live',inPlay:true,startTime:now-60000};
 assert.equal(shouldCapturePreMatch(match,{now,includeStarted:true}),true);
 assert.equal(snapshotPollingPolicy(match,{now,capturePending:true}).refreshMs,30000);
 assert.equal(shouldCapturePreMatch({...match,status:'ended'},{now,includeStarted:true}),false);
});
