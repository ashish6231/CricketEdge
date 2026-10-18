/** Session market parsing + bookie P/L metrics (shared by SessionDetail & MatchDetail) */

export function parseSession(name) {
  const inningMatch = name.match(/(\d+)(st|nd|rd|th)\s+innings/i)
  const overMatch = name.match(/(\d+)\s+overs?\s+line/i)
  const isRunsLine = /runs\s+line/i.test(name)
  const over = overMatch ? parseInt(overMatch[1]) : (isRunsLine ? 999 : 0)
  return {
    inning: inningMatch ? parseInt(inningMatch[1]) : 1,
    over,
    isRunsLine,
    label: isRunsLine ? 'Total Runs Line' : overMatch ? `${over} Overs Line` : name,
  }
}

export function normalizeMarketName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Session trades use `team` as the market identifier — exact market name only */
export function tradeMatchesMarket(trade, marketName) {
  if (!trade || !marketName) return false
  const target = normalizeMarketName(marketName)
  return normalizeMarketName(trade.team || trade.marketName || trade.market) === target
}

function finiteNumber(value) {
  if (value == null || !['number', 'string'].includes(typeof value) || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function sessionSide(trade) {
  const side = String(trade?.type || trade?.side || '').trim().toLowerCase()
  if (side === 'back' || side === 'b' || side === 'yes') return 'yes'
  if (side === 'lay' || side === 'l' || side === 'no') return 'no'
  return null
}

function validSessionTrade(trade) {
  const price = finiteNumber(trade?.price)
  const size = finiteNumber(trade?.size)
  const count = trade?.tradeCount == null ? 1 : finiteNumber(trade.tradeCount)
  return price != null && price >= 0 && size != null && size >= 0 && sessionSide(trade) != null
    && Number.isSafeInteger(count) && count > 0
}

export function buildLinesFromTrades(trades) {
  if (!Array.isArray(trades)) return []
  const lineMap = new Map()
  for (const trade of trades) {
    if (!validSessionTrade(trade)) continue
    const price = Number(trade.price), size = Number(trade.size), side = sessionSide(trade)
    if (!lineMap.has(price)) {
      lineMap.set(price, { price, yes: 0, no: 0, yesBets: 0, noBets: 0, totalVol: 0, betCount: 0 })
    }
    const line = lineMap.get(price)
    const count = trade.tradeCount == null ? 1 : Number(trade.tradeCount)
    line[side] += size
    line[`${side}Bets`] += count
    line.totalVol += size
    line.betCount += count
  }
  return [...lineMap.values()].sort((a, b) => a.price - b.price)
}

const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100

/** Existing feed convention: YES wins above its run line; NO wins at/below it.
 * Every matched stake is settled once at the requested score, including lines
 * on either side of that score. These are net even-money stakes, not decimal odds.
 */
export function settleSessionLines(lines, score) {
  if (!Array.isArray(lines) || !Number.isSafeInteger(score) || score < 0) return null
  const rows = []
  for (const line of lines) {
    const price = finiteNumber(line?.price), yes = finiteNumber(line?.yes), no = finiteNumber(line?.no)
    if (price == null || price < 0 || yes == null || yes < 0 || no == null || no < 0) return null
    const yesWins = score > price
    const yesPl = yesWins ? -yes : yes
    const noPl = yesWins ? no : -no
    rows.push({ price, yes, no, yesWins, yesPl, noPl,
      receives: yesWins ? no : yes, pays: yesWins ? yes : no, pl: yesPl + noPl })
  }
  return rows
}

export function calcSessionPlBreakdown(lines, score) {
  const rows = settleSessionLines(lines, score)
  if (!rows) return { receives: null, pays: null, pl: null }
  const receives = rows.reduce((sum, row) => sum + row.receives, 0)
  const pays = rows.reduce((sum, row) => sum + row.pays, 0)
  return { receives: roundMoney(receives), pays: roundMoney(pays), pl: roundMoney(receives - pays) }
}

export function calcSessionPlAtScore(lines, score) {
  return calcSessionPlBreakdown(lines, score).pl
}

/** Full outcome domain: 0 through the last threshold, plus a constant upper tail.
 * All scores >= the final row have identical settlement; no higher lines remain.
 */
export function computePlRows(lines, opts = {}) {
  if (!lines?.length || !settleSessionLines(lines, 0)) return []
  const prices = lines.map(line => Number(line.price))
  for (const boundary of [opts.bestYes, opts.bestNo]) {
    const value = finiteNumber(boundary)
    if (value != null && value >= 0) prices.push(value)
  }
  let minScore = 0
  let maxScore = Math.floor(Math.max(...prices)) + 1
  if (!Number.isSafeInteger(maxScore)) return []
  if (!opts.full) {
    const center = finiteNumber(opts.marketMid ?? opts.predicted)
    if (center != null) {
      const pad = opts.over && opts.over !== 999 ? 11 : Math.max(6, Math.abs((opts.bestNo ?? center) - (opts.bestYes ?? center)))
      minScore = Math.max(0, Math.floor(center - pad))
      maxScore = Math.min(maxScore, Math.ceil(center + pad))
    }
  }
  const rows = []
  for (let score = minScore; score <= maxScore; score++) {
    rows.push({ score, pl: calcSessionPlAtScore(lines, score) })
  }
  return rows
}

export function sessionPlRanges(rows) {
  const ranges = []
  for (const row of rows) {
    const outcome = row.pl > 0 ? 'profit' : row.pl < 0 ? 'loss' : 'break-even'
    const previous = ranges.at(-1)
    if (previous && previous.outcome === outcome && previous.to + 1 === row.score) previous.to = row.score
    else ranges.push({ from: row.score, to: row.score, outcome })
  }
  if (ranges.length) ranges.at(-1).to = null // Unbounded upper tail.
  return ranges
}

export function formatVolStr(val) {
  if (val === null || val === undefined || val === 0 || val === '0') return '0.00'
  const num = Number(val)
  if (Number.isNaN(num)) return String(val)
  const abs = Math.abs(num)
  if (abs >= 10000000) return `${num < 0 ? '-' : ''}${(abs / 10000000).toFixed(2)}Cr`
  if (abs >= 100000) return `${num < 0 ? '-' : ''}${(abs / 100000).toFixed(2)}L`
  if (abs >= 1000) return `${num < 0 ? '-' : ''}${(abs / 1000).toFixed(2)}k`
  return num.toFixed(2)
}

export function fmtRs(n) {
  if (n === null || n === undefined) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}€${formatVolStr(n)}`
}

const LIQUIDITY = {
  high:   { label: 'Tight Spread', emoji: '🟢', textClass: 'text-[#22c55e]', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)' },
  medium: { label: 'Moderate Gap', emoji: '🟡', textClass: 'text-[#eab308]', bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.3)' },
  low:    { label: 'Wide Gap', emoji: '🔴', textClass: 'text-[#ef4444]', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
  unknown:{ label: 'No Gap Data', emoji: '⚪', textClass: 'text-[#8e8e93]', bg: 'rgba(142,142,147,0.12)', border: 'rgba(142,142,147,0.3)' },
}

export function getLiquidity(gap) {
  if (gap == null) return LIQUIDITY.unknown
  if (gap < 20) return LIQUIDITY.high
  if (gap < 50) return LIQUIDITY.medium
  return LIQUIDITY.low
}

/** Full metrics for one session market — trades filtered strictly per marketName */
export function computeSessionMetrics(oddsItem, trades = [], marketSummary = null) {
  const parsed = parseSession(oddsItem.marketName)
  const marketTrades = trades.filter(t => tradeMatchesMarket(t, oddsItem.marketName))
  const invalidTradeCount = marketTrades.filter(trade => !validSessionTrade(trade)).length
  const lines = buildLinesFromTrades(marketTrades)
  const canCalculatePl = lines.length > 0 && invalidTradeCount === 0

  const oddsYes = finiteNumber(oddsItem.bestYes)
  const oddsNo = finiteNumber(oddsItem.bestNo)
  let bestYes = oddsYes != null && oddsYes > 0 ? oddsYes : null
  let bestNo = oddsNo != null && oddsNo > 0 ? oddsNo : null

  if (bestYes == null && lines.length) {
    bestYes = lines.reduce((best, l) => (l.yes > 0 && (best == null || l.price > best) ? l.price : best), null)
  }
  if (bestNo == null && lines.length) {
    bestNo = lines.reduce((best, l) => (l.no > 0 && (best == null || l.price < best) ? l.price : best), null)
  }

  // This is a quote midpoint, not a score prediction.
  const marketMid = bestYes != null && bestNo != null
    ? Math.round((bestYes + bestNo) / 2 * 2) / 2
    : bestYes ?? bestNo ?? null
  // A quote midpoint or profitable outcome is not a run prediction.
  const predicted = null

  const gap = bestYes != null && bestNo != null ? bestNo - bestYes : null
  const plRowsFull = canCalculatePl ? computePlRows(lines, { full: true, bestYes, bestNo }) : []
  const plRows = canCalculatePl
    ? computePlRows(lines, { bestYes, bestNo, marketMid, over: parsed.over })
    : []
  const bestPlRow = plRowsFull.length
    ? plRowsFull.reduce((best, r) => (r.pl > best.pl ? r : best), plRowsFull[0])
    : null
  const totalVol = lines.reduce((s, l) => s + l.totalVol, 0)
  const tradeCount = lines.reduce((sum, line) => sum + line.betCount, 0)
  const providerVolume = finiteNumber(
    marketSummary?.totalVolume ?? marketSummary?.totalMatched ?? marketSummary?.matched ?? marketSummary?.volume,
  )
  const providerTradeCount = finiteNumber(
    marketSummary?.tradeCount ?? marketSummary?.tradesCount ?? marketSummary?.betCount,
  )
  const volumeMatches = providerVolume == null || Math.abs(totalVol - providerVolume) <= Math.max(0.02, Math.abs(providerVolume) * 1e-8)
  const countMatches = providerTradeCount == null || tradeCount === providerTradeCount
  const hasProviderTotals = providerVolume != null || providerTradeCount != null
  const hasCompleteProviderTotals = providerVolume != null && providerTradeCount != null
  const ledgerStatus = invalidTradeCount > 0
    ? 'invalid'
    : !lines.length
    ? 'quotes-only'
    : hasCompleteProviderTotals && volumeMatches && countMatches
      ? 'verified'
      : hasProviderTotals && (!volumeMatches || !countMatches)
        ? 'syncing'
        : 'calculated'
  const liquidity = getLiquidity(gap)

  return {
    ...parsed,
    marketName: oddsItem.marketName,
    bestYes,
    bestNo,
    marketMid,
    predicted,
    gap,
    liquidity,
    lines,
    plRows,
    plRowsFull,
    bestPlRow,
    plRanges: sessionPlRanges(plRowsFull),
    invalidTradeCount,
    canCalculatePl,
    hasTrades: lines.length > 0,
    tradeCount,
    totalVol,
    providerVolume,
    providerTradeCount,
    ledgerStatus,
    volumeChart: lines.map(l => ({
      price: l.price,
      yes: l.yes,
      no: l.no,
      yesBets: l.yesBets,
      noBets: l.noBets,
      totalVol: l.totalVol,
    })),
  }
}

export function mergeOddsAndTrades(odds = [], trades = [], markets = []) {
  const names = new Map()
  const remember = (name) => {
    const normalized = normalizeMarketName(name)
    if (normalized && !names.has(normalized)) names.set(normalized, String(name).trim())
  }
  odds?.forEach(o => remember(o?.marketName))
  markets?.forEach(m => remember(m?.marketName || m?.name || m?.team))
  trades?.forEach(t => remember(t?.team || t?.marketName || t?.market))
  const oddsMap = new Map((odds || []).map(o => [normalizeMarketName(o?.marketName), o]))
  return [...names].map(([normalized, name]) => oddsMap.get(normalized) || { marketName: name, bestYes: null, bestNo: null })
}

export function buildAllSessions(odds = [], trades = [], markets = []) {
  const merged = mergeOddsAndTrades(odds, trades, markets)
  const marketMap = new Map((markets || []).map(m => [
    normalizeMarketName(m?.marketName || m?.name || m?.team),
    m,
  ]))
  return merged
    .map(o => computeSessionMetrics(o, trades, marketMap.get(normalizeMarketName(o.marketName)) || null))
    .sort((a, b) => a.inning - b.inning || a.over - b.over)
}

/** Exact calculation inputs: corrections can change P/L without changing row
 * count, total volume, or the last timestamp. Never discard those updates.
 */
export function sessionDataFingerprint(data) {
  if (!data) return ''
  return JSON.stringify([data.trades || [], data.odds || [], data.markets || []])
}
