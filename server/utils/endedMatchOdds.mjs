import { finiteNumber, tradeSide, tradeTimestamp } from './bookiePl.mjs';

const normalize=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const validBackOdds=value=>finiteNumber(value)>1 ? Number(value) : null;

/** Read actual saved Back quotes/trades. Lay prices and implied averages are
 * different values and must never be labelled Back odds. */
export function savedBackOdds(snapshot,name) {
  if(!snapshot || snapshot.error || !normalize(name))return null;
  const same=value=>normalize(value)===normalize(name);
  const team=Object.entries(snapshot.teams||{}).find(([key])=>same(key))?.[1];
  let latest=null,time=-Infinity;
  for(const row of Array.isArray(team?.trades)?team.trades:[]) {
    const price=validBackOdds(row?.price),at=tradeTimestamp(row) ?? -Infinity;
    if(tradeSide(row)!=='back' || price==null || (latest!=null && at<=time))continue;
    latest=price;time=at;
  }
  if(latest!=null)return latest;
  for(const runners of [snapshot.runners,snapshot.liveOdds?.runners]) {
    if(!Array.isArray(runners))continue;
    const runner=runners.find(row=>same(row?.runnerName||row?.name));
    const price=validBackOdds(runner?.back) ?? validBackOdds(runner?.backPrice)
      ?? validBackOdds(runner?.ex?.availableToBack?.[0]?.price);
    if(price!=null)return price;
  }
  for(const quotes of [snapshot.odds,snapshot.liveOdds?.odds]) {
    if(!quotes || Array.isArray(quotes))continue;
    const quote=Object.entries(quotes).find(([key])=>same(key))?.[1];
    const price=validBackOdds(quote?.back) ?? validBackOdds(quote?.backPrice);
    if(price!=null)return price;
  }
  return null;
}

export function hasCompleteCardOdds(entry) {
  return ['team1','team2'].every(key=>validBackOdds(entry?.matchLoad?.[key]?.odds)!=null);
}

/** Fill gaps without replacing frozen money, shares, or already saved odds. */
export function repairCompletedCardOdds(entry,snapshot,matchInfo) {
  if(!entry?.matchLoad)return entry;
  let changed=false;
  const load={...entry.matchLoad};
  for(const key of ['team1','team2']) {
    const team=load[key];
    if(!team || validBackOdds(team.odds)!=null)continue;
    const price=savedBackOdds(snapshot,team.name) ?? savedBackOdds(matchInfo,team.name)
      ?? savedBackOdds({runners:entry.runners},team.name);
    if(price!=null){load[key]={...team,odds:price};changed=true}
  }
  return changed ? {...entry,matchLoad:load} : entry;
}
