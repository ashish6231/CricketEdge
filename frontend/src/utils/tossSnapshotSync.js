import { timestamp } from './bookiePl.js'

const snapshotTime = snapshot => timestamp(snapshot?.serverTime ?? snapshot?.updatedAt)

/** Follow the compact list feed, fetching only this open match when its snapshot is newer. */
export function createTossSnapshotSync({matchId,fetchSnapshot,onSnapshot,onError=()=>{},onSummary=()=>{}}) {
  let current=null, cancelled=false, pending=null, targetTime=-Infinity, attemptedTime=-Infinity
  function apply(snapshot) {
    if (cancelled || !snapshot || snapshot.error) return false
    const nextTime=snapshotTime(snapshot), currentTime=snapshotTime(current)
    if (current && currentTime!=null && (nextTime==null || nextTime<currentTime)) return false
    current=snapshot
    onSnapshot(snapshot)
    return true
  }
  function refresh(summary,{force=false}={}) {
    const time=timestamp(summary?.updatedAt)
    if (cancelled || (!force && (time==null || time<=(snapshotTime(current) ?? -Infinity)))) return pending
    if(time!=null)targetTime=Math.max(targetTime,time)
    if (pending) return pending
    pending=(async()=>{
      let forced=force
      while (!cancelled && (forced || targetTime>(snapshotTime(current) ?? -Infinity) && targetTime>attemptedTime)) {
        forced=false
        attemptedTime=targetTime
        try {apply(await fetchSnapshot(matchId))}
        catch(error) {if(!cancelled) onError(error)}
      }
    })().finally(()=>{pending=null})
    return pending
  }
  function refreshFromFeed(payload) {
    if (cancelled) return null
    const matches=Array.isArray(payload) ? payload : payload?.matches
    const match=Array.isArray(matches) ? matches.find(item=>String(item.matchId)===String(matchId)) : null
    if (match) onSummary(match)
    return refresh(match?.tossLoad)
  }
  return {apply,refresh,refreshFromFeed,refreshNow:()=>refresh(null,{force:true}),cancel(){cancelled=true}}
}
