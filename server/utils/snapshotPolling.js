const {providerStartTime}=require('./providerTotals.mjs');
function shouldCapturePreMatch(match,{now=Date.now(),lookAheadMs=6*3600000,includeStarted=false}={}) {
  const start=providerStartTime(match);
  if(includeStarted && start!=null && start<=now)
    return !/^(ended|completed|closed|verified|pending|cancelled|abandoned)$/i.test(String(match?.status||''));
  return start!=null && start>now && start-now<=lookAheadMs && !match?.inPlay
    && !/^(live|in-play|ended|completed|closed|verified|pending|cancelled|abandoned)$/i.test(String(match?.status||''));
}
function snapshotPollingPolicy(match,{subscribed=false,liveIdleMs=60000,upcomingMs=180000,now=Date.now(),capturePending=false}={}){
  const live=Boolean(match?.inPlay||['live','in-play'].includes(String(match?.status||'').toLowerCase()));
  const nearStart=shouldCapturePreMatch(match,{now,lookAheadMs:10*60000});
  return {refreshMs:subscribed?0:capturePending?30000:live?liveIdleMs:nearStart?Math.min(upcomingMs,30000):upcomingMs,fetchToss:subscribed};
}
module.exports={snapshotPollingPolicy,shouldCapturePreMatch};
