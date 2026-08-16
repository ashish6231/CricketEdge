/**
 * Shared bookie P/L helpers — single source of truth for MatchDetail & TossDetail.
 *
 * Betfair bookie P/L if Team A wins:
 *   PL = BackLiab_A − LayLiab_A − BackStake_B + LayStake_B
 * (and similarly for other runners in a multi-way market, e.g. Test + Draw)
 *
 * Prefer API deepMetrics.simplePL (server-side aggregation).
 * Fall back to trade-based calc only when API value is missing.
 */

export function getTradeStats(trades = []) {
  let tBack = 0, tLay = 0, tBackLiab = 0, tLayLiab = 0
  for (const t of trades) {
    const size = t.size || 0
    const price = t.price || 0
    if (t.type === 'back') {
      tBack += size
      tBackLiab += size * (price - 1)
    } else if (t.type === 'lay') {
      tLay += size
      tLayLiab += size * (price - 1)
    }
  }
  return { tBack, tLay, tBackLiab, tLayLiab }
}

const DRAW_NAME_RE = /^(the\s+)?draw$/i

export function isDrawOutcomeName(name) {
  return DRAW_NAME_RE.test(String(name || '').trim())
}

/** Split Match Odds runners into two sides + optional Draw (Test matches). */
export function splitMatchOutcomes(teamNames = []) {
  const names = (teamNames || []).filter(Boolean)
  const drawName = names.find(isDrawOutcomeName) || null
  const mains = names.filter((n) => !isDrawOutcomeName(n))
  return {
    t1: mains[0] || names[0] || 'Team 1',
    t2: mains[1] || names[1] || 'Team 2',
    drawName,
    outcomes: [
      ...(mains[0] ? [mains[0]] : []),
      ...(mains[1] ? [mains[1]] : []),
      ...(drawName ? [drawName] : []),
    ],
  }
}

/** Bookie P/L if team1 wins / if team2 wins — from trade lists */
export function calcBookiePlFromTrades(t1Trades, t2Trades) {
  const s1 = getTradeStats(t1Trades)
  const s2 = getTradeStats(t2Trades)
  return {
    team1Win: s1.tBackLiab - s1.tLayLiab - s2.tBack + s2.tLay,
    team2Win: s2.tBackLiab - s2.tLayLiab - s1.tBack + s1.tLay,
    s1, s2,
  }
}

/** Multi-runner bookie P/L (2-way or 3-way with Draw). */
export function calcBookiePlMulti(tradeMap = {}) {
  const names = Object.keys(tradeMap)
  const stats = Object.fromEntries(names.map((n) => [n, getTradeStats(tradeMap[n] || [])]))
  const byName = {}
  for (const winner of names) {
    let pl = 0
    for (const name of names) {
      const s = stats[name]
      if (name === winner) pl += s.tBackLiab - s.tLayLiab
      else pl += -s.tBack + s.tLay
    }
    byName[winner] = pl
  }
  return byName
}

/** Filter trades by time window (same logic as MatchDetail processTeamData) */
export function filterTradesByTime(trades = [], timeFilter = 'all') {
  if (timeFilter === 'all' || !trades.length) return trades
  const hours = timeFilter === '1h' ? 1 : 3
  const maxTime = Math.max(...trades.map(t => t.updatedAt || 0))
  const cutoff = maxTime - hours * 60 * 60 * 1000
  return trades.filter(t => (t.updatedAt || 0) >= cutoff)
}

/**
 * @returns {{ pl1, pl2, plDraw, source: 'api' | 'trades', byName }}
 */
export function getBookiePl(snap, t1, t2, drawName = null) {
  const sp = snap?.deepMetrics?.simplePL || {}
  const t1Data = snap?.teams?.[t1] || {}
  const t2Data = snap?.teams?.[t2] || {}
  const drawData = drawName ? (snap?.teams?.[drawName] || {}) : null

  const apiPl1 = sp.team1_win ?? t1Data.pnlIfWins
  const apiPl2 = sp.team2_win ?? t2Data.pnlIfWins
  const apiPlDraw = drawName
    ? (sp.draw_win ?? sp.team3_win ?? drawData?.pnlIfWins ?? null)
    : null

  if (apiPl1 != null && apiPl2 != null && (!drawName || apiPlDraw != null)) {
    return {
      pl1: apiPl1,
      pl2: apiPl2,
      plDraw: apiPlDraw,
      source: 'api',
      byName: {
        [t1]: apiPl1,
        [t2]: apiPl2,
        ...(drawName ? { [drawName]: apiPlDraw } : {}),
      },
    }
  }

  const tradeMap = {
    [t1]: t1Data.trades || [],
    [t2]: t2Data.trades || [],
  }
  if (drawName) tradeMap[drawName] = drawData?.trades || []

  const byName = calcBookiePlMulti(tradeMap)
  return {
    pl1: apiPl1 ?? byName[t1] ?? null,
    pl2: apiPl2 ?? byName[t2] ?? null,
    plDraw: drawName ? (apiPlDraw ?? byName[drawName] ?? null) : null,
    source: 'trades',
    byName,
  }
}

/** advancedMetricsV2 preferred; falls back to advancedMetrics */
export function getTeamMetrics(snap, teamIdx) {
  const key = teamIdx === 0 ? 'team1' : 'team2'
  const v2 = snap?.advancedMetricsV2?.[key] || {}
  const v1 = snap?.advancedMetrics?.[key] || {}
  return {
    back: v2.back ?? v1.back ?? 0,
    lay: v2.lay ?? v1.lay ?? 0,
    totalBet: v2.totalBet ?? v1.totalVolume ?? 0,
    backPercentage: v1.backPercentage ?? 50,
  }
}

export default getBookiePl
