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
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Session trades use `team` as the market identifier — exact market name only */
export function tradeMatchesMarket(trade, marketName) {
  if (!trade || !marketName) return false
  const target = normalizeMarketName(marketName)
  return [trade.team, trade.marketName, trade.market]
    .filter(Boolean)
    .some(c => normalizeMarketName(c) === target)
}

function finiteNumber(value) {
  if (value == null || value === '' || !['number', 'string'].includes(typeof value)) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function sessionSide(trade) {
  const side = String(trade?.type || trade?.side || '').trim().toLowerCase()
  if (side === 'back' || side === 'b' || side === 'yes') return 'yes'
  if (side === 'lay' || side === 'l' || side === 'no') return 'no'
  return null
}

export function buildLinesFromTrades(trades) {
  if (!trades?.length) return []
  const lineMap = new Map()
  trades.forEach(t => {
    const price = finiteNumber(t?.price)
    const size = finiteNumber(t?.size)
    const side = sessionSide(t)
    if (price == null || price < 0 || size == null || size <= 0 || !side) return

    if (!lineMap.has(price)) {
      lineMap.set(price, { price, yes: 0, no: 0, yesBets: 0, noBets: 0, totalVol: 0, betCount: 0 })
    }
    const line = lineMap.get(price)
    const count = Math.max(1, Math.trunc(finiteNumber(t?.tradeCount) || 1))
    line[side] += size
    line[`${side}Bets`] += count
    line.totalVol += size
    line.betCount += count
  })
  return [...lineMap.values()].sort((a, b) => a.price - b.price)
}

/**
 * Bookie ledger for an integer settlement score.
 * Customer YES/back wins above the line, so that stake is a bookie loss.
 * Customer NO/lay wins at/below the line, so that stake is a bookie loss.
 */
export function calcSessionPlBreakdown(lines, score) {
  const result = lines.reduce((acc, line) => {
    const price = finiteNumber(line?.price)
    if (price == null) return acc
    const yes = finiteNumber(line?.yes) || 0
    const no = finiteNumber(line?.no) || 0
    if (score > price) {
      // YES customers win; NO customers lose.
      acc.pays += yes
      acc.receives += no
    } else {
      // NO customers win; YES customers lose.
      acc.pays += no
      acc.receives += yes
    }
    return acc
  }, { receives: 0, pays: 0 })
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100
  return {
    receives: round(result.receives),
    pays: round(result.pays),
    pl: round(result.receives - result.pays),
  }
}

export function calcSessionPlAtScore(lines, score) {
  return calcSessionPlBreakdown(lines, score).pl
}

/** P/L at every run score. `full: true` = saari runs (min–max line prices), else chart window */
export function computePlRows(lines, opts = {}) {
  if (!lines.length) return []

  const prices = lines.map(l => finiteNumber(l.price)).filter(v => v != null)
  if (!prices.length) return []
  for (const boundary of [opts.bestYes, opts.bestNo]) {
    const value = finiteNumber(boundary)
    if (value != null) prices.push(value)
  }
  let minScore = Math.max(0, Math.floor(Math.min(...prices)) - 1)
  let maxScore = Math.ceil(Math.max(...prices)) + 1

  if (!opts.full) {
    const { bestYes, bestNo, predicted, over } = opts
    const center = predicted ?? (bestYes != null && bestNo != null ? (bestYes + bestNo) / 2 : null)

    if (center != null && bestYes != null && bestNo != null) {
      const pad = Math.max(6, Math.ceil((bestNo - bestYes) * 0.6))
      minScore = Math.floor(Math.min(bestYes, center) - pad)
      maxScore = Math.ceil(Math.max(bestNo, center) + pad)
    }

    if (over && over !== 999 && center != null) {
      const maxSpan = 22
      if (maxScore - minScore > maxSpan) {
        minScore = Math.floor(center - maxSpan / 2)
        maxScore = Math.ceil(center + maxSpan / 2)
      }
    }
  }

  const rows = []
  for (let s = minScore; s <= maxScore; s++) {
    rows.push({ score: s, pl: calcSessionPlAtScore(lines, s) })
  }
  return rows
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
  const lines = buildLinesFromTrades(marketTrades)

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
  // Backwards-compatible field for older consumers. UI must call it Market Mid.
  const predicted = marketMid

  const gap = bestYes != null && bestNo != null ? bestNo - bestYes : null
  const plRowsFull = lines.length ? computePlRows(lines, { full: true, bestYes, bestNo }) : []
  const plRows = lines.length
    ? computePlRows(lines, { bestYes, bestNo, predicted: marketMid, over: parsed.over })
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
  const ledgerStatus = !lines.length
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

/** Cheap fingerprint — skip React state updates when poll returns same data */
export function sessionDataFingerprint(data) {
  if (!data) return ''
  const trades = data.trades || []
  const odds = data.odds || []
  let fp = `t${trades.length}`
  if (trades.length) {
    const last = trades[trades.length - 1]
    const vol = trades.reduce((s, t) => s + (parseFloat(t.size) || 0), 0)
    fp += `:${last?.updatedAt || 0}:${vol.toFixed(0)}`
  }
  fp += `|o${odds.length}`
  if (odds.length) {
    fp += ':' + odds.map(o => `${o.marketName}:${o.bestYes}:${o.bestNo}`).join(';')
  }
  const markets = Array.isArray(data.markets) ? data.markets : Object.values(data.markets || {})
  fp += `|m${markets.length}`
  if (markets.length) {
    fp += ':' + markets.map(m => `${m.marketName || m.name}:${m.tradeCount}:${m.totalVolume ?? m.totalMatched}`).join(';')
  }
  return fp
}
