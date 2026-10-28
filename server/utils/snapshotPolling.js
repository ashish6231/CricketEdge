function snapshotPollingPolicy(match,{subscribed=false,liveIdleMs=60000,upcomingMs=180000}={}){
  const live=Boolean(match?.inPlay||['live','in-play'].includes(String(match?.status||'').toLowerCase()));
  return {refreshMs:subscribed?0:live?liveIdleMs:upcomingMs,fetchToss:subscribed};
}
module.exports={snapshotPollingPolicy};
