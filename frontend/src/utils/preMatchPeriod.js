import { finiteNumber, getTradeStats, timestamp, tradeTimestamp, splitMatchOutcomes } from './bookiePl.js'
import { getFrozenPreMatchProviderTotals } from './selectionVolume.js'
import {isPreMatchCapture} from '../../../server/utils/preMatchExposure.mjs'

const amount = value => {
  const number = finiteNumber(value)
  return number != null && number >= 0 ? number : null
}
const hasFlow = volume => Object.values(volume || {}).some(side => amount(side?.back) > 0 || amount(side?.lay) > 0)

/** Resolve period fields independently of the live market. An empty provider
 * period must not hide observed pre-start trades or an earlier valid capture.
 * Recorded history is labelled separately: it need not cover the whole market. */
export function getPreMatchPeriod(snapshot, {
  startTime, captured = null, capturedTotals = null,
} = {}) {
  const capture=snapshot?.preMatchCapture
  if(isPreMatchCapture(capture,timestamp(snapshot?.startTime ?? startTime))) {
    const sources=capture.sources || {pnl:{},volume:{}}
    for(const [index] of capture.teamNames.entries()) {
      const key=`team${index+1}`
      if(!sources.pnl[key])sources.pnl[key]=capture.mode==='after-start'?'recorded':'provider'
      if(!sources.volume[key])sources.volume[key]={back:capture.mode==='after-start'?'recorded':'provider',lay:capture.mode==='after-start'?'recorded':'provider'}
    }
    const {t1,t2}=splitMatchOutcomes(capture.teamNames)
    return {pnl:capture.pnl,bets:capture.bets,volume:capture.volume,
      providerTotals:[t1,t2].map(name=>capture.providerTotals?.[`team${capture.teamNames.indexOf(name)+1}`] ?? null),
      sources,usesRecorded:Object.values(sources.pnl).includes('recorded'),providerMissing:false}
  }
  const names = snapshot?.teamNames || []
  const start = timestamp(snapshot?.startTime) ?? timestamp(startTime)
  const asOf = timestamp(snapshot?.serverTime ?? snapshot?.updatedAt)
  const usable = !snapshot?.error && !snapshot?._seeded && start != null && names.length >= 2
  const saved = usable && timestamp(captured?.startTime) === start
    && names.length === captured?.teamNames?.length
    && names.every(name => captured.teamNames.includes(name)) ? captured : null
  const savedKey = name => `team${(saved?.teamNames.indexOf(name) ?? -1) + 1}`
  const counts = {}, stats = {}
  for (const [index,name] of names.entries()) {
    const rows = snapshot?.teams?.[name]?.trades
    if (!usable) continue
    const savedExposure = snapshot.preMatchCapture && !isPreMatchCapture(snapshot.preMatchCapture,start)
      ? null : snapshot.preMatchExposure?.[`team${index+1}`]
    const validSaved = savedExposure && ['backExposure','layExposure','backStake','layStake','recordedTrades']
      .every(key=>amount(savedExposure[key])!=null)
    const pre = Array.isArray(rows) && rows.every(row=>tradeTimestamp(row)!=null)
      ? rows.filter(row => tradeTimestamp(row) < start && (asOf == null || tradeTimestamp(row) <= asOf)) : null
    const summary = pre ? getTradeStats(pre) : null
    if (validSaved && (!summary || summary.invalid || savedExposure.recordedTrades>pre.length)) {
      stats[name]={tBack:Number(savedExposure.backStake),tLay:Number(savedExposure.layStake),
        tBackLiab:Number(savedExposure.backExposure),tLayLiab:Number(savedExposure.layExposure)}
      counts[name]=Number(savedExposure.recordedTrades)
    } else if (summary && !summary.invalid) {
      stats[name]=summary
      counts[name]=pre.length
    }
  }
  const observedFlow = Object.values(stats).some(s => s.tBack > 0 || s.tLay > 0)
  const emptyProvider = !hasFlow(snapshot?.preMatchVolume)
  const contradicted = emptyProvider && (observedFlow || hasFlow(saved?.volume))
  const calculated = names.every(name => stats[name]) && (observedFlow || snapshot?.tradesComplete === true)
    ? Object.fromEntries(names.map(name=>[name,names.filter(other=>other!==name)
      .reduce((sum,other)=>sum+stats[other].tBack-stats[other].tLay,0)-stats[name].tBackLiab+stats[name].tLayLiab])) : {}
  const pnl = {}, bets = {}, volume = {}, sources = { pnl: {}, volume: {} }
  for (const [index, name] of names.entries()) {
    const key = `team${index + 1}`, oldKey = savedKey(name)
    const currentVolume = snapshot?.preMatchVolume?.[key]
    const oldVolume = saved?.volume?.[oldKey]
    const currentHasFlow = hasFlow({ [key]: currentVolume })
    const oldHasFlow = hasFlow({ [key]: oldVolume })
    const record = (counts[name] || snapshot?.tradesComplete === true) ? stats[name] : null
    const zeroConflict = !currentHasFlow && record && record.tBack + record.tLay > 0
    volume[key] = {}
    for (const side of ['back', 'lay']) {
      const current = usable ? amount(currentVolume?.[side]) : null
      const old = amount(oldVolume?.[side])
      const provider = zeroConflict || (emptyProvider && oldHasFlow) ? null : current
      const fromCapture = provider == null && old != null && (oldHasFlow || !zeroConflict)
      volume[key][side] = provider ?? (fromCapture ? old : record?.[side === 'back' ? 'tBack' : 'tLay'] ?? null)
      sources.volume[key] ||= {}
      sources.volume[key][side] = provider != null || fromCapture ? 'provider' : record ? 'recorded' : 'unavailable'
    }
    const currentPnl = usable ? finiteNumber(snapshot?.preMatchPnl?.[key]) : null
    const oldPnl = finiteNumber(saved?.pnl?.[oldKey])
    const providerPnl = contradicted && currentPnl === 0 ? null : currentPnl
    const capturedPnl = oldPnl != null && hasFlow(saved?.volume) ? oldPnl : null
    pnl[key] = providerPnl ?? capturedPnl ?? calculated[name] ?? null
    sources.pnl[key] = providerPnl != null || capturedPnl != null ? 'provider'
      : calculated[name] != null ? 'recorded' : 'unavailable'
    const currentBets = usable ? amount(snapshot?.preMatchTotalBets?.[key]) : null
    const oldBets = amount(saved?.bets?.[oldKey])
    bets[key] = contradicted && currentBets === 0 ? oldBets > 0 ? oldBets : null : currentBets ?? oldBets
  }
  const providerTotals = getFrozenPreMatchProviderTotals(snapshot, capturedTotals)?.map((value, index) => {
    if (!usable) return null
    if (contradicted && value === 0) return bets[`team${index + 1}`] > 0 ? bets[`team${index + 1}`] : null
    return value
  }) || [null, null]
  return { pnl, bets, volume, providerTotals, sources,
    usesRecorded: Object.values(sources.pnl).includes('recorded')
      || Object.values(sources.volume).some(sides => Object.values(sides).includes('recorded')),
    providerMissing: contradicted,
  }
}
