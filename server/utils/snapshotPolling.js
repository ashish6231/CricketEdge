const {providerStartTime}=require('./providerTotals.mjs');
const {isEndedStatus,isTerminalOrLiveStatus,isLiveStatus}=require('../shared/matchStatus');
function shouldCapturePreMatch(match,{now=Date.now(),lookAheadMs=6*3600000,includeStarted=false}={}) {
  const start=providerStartTime(match);
  if(includeStarted && start!=null && start<=now)
    return !isEndedStatus(match?.status);
  return start!=null && start>now && start-now<=lookAheadMs && !match?.inPlay
    && !isTerminalOrLiveStatus(match?.status);
}
function snapshotPollingPolicy(match,{subscribed=false,liveIdleMs=60000,upcomingMs=180000,now=Date.now(),capturePending=false}={}){
  const live=Boolean(match?.inPlay||isLiveStatus(match?.status));
  const nearStart=shouldCapturePreMatch(match,{now,lookAheadMs:10*60000});
  return {refreshMs:subscribed?0:capturePending?30000:live?liveIdleMs:nearStart?Math.min(upcomingMs,30000):upcomingMs,fetchToss:subscribed};
}
module.exports={snapshotPollingPolicy,shouldCapturePreMatch};
