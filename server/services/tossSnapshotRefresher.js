const ended = match => ['ended','completed','closed','verified','pending'].includes(String(match?.status || '').toLowerCase());

/** Refresh list cards independently of cricket IDs and open match detail rooms. */
function createTossSnapshotRefresher({fetchSnapshot,ingestSnapshot,now=Date.now,activeRefreshMs=10000,
  upcomingRefreshMs=60000,endedRefreshMs=300000} = {}) {
  const attempts = new Map(), pending = new Map();
  async function refresh(matches, {subscribedIds=[],watchingFeed=false} = {}) {
    const subscribed = new Set([...subscribedIds].map(String));
    const targets = new Map((Array.isArray(matches) ? matches : [])
      .filter(match => watchingFeed || subscribed.has(String(match.matchId || match.id)))
      .map(match => [String(match.matchId || match.id || ''),match]));
    for (const id of subscribed) if (!targets.has(id)) targets.set(id,{matchId:id});
    let backgroundCount = 0;
    const due = [...targets].filter(([id,match]) => {
      if (!id || pending.has(id)) return false;
      const interval = subscribed.has(id) || match.inPlay || ['live','in-play'].includes(String(match.status).toLowerCase())
        ? activeRefreshMs : ended(match) ? endedRefreshMs : upcomingRefreshMs;
      if (attempts.has(id) && now()-attempts.get(id) < interval) return false;
      if (ended(match) && !subscribed.has(id) && ++backgroundCount>2) return false;
      return true;
    });
    for (let offset=0; offset<due.length; offset+=3) {
      await Promise.all(due.slice(offset,offset+3).map(async ([id]) => {
        // Another refresh may have claimed this target while the previous batch awaited.
        if (pending.has(id) || (attempts.has(id) && now()-attempts.get(id)<activeRefreshMs)) return;
        attempts.set(id,now());
        const work = Promise.resolve().then(() => fetchSnapshot(id)).then(snapshot => {
          if (snapshot && !snapshot.error) return ingestSnapshot(id,snapshot);
        }).catch(() => {});
        pending.set(id,work);
        try { await work; } finally { if (pending.get(id)===work) pending.delete(id); }
      }));
    }
  }
  return {refresh};
}
module.exports = {createTossSnapshotRefresher};
