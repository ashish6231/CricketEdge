/**
 * Shared bookie P/L helpers — single source of truth for MatchDetail & TossDetail.
 *
 * Betfair bookie P/L if Team A wins:
 *   PL = BackLiab_A − LayLiab_A − BackStake_B + LayStake_B
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

/**
 * Best available P/L for UI — API first, then trade calc.
 * @returns {{ pl1, pl2, source: 'api' | 'trades' }}
 */
export function getBookiePl(snap, t1, t2) {
  const sp = snap?.deepMetrics?.simplePL || {}
  const t1Data = snap?.teams?.[t1] || {}
  const t2Data = snap?.teams?.[t2] || {}

  const apiPl1 = sp.team1_win ?? t1Data.pnlIfWins
  const apiPl2 = sp.team2_win ?? t2Data.pnlIfWins

  if (apiPl1 != null && apiPl2 != null) {
    return { pl1: apiPl1, pl2: apiPl2, source: 'api' }
  }

  const t1Trades = t1Data.trades || []
  const t2Trades = t2Data.trades || []
  const calc = calcBookiePlFromTrades(t1Trades, t2Trades)
  return {
    pl1: apiPl1 ?? calc.team1Win,
    pl2: apiPl2 ?? calc.team2Win,
    source: 'trades',
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
