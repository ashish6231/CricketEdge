import { finiteNumber, getTradeStats, timestamp, tradeTimestamp } from './bookiePl.js'
import {capturePreMatchExposure} from '../../../server/utils/preMatchExposure.mjs'

const unavailable = name => ({teamName:name,backExposure:null,layExposure:null,netExposure:null})
const matches = (actual,expected) => expected!=null && expected>=0
  && Math.abs(actual-expected)<=Math.max(.02,Math.abs(expected)*1e-8)

/** Match exposure to the selected time window; stake aggregates alone cannot supply liabilities. */
export function getPeriodExposure(snapshot,team1,team2,{period='pre',startTime,volumes}={}) {
  if(period==='pre') {
    const resolved=capturePreMatchExposure({...snapshot,startTime:snapshot?.startTime ?? startTime})
    const capture=resolved?.preMatchCapture
    const teams=[team1,team2].map(name=>{
      const index=resolved?.teamNames?.indexOf(name) ?? -1
      const value=capture?.exposure?.[`team${index+1}`]
      return {teamName:name,backExposure:value?.backExposure ?? null,layExposure:value?.layExposure ?? null,
        netExposure:capture?.state==='locked' ? value?.netExposure ?? null : null}
    })
    return {team1:teams[0],team2:teams[1],available:teams.every(team=>team.netExposure!=null),
      complete:capture?.state==='locked',capture}
  }
  const start=timestamp(snapshot?.startTime ?? startTime)
  const asOf=timestamp(snapshot?.serverTime ?? snapshot?.updatedAt)
  const fields={live:'inPlayVolume','3min':'threeMinVolume'}
  const declared=volumes ?? snapshot?.[fields[period]]
  const names=[team1,team2]
  const coverage=[false,false]
  const calculate=(name,selectionIndex)=>{
    const empty=unavailable(name)
    const index=snapshot?.teamNames?.indexOf(name) ?? -1
    if(snapshot?.error || !fields[period] || start==null || asOf==null)return empty
    const trades=snapshot?.teams?.[name]?.trades
    if(!Array.isArray(trades) || trades.some(trade=>tradeTimestamp(trade)==null))return empty
    const rows=trades.filter(trade=>{
      const time=tradeTimestamp(trade)
      if(asOf!=null && time>asOf)return false
      return period==='live' ? time>=start : time>=Math.max(start,asOf-180000)
    })
    const stats=getTradeStats(rows)
    if(stats.invalid || !Number.isFinite(stats.tBackLiab) || !Number.isFinite(stats.tLayLiab))return empty
    const volume=index<0 ? null : declared?.[`team${index+1}`]
    coverage[selectionIndex]=volume
      ? matches(stats.tBack,finiteNumber(volume.back)) && matches(stats.tLay,finiteNumber(volume.lay))
      : snapshot?.tradesComplete===true
    // Nonempty priced history can show its observed exposure without claiming
    // that it covers the provider's entire period volume.
    if(!coverage[selectionIndex] && !rows.length)return empty
    return {teamName:name,backExposure:stats.tBackLiab,layExposure:stats.tLayLiab,netExposure:stats.tBackLiab-stats.tLayLiab}
  }
  const teams=names.map(calculate)
  return {team1:teams[0],team2:teams[1],available:teams.every(team=>team.netExposure!=null),complete:coverage.every(Boolean)}
}
