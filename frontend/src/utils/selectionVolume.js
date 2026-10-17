import { finiteNumber, timestamp, tradeSide, tradeTimestamp } from './bookiePl.js'
import { isMatchEnded, isMatchLiveByStart } from './matchTiming.js'

const providerTotalPair = source => {
  const values = Array.isArray(source)
    ? source
    : [source?.team1 ?? source?.totalBetTeam1, source?.team2 ?? source?.totalBetTeam2]
  const pair = values.slice(0, 2).map(finiteNumber)
  return pair.length === 2 && pair.some(value => value != null) ? pair : null
}

/** Current provider totals. These may continue changing after the market goes live. */
export function getLiveProviderTotals(snapshot) {
  return providerTotalPair(snapshot?.deepMetrics?.totals)
}

/** Stable pre-match provider totals, including persisted values captured before start. */
export function getFrozenPreMatchProviderTotals(snapshot, stored = null) {
  return providerTotalPair(stored)
    || providerTotalPair(snapshot?.preMatchProviderTotals)
    || providerTotalPair(snapshot?.deepMetrics?.preMatchTotals)
    || providerTotalPair(snapshot?.preMatchTotalBets)
}

/** Provider totals can only be refreshed before the scheduled start. */
export function canCapturePreMatchProviderTotals(snapshot, now = Date.now()) {
  return Boolean(snapshot) && !isMatchEnded(snapshot) && !isMatchLiveByStart(snapshot, now)
}

const reportedActivityPair = source => {
  const values = [finiteNumber(source?.team1), finiteNumber(source?.team2)]
    .map(value => value != null && value >= 0 ? value : null)
  return values.some(value => value != null) ? values : null
}

/** Provider-reported total-bet/activity ledger for the current period.
 * This is distinct from deepMetrics.totals, whose values are exposure-based
 * selection support (own back exposure + the opposing runner's lay stake). */
export function getMarketBetActivity(snapshot, { live = false, frozenPreMatchBets = null } = {}) {
  const useInPlay = live || isMatchEnded(snapshot)
  const liveValues = reportedActivityPair(snapshot?.inPlayTotalBets)
  const preValues = reportedActivityPair(frozenPreMatchBets)
    || reportedActivityPair(snapshot?.preMatchTotalBets)
  const values = (useInPlay ? liveValues : null) || preValues
  return {
    values: values || [null, null],
    total: values ? values.reduce((sum, value) => sum + (value || 0), 0) : null,
    period: useInPlay && liveValues ? 'in-play' : 'pre-match',
  }
}

/** Counts captured trade entries, not provider activity totals or unique bets. */
export function getPreMatchTradeActivity(snapshot, { startTime } = {}) {
  const start = timestamp(snapshot?.startTime) ?? timestamp(startTime)
  const names = snapshot?.teamNames
  const unavailable = reason => ({ available: false, counts: {}, total: null, reason })
  if (start == null) return unavailable('Match start time unavailable.')
  if (!Array.isArray(names) || names.length < 2) return unavailable('Selection trade history unavailable.')

  const counts = {}
  for (const name of names) {
    const trades = snapshot?.teams?.[name]?.trades
    if (!Array.isArray(trades)) return unavailable('Selection trade history unavailable.')
    let count = 0
    for (const trade of trades) {
      if (!(finiteNumber(trade?.size) > 0 && finiteNumber(trade?.price) > 1 && tradeSide(trade))) continue
      const time = tradeTimestamp(trade)
      if (time == null) return unavailable('One or more recorded trades have no valid timestamp.')
      if (time < start) count++
    }
    counts[name] = count
  }
  return { available: true, counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) }
}

const ladderArray = (...values) => values.find(Array.isArray)

function buildLiquidityBook(teamData, runner, tradedByPrice) {
  const backLevels = ladderArray(
    runner?.ex?.availableToBack, runner?.availableToBack,
    teamData?.ex?.availableToBack, teamData?.availableToBack,
  )
  const layLevels = ladderArray(
    runner?.ex?.availableToLay, runner?.availableToLay,
    teamData?.ex?.availableToLay, teamData?.availableToLay,
  )
  const tradedLevels = ladderArray(
    runner?.ex?.tradedVolume, runner?.tradedVolume,
    teamData?.ex?.tradedVolume, teamData?.tradedVolume,
  )
  const hasTopBack = finiteNumber(runner?.backSize) != null && finiteNumber(runner?.back ?? runner?.backPrice) != null
  const hasTopLay = finiteNumber(runner?.laySize) != null && finiteNumber(runner?.lay ?? runner?.layPrice) != null
  const available = Boolean(backLevels || layLevels || hasTopBack || hasTopLay)
  if (!available) return { available: false, levels: [] }

  const levels = new Map()
  const fallbackTradedByPrice = tradedLevels ? new Map() : tradedByPrice
  const add = (entry, side) => {
    const price = finiteNumber(entry?.price), size = finiteNumber(entry?.size)
    if (price == null || price <= 0 || size == null || size < 0) return
    const row = levels.get(price) || { price, back: 0, lay: 0, traded: fallbackTradedByPrice.get(price) || 0 }
    row[side] += size
    levels.set(price, row)
  }
  backLevels?.forEach(level => add(level, 'back'))
  layLevels?.forEach(level => add(level, 'lay'))
  if ((!backLevels || !backLevels.length) && hasTopBack) add({ price: runner.back ?? runner.backPrice, size: runner.backSize }, 'back')
  if ((!layLevels || !layLevels.length) && hasTopLay) add({ price: runner.lay ?? runner.layPrice, size: runner.laySize }, 'lay')

  tradedLevels?.forEach(entry => {
    const price = finiteNumber(entry?.price), size = finiteNumber(entry?.size)
    if (price == null || price <= 0 || size == null || size < 0) return
    const row = levels.get(price) || { price, back: 0, lay: 0, traded: 0 }
    row.traded = size
    levels.set(price, row)
  })
  return { available: true, levels: [...levels.values()].sort((a, b) => a.price - b.price) }
}

