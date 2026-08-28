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

export function buildLinesFromTrades(trades) {
  if (!trades?.length) return []
  const lineMap = {}
  trades.forEach(t => {
    const p = t.price
    if (!lineMap[p]) lineMap[p] = { price: p, yes: 0, no: 0, totalVol: 0 }
    if (t.type === 'back') lineMap[p].yes += t.size
    else lineMap[p].no += t.size
    lineMap[p].totalVol = lineMap[p].yes + lineMap[p].no
  })
  return Object.values(lineMap).sort((a, b) => a.price - b.price)
}

function calcPlAtScore(lines, score) {
  return lines.reduce((acc, l) => (
    score > l.price ? acc - l.yes + l.no : acc + l.yes - l.no
  ), 0)
}

/** P/L at every run score. `full: true` = saari runs (min–max line prices), else chart window */
export function computePlRows(lines, opts = {}) {
  if (!lines.length) return []

  const prices = lines.map(l => l.price)
  let minScore = Math.floor(Math.min(...prices)) - 1
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
    rows.push({ score: s, pl: calcPlAtScore(lines, s) })
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
  return `${sign}₹${formatVolStr(n)}`
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

/**
 * Yes/No session pick from market lines + predicted runs.
 * Yes @ yesLine = score yesLine+ jayega | No @ noLine = score noLine se neeche rahega
 */
export function computeSessionPick({ bestYes, bestNo, predicted, gap, lines = [], bestPlRow }) {
  if (predicted == null) return null

  const yesLine = bestYes
  const noLine = bestNo
  const base = {
    predictedRuns: predicted,
    yesLine,
    noLine,
    gap,
  }

  if (yesLine == null && noLine == null) return { ...base, pick: null, reason: 'Line data nahi' }

  let pick = null
  let betLine = null
  let reason = ''
  let strength = 'medium'

  if (yesLine != null && noLine != null) {
    if (predicted >= noLine) {
      pick = 'YES'
      betLine = yesLine
      strength = predicted >= noLine + 1 ? 'high' : 'medium'
      reason = `~${predicted} runs — ${yesLine} Yes (score ${yesLine}+ expected)`
    } else if (predicted <= yesLine) {
      pick = 'NO'
      betLine = noLine
      strength = predicted <= yesLine - 1 ? 'high' : 'medium'
      reason = `~${predicted} runs — ${noLine} No (score ${noLine} se neeche)`
    } else {
      const yesDist = predicted - yesLine
      const noDist = noLine - predicted
      if (yesDist >= noDist) {
        pick = 'YES'
        betLine = yesLine
        reason = `~${predicted} runs gap mein — ${yesLine} Yes lean (+${yesDist.toFixed(1)} margin)`
      } else {
        pick = 'NO'
        betLine = noLine
        reason = `~${predicted} runs gap mein — ${noLine} No lean (+${noDist.toFixed(1)} margin)`
      }
      strength = gap != null && gap <= 20 ? 'low' : 'medium'
    }
  } else if (yesLine != null) {
    pick = predicted >= yesLine ? 'YES' : 'NO'
    betLine = yesLine
    reason = pick === 'YES'
      ? `~${predicted} runs — ${yesLine}+ expected`
      : `~${predicted} runs — ${yesLine} se neeche`
  } else {
    pick = predicted < noLine ? 'NO' : 'YES'
    betLine = noLine
    reason = pick === 'NO'
      ? `~${predicted} runs — ${noLine} se neeche`
      : `~${predicted} runs — ${noLine}+ expected`
  }

  // Volume tilt at nearest line to predicted
  let volNote = null
  if (lines.length) {
    const nearest = lines.reduce((best, l) => (
      Math.abs(l.price - predicted) < Math.abs(best.price - predicted) ? l : best
    ), lines[0])
    if (nearest.yes + nearest.no > 0) {
      const yesPct = (nearest.yes / (nearest.yes + nearest.no)) * 100
      if (yesPct >= 65) volNote = `${nearest.price} line par ${yesPct.toFixed(0)}% Yes vol`
      else if (yesPct <= 35) volNote = `${nearest.price} line par ${(100 - yesPct).toFixed(0)}% No vol`
    }
  }

  return {
    ...base,
    pick,
    betLine,
    reason,
    strength,
    volNote,
    oppositeLine: pick === 'YES' ? noLine : yesLine,
    bookieSweetSpot: bestPlRow?.score ?? null,
  }
}

/** Full metrics for one session market — trades filtered strictly per marketName */
export function computeSessionMetrics(oddsItem, trades = []) {
  const parsed = parseSession(oddsItem.marketName)
  const marketTrades = trades.filter(t => tradeMatchesMarket(t, oddsItem.marketName))
  const lines = buildLinesFromTrades(marketTrades)

  let bestYes = oddsItem.bestYes > 0 ? oddsItem.bestYes : null
  let bestNo = oddsItem.bestNo > 0 ? oddsItem.bestNo : null

  if (bestYes == null && lines.length) {
    bestYes = lines.reduce((best, l) => (l.yes > 0 && (best == null || l.price > best) ? l.price : best), null)
  }
  if (bestNo == null && lines.length) {
    bestNo = lines.reduce((best, l) => (l.no > 0 && (best == null || l.price < best) ? l.price : best), null)
  }

  const predicted = bestYes != null && bestNo != null
    ? Math.round((bestYes + bestNo) / 2 * 2) / 2
    : bestYes ?? bestNo ?? null

  const gap = bestYes != null && bestNo != null ? bestNo - bestYes : null
  const plRowsFull = lines.length ? computePlRows(lines, { full: true }) : []
  const plRows = lines.length
    ? computePlRows(lines, { bestYes, bestNo, predicted, over: parsed.over })
    : []
  const bestPlRow = plRowsFull.length
    ? plRowsFull.reduce((best, r) => (r.pl > best.pl ? r : best), plRowsFull[0])
    : null
  const totalVol = lines.reduce((s, l) => s + l.totalVol, 0)
  const liquidity = getLiquidity(gap)

  const sessionPick = computeSessionPick({
    bestYes, bestNo, predicted, gap, lines, bestPlRow, totalVol,
  })

  return {
    ...parsed,
    marketName: oddsItem.marketName,
    bestYes,
    bestNo,
    predicted,
    gap,
    liquidity,
    sessionPick,
    lines,
    plRows,
    plRowsFull,
    bestPlRow,
    hasTrades: lines.length > 0,
    tradeCount: marketTrades.length,
    totalVol,
    volumeChart: lines.map(l => ({ price: l.price, yes: l.yes, no: l.no, totalVol: l.totalVol })),
  }
}

export function mergeOddsAndTrades(odds = [], trades = []) {
  const names = new Set()
  odds?.forEach(o => o.marketName && names.add(o.marketName))
  trades?.forEach(t => t.team && names.add(t.team))
  const oddsMap = Object.fromEntries((odds || []).map(o => [o.marketName, o]))
  return [...names].map(name => oddsMap[name] || { marketName: name, bestYes: null, bestNo: null })
}

export function buildAllSessions(odds = [], trades = []) {
  const merged = mergeOddsAndTrades(odds, trades)
  return merged
    .map(o => computeSessionMetrics(o, trades))
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
  return fp
}
