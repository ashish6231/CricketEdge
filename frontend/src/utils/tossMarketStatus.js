import {timestamp,tradeTimestamp} from './bookiePl.js'

const key=value=>String(value||'').toLowerCase().replace(/\bwomen\b/g,'w').replace(/[^a-z0-9]/g,'')
const terminal=status=>/^(closed|settled|ended|completed|verified)$/i.test(String(status||''))

/** Result text is separate from a rule selection and from the match winner. */
export function getTossMarketStatus(snapshot,matchInfo={},now=Date.now()) {
  const names=Array.isArray(snapshot?.teamNames)?snapshot.teamNames:[]
  const aliases=names.map(name=>new Set([key(name)]))
  for(const team of [snapshot?.crex?.scorecard?.team1,snapshot?.crex?.scorecard?.team2]) {
    const index=names.findIndex(name=>key(name)===key(team?.name))
    if(index>=0 && team?.shortName)aliases[index].add(key(team.shortName))
  }
  const resolve=value=>{
    const matches=names.filter((_,index)=>aliases[index].has(key(value)))
    return matches.length===1?matches[0]:null
  }
  let winner=resolve(snapshot?.actualWinner) || resolve(matchInfo?.actualWinner),resultText=null
  for(const text of [snapshot?.tossText,snapshot?.crex?.scorecard?.tossText,snapshot?.crex?.tossText]) {
    if(winner || typeof text!=='string')continue
    const candidate=text.match(/toss\s+winner\s*[:\-]\s*(.+?)(?:\s*\(|\s+(?:opt|chose|elected|and)\b|$)/i)?.[1]
      ?? text.match(/^(.+?)\s+(?:(?:have|has)\s+)?won\s+(?:the\s+)?toss\b/i)?.[1]
      ?? text.match(/^(.+?)\s+(?:opt(?:ed)?|chose|elected)\b/i)?.[1]
    const found=candidate && resolve(candidate.trim())
    if(found){winner=found;resultText=text}
  }
  const sourceTime=timestamp(snapshot?.serverTime ?? snapshot?.updatedAt)
  const tradeTimes=names.flatMap(name=>{
    const rows=snapshot?.teams?.[name]?.trades
    return (Array.isArray(rows)?rows:[]).map(tradeTimestamp).filter(time=>time!=null && time<=now)
  })
  return {winner,resultText,resultReported:!!winner,
    closed:!!winner || terminal(snapshot?.marketStatus) || terminal(snapshot?.status) || terminal(matchInfo?.status),
    sourceTime,lastTradeTime:tradeTimes.length?Math.max(...tradeTimes):null,
    stale:sourceTime==null || now-sourceTime>120000}
}

export const formatTossTime=value=>value==null?'Unavailable':new Date(value).toLocaleString('en-IN',{
  timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short',
})+' IST'
