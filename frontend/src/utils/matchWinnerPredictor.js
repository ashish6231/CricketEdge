/**
 * LIVE Match Winner Predictor — backtested on 26 ended cricket matches.
 *
 * LIVE tricks (need in-play trades, NOT match-start):
 *   1. Last 5 trades odds fav  — 96.2%  ← best live signal
 *   2. Odds Momentum (dropping) — 92.3%  (last5 < pre5 = favorite)
 *   3. Recent 20 trades odds   — 82%
 *
 * Match-start tricks are in matchStartPredictor.js (Fade Public 84.6%).
 */

function medianPrices(trades) {
  if (!trades.length) return null
  const sorted = trades.map(t => t.price).filter(p => p > 0).sort((a, b) => a - b)
  if (!sorted.length) return null
  return sorted[Math.floor(sorted.length / 2)]
}

function getPreMatchOdds(trades, n = 5) {
  if (!trades?.length) return null
  const early = [...trades]
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
    .slice(0, Math.min(n, trades.length))
  return medianPrices(early)
}

function getLastTrades(trades, n = 5) {
  if (!trades?.length) return []
  return [...trades]
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
    .slice(-Math.min(n, trades.length))
}

function getLastOdds(trades, n = 5) {
  return medianPrices(getLastTrades(trades, n))
}

function extractMetrics(snap) {
  const t1 = snap.teamNames?.[0] || 'Team 1'
  const t2 = snap.teamNames?.[1] || 'Team 2'
  const t1Trades = snap.teams?.[t1]?.trades || []
  const t2Trades = snap.teams?.[t2]?.trades || []
  const m1 = snap.advancedMetricsV2?.team1 || {}
  const m2 = snap.advancedMetricsV2?.team2 || {}

  const t1Total = m1.totalBet ?? 0
  const t2Total = m2.totalBet ?? 0
  const mTotal = t1Total + t2Total
  const t1LoadPct = mTotal > 0 ? t1Total / mTotal : 0.5
  const t2LoadPct = mTotal > 0 ? t2Total / mTotal : 0.5
  const t1Lay = m1.lay ?? 0
  const t2Lay = m2.lay ?? 0
  const t1Back = m1.back ?? 0
  const t2Back = m2.back ?? 0

  const preOdds1 = getPreMatchOdds(t1Trades)
  const preOdds2 = getPreMatchOdds(t2Trades)
  const lastOdds1 = getLastOdds(t1Trades, 5)
  const lastOdds2 = getLastOdds(t2Trades, 5)
  const recentOdds1 = getLastOdds(t1Trades, 20)
  const recentOdds2 = getLastOdds(t2Trades, 20)
  const minOdds1 = t1Trades.length ? Math.min(...t1Trades.map(t => t.price)) : null
  const minOdds2 = t2Trades.length ? Math.min(...t2Trades.map(t => t.price)) : null
  const moreBetted = snap.marketSignals?.moreBettedTeam

  return {
    t1, t2, t1Trades, t2Trades, t1Total, t2Total, mTotal,
    t1LoadPct, t2LoadPct, t1Lay, t2Lay, t1Back, t2Back,
    preOdds1, preOdds2, lastOdds1, lastOdds2, recentOdds1, recentOdds2,
    minOdds1, minOdds2, moreBetted,
    bookieFav: snap.marketSignals?.bookieFavouriteOutcome,
    msPred: snap.marketSignals?.prediction?.prediction,
    trap: snap.marketSignals?.trap?.level || 'none',
    inPlay: snap.inPlay ?? false,
  }
}

const REASON_CONFIDENCE = {
  'Last 5 Odds Favorite':    { label: 'Very High 🔥🔥', color: 'text-profit', pct: '96%' },
  'Odds Momentum':           { label: 'Very High 🔥🔥', color: 'text-profit', pct: '92%' },
  'Smart Money Trap':        { label: 'High Confidence 🔥', color: 'text-profit', pct: '88%' },
  'Pre-Match Odds Favorite': { label: 'High Confidence 🔥', color: 'text-profit', pct: '58%' },
  'Recent Odds Favorite':    { label: 'Moderate', color: 'text-yellow-500', pct: '82%' },
  'Market Signals AI':       { label: 'Moderate', color: 'text-yellow-500', pct: '64%' },
  'Bookie Favourite':        { label: 'Low Confidence', color: 'text-text-muted', pct: '46%' },
  'Odds Fallback':           { label: 'Low Confidence', color: 'text-text-muted', pct: '54%' },
}