/** Recorded trades plus current executable exchange order-book liquidity when supplied. */
export function processTeamData(name, teamData, timeFilter = 'all', runner = null) {
  const available = Array.isArray(teamData?.trades)
  let invalid = 0
  let trades = (available ? teamData.trades : []).flatMap((t, sequence) => {
    const price = finiteNumber(t?.price), size = finiteNumber(t?.size), side = tradeSide(t)
    // Session markets use run lines rather than decimal odds (including zero).
    if (price == null || price < 0 || size == null || size < 0 || !side) { invalid++; return [] }
    return [{ price, size, side, timestamp: tradeTimestamp(t), sequence }]
  })
  const times = trades.flatMap(t => t.timestamp == null ? [] : [t.timestamp])
  const latest = times.reduce((max, time) => Math.max(max, time), -Infinity)
  const missingTimes = trades.filter(t => t.timestamp == null).length
  if (timeFilter !== 'all') {
    const cutoff = latest - (timeFilter === '1h' ? 1 : 3) * 3600000
    trades = trades.filter(t => t.timestamp != null && t.timestamp >= cutoff)
  }
  const levels = new Map()
  const latestByPrice = new Map()
  let totalBack = 0, totalLay = 0
  for (const t of trades) {
    const row = levels.get(t.price) || { price: t.price, back: 0, lay: 0, traded: 0, totalVol: 0 }
    row[t.side] += t.size
    row.traded += t.size
    row.totalVol += t.size
    levels.set(t.price, row)
    const latest = latestByPrice.get(t.price) || { price: t.price, back: 0, lay: 0, traded: 0, backFreshness: -Infinity, layFreshness: -Infinity }
    const freshness = t.timestamp ?? -t.sequence
    if (freshness > latest[`${t.side}Freshness`]) {
      latest[t.side] = t.size
      latest[`${t.side}Freshness`] = freshness
    }
    latest.traded += t.size
    latestByPrice.set(t.price, latest)
    if (t.side === 'back') totalBack += t.size
    else totalLay += t.size
  }
  const orderBook = [...levels.values()].sort((a, b) => a.price - b.price)
  const recordedLevelBook = [...latestByPrice.values()]
    .map(({ backFreshness: _backFreshness, layFreshness: _layFreshness, ...row }) => row)
    .sort((a, b) => a.price - b.price)
  const tradedByPrice = new Map(orderBook.map(row => [row.price, row.traded]))
  const liquidity = buildLiquidityBook(teamData, runner, tradedByPrice)
  const liquidityBook = liquidity.available ? liquidity.levels : recordedLevelBook
  const chronological = trades.filter(t => t.timestamp != null).sort((a, b) => a.timestamp - b.timestamp)
  const lastPrice = chronological.at(-1)?.price ?? null
  const previous = chronological.findLast(t => t.price !== lastPrice)?.price ?? lastPrice
  const known = available && (timeFilter === 'all' || missingTimes === 0 || times.length > 0)
  return {
    name, available: known, invalid, missingTimes, timeFilter,
    totalBack: known ? totalBack : null, totalLay: known ? totalLay : null,
    totalBet: known ? totalBack + totalLay : null,
    low: orderBook[0]?.price ?? null, high: orderBook.at(-1)?.price ?? null,
    lastPrice, trend: lastPrice > previous ? 'Rising' : lastPrice < previous ? 'Dropping' : 'Neutral',
    orderBook,
    liquidityBook,
    liquidityAvailable: liquidity.available || recordedLevelBook.length > 0,
    liquiditySource: liquidity.available ? 'live' : recordedLevelBook.length ? 'recorded-level' : 'unavailable',
    timeSeries: chronological.map(t => ({ time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), price: t.price, volume: t.size })),
  }
}