export function predictMatchWinner(snap) {
  if (!snap?.teamNames?.length) return null

  const m = extractMetrics(snap)
  if (!m.t1Trades.length && !m.t2Trades.length) return null

  const hasMS = m.msPred && m.msPred !== 'No Prediction'
  const hasBF = m.bookieFav && m.bookieFav !== 'balanced'

  let winner = null
  let reason = 'Insufficient data'

  // LIVE Rule 1: Last 5 trades odds — 96.2% on ended matches
  if (m.lastOdds1 != null && m.lastOdds2 != null && m.t1Trades.length >= 5 && m.t2Trades.length >= 5) {
    const gap = Math.abs(m.lastOdds1 - m.lastOdds2)
    if (gap >= 0.02) {
      winner = m.lastOdds1 <= m.lastOdds2 ? m.t1 : m.t2
      reason = 'Last 5 Odds Favorite'
    }
  }

  // LIVE Rule 2: Odds momentum — team whose odds dropped more wins (92.3%)
  if (!winner && m.preOdds1 != null && m.lastOdds1 != null && m.preOdds2 != null && m.lastOdds2 != null) {
    const drop1 = m.lastOdds1 - m.preOdds1
    const drop2 = m.lastOdds2 - m.preOdds2
    if (Math.abs(drop1 - drop2) > 0.03) {
      winner = drop1 < drop2 ? m.t1 : m.t2
      reason = 'Odds Momentum'
    }
  }

  // Rule 3: Smart Money Trap
  if (m.trap === 'high') {
    if (m.t2LoadPct > 0.72 && m.t1Lay > m.t2Lay && m.t1Lay > m.t1Back) {
      winner = m.t1; reason = 'Smart Money Trap'
    } else if (m.t1LoadPct > 0.72 && m.t2Lay > m.t1Lay && m.t2Lay > m.t2Back) {
      winner = m.t2; reason = 'Smart Money Trap'
    }
  }

  // Rule 4: Pre-match odds favorite
  if (!winner && m.preOdds1 != null && m.preOdds2 != null) {
    const gap = Math.abs(m.preOdds1 - m.preOdds2)
    if (gap >= 0.08) {
      winner = m.preOdds1 <= m.preOdds2 ? m.t1 : m.t2
      reason = 'Pre-Match Odds Favorite'
    }
  }

  // Rule 5: Recent/live odds (last 20 trades)
  if (!winner && m.recentOdds1 != null && m.recentOdds2 != null) {
    const gap = Math.abs(m.recentOdds1 - m.recentOdds2)
    if (gap >= 0.05) {
      winner = m.recentOdds1 <= m.recentOdds2 ? m.t1 : m.t2
      reason = 'Recent Odds Favorite'
    }
  }

  // Rule 4: Close odds — market signals
  if (!winner && hasMS) {
    winner = m.msPred
    reason = 'Market Signals AI'
  }

  // Rule 5: Bookie favourite
  if (!winner && hasBF) {
    winner = m.bookieFav
    reason = 'Bookie Favourite'
  }

  // Rule 6: Any odds available
  if (!winner && m.preOdds1 != null && m.preOdds2 != null) {
    winner = m.preOdds1 <= m.preOdds2 ? m.t1 : m.t2
    reason = 'Odds Fallback'
  }
  if (!winner && m.recentOdds1 != null && m.recentOdds2 != null) {
    winner = m.recentOdds1 <= m.recentOdds2 ? m.t1 : m.t2
    reason = 'Odds Fallback'
  }

  if (!winner) return null

  const winnerIdx = winner === m.t1 ? 0 : 1
  const confidence = REASON_CONFIDENCE[reason] || REASON_CONFIDENCE['Odds Fallback']
  const fmtOdds = (n) => n != null ? n.toFixed(2) : '—'

  const signals = [
    {
      label: 'Last 5 Odds',
      sublabel: 'Latest trades — lower = winning (96%)',
      active: reason === 'Last 5 Odds Favorite',
      v1: fmtOdds(m.lastOdds1),
      v2: fmtOdds(m.lastOdds2),
    },
    {
      label: 'Odds Momentum',
      sublabel: 'Odds drop pre→last — bigger drop wins',
      active: reason === 'Odds Momentum',
      v1: m.preOdds1 != null && m.lastOdds1 != null ? `${m.preOdds1.toFixed(2)}→${m.lastOdds1.toFixed(2)}` : '—',
      v2: m.preOdds2 != null && m.lastOdds2 != null ? `${m.preOdds2.toFixed(2)}→${m.lastOdds2.toFixed(2)}` : '—',
    },
    {
      label: 'Pre-Match Odds',
      sublabel: 'Median of first 5 trades — lower = favorite',
      active: reason === 'Pre-Match Odds Favorite' || reason === 'Odds Fallback',
      v1: fmtOdds(m.preOdds1),
      v2: fmtOdds(m.preOdds2),
    },
    {
      label: 'Recent Odds',
      sublabel: 'Median of last 20 trades — live market',
      active: reason === 'Recent Odds Favorite',
      v1: fmtOdds(m.recentOdds1),
      v2: fmtOdds(m.recentOdds2),
    },
    {
      label: 'Market Load',
      sublabel: 'Total bet volume share',
      active: reason === 'Smart Money Trap',
      v1: `${(m.t1LoadPct * 100).toFixed(0)}%`,
      v2: `${(m.t2LoadPct * 100).toFixed(0)}%`,
    },
    {
      label: 'Bookie Favourite',
      sublabel: hasBF ? `Expects ${m.bookieFav}` : 'No clear fav',
      active: reason === 'Bookie Favourite' || reason === 'Market Signals AI',
      v1: m.bookieFav === m.t1 ? '✅ Fav' : '—',
      v2: m.bookieFav === m.t2 ? '✅ Fav' : '—',
    },
  ]

  return {
    winnerName: winner,
    winnerIdx,
    reason,
    confidence,
    signals,
    odds: {
      preMatch: { t1: m.preOdds1, t2: m.preOdds2 },
      last5: { t1: m.lastOdds1, t2: m.lastOdds2 },
      recent: { t1: m.recentOdds1, t2: m.recentOdds2 },
      min: { t1: m.minOdds1, t2: m.minOdds2 },
    },
    favoriteByOdds: m.recentOdds1 != null && m.recentOdds2 != null
      ? (m.recentOdds1 <= m.recentOdds2 ? m.t1 : m.t2)
      : (m.preOdds1 != null && m.preOdds2 != null ? (m.preOdds1 <= m.preOdds2 ? m.t1 : m.t2) : null),
  }
}

export default predictMatchWinner
