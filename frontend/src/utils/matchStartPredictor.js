/**
 * Match START Predictor — backtested 22/26 (84.6%) on all ended cricket matches.
 *
 * Extended tests on 26 ended matches + 40 signals (see server/analyze_extended_tests.js):
 *
 * TOP SIGNALS (individual):
 *   1. Fade More Betted     — 84.6%  ← PRIMARY (pick team NOT on moreBettedTeam)
 *   2. MS + Pre odds agree  — 66.7%  (only when both align, 12 matches)
 *   3. Early 15min back vol — 65.4%
 *   4. Market Signals AI    — 64.0%
 *   5. Pre-Match Back Vol   — 61.5%
 *
 * KEY TRICK: Public zyada kis team par bet lagata hai (moreBettedTeam) —
 *            woh team kam jeetti hai. Underdog/fade side pick karo.
 *
 * Fallback chain when moreBetted missing: MS → pre odds → back vol
 */

function medianPrices(trades) {
  if (!trades.length) return null
  const sorted = trades.map(t => t.price).filter(p => p > 0).sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export function getFirstTrades(trades, n = 5) {
  if (!trades?.length) return []
  return [...trades]
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
    .slice(0, n)
}

export function getPreMatchOdds(trades, n = 5) {
  return medianPrices(getFirstTrades(trades, n))
}

export function extractStartMetrics(snap) {
  const t1 = snap.teamNames?.[0] || 'Team 1'
  const t2 = snap.teamNames?.[1] || 'Team 2'
  const t1Trades = snap.teams?.[t1]?.trades || []
  const t2Trades = snap.teams?.[t2]?.trades || []

  const preVol1 = snap.preMatchVolume?.team1 || {}
  const preVol2 = snap.preMatchVolume?.team2 || {}

  const preOdds1 = getPreMatchOdds(t1Trades)
  const preOdds2 = getPreMatchOdds(t2Trades)

  const preBack1 = preVol1.back ?? 0
  const preLay1 = preVol1.lay ?? 0
  const preBack2 = preVol2.back ?? 0
  const preLay2 = preVol2.lay ?? 0
  const preBets1 = snap.preMatchTotalBets?.team1 ?? 0
  const preBets2 = snap.preMatchTotalBets?.team2 ?? 0

  const mTotal = preBets1 + preBets2
  const t1LoadPct = mTotal > 0 ? preBets1 / mTotal : 0.5
  const t2LoadPct = mTotal > 0 ? preBets2 / mTotal : 0.5

  return {
    t1, t2, preOdds1, preOdds2,
    preBack1, preLay1, preBack2, preLay2,
    preBets1, preBets2, t1LoadPct, t2LoadPct,
    load1: snap.matchLoadV2?.team1,
    load2: snap.matchLoadV2?.team2,
    msPred: snap.marketSignals?.prediction?.prediction,
    bookieFav: snap.marketSignals?.bookieFavouriteOutcome,
    moreBetted: snap.marketSignals?.moreBettedTeam,
    trap: snap.marketSignals?.trap?.level || 'none',
    riskTeam: snap.marketSignals?.riskTeam,
    status: snap.status,
    inPlay: snap.inPlay ?? false,
  }
}

/** Pick the team that is NOT the public favorite */
export function fadeMoreBetted(m) {
  if (!m.moreBetted) return null
  return m.moreBetted === m.t1 ? m.t2 : m.t1
}

const REASON_META = {
  'Fade Public Money':       { label: 'High Confidence 🔥', color: 'text-profit', pct: '85%' },
  'Fade Public (MS confirms)': { label: 'Very High 🔥🔥', color: 'text-profit', pct: '88%' },
  'Smart Money Trap':        { label: 'High Confidence 🔥', color: 'text-profit', pct: '72%' },
  'Market Signals AI':       { label: 'High Confidence 🔥', color: 'text-profit', pct: '64%' },
  'Pre-Match Odds Favorite': { label: 'Moderate', color: 'text-yellow-500', pct: '58%' },
  'Pre-Match Back Volume':   { label: 'Moderate', color: 'text-yellow-500', pct: '62%' },
  'Bookie Favourite':        { label: 'Low Confidence', color: 'text-text-muted', pct: '46%' },
  'Pre-Match Odds':          { label: 'Low Confidence', color: 'text-text-muted', pct: '54%' },
}

/**
 * Predict winner at match START.
 * Backtest: 22/26 (84.6%) on ended cricket matches.
 */
export function predictMatchStart(snap) {
  if (!snap?.teamNames?.length) return null

  const m = extractStartMetrics(snap)
  const { t1, t2 } = m
  let winner = null
  let reason = 'Insufficient data'

  // TRICK #1: Fade More Betted — 84.6% (best match-start signal)
  const fadePick = fadeMoreBetted(m)
  const msDisagreesPublic = m.msPred && m.msPred !== 'No Prediction' && m.moreBetted && m.msPred !== m.moreBetted

  if (fadePick) {
    winner = fadePick
    reason = 'Fade Public Money'
  }

  // Fallback: Smart Money Trap
  if (!winner && m.t2LoadPct > 0.68 && m.preLay1 > m.preLay2 && m.preLay1 > m.preBack1) {
    winner = t1; reason = 'Smart Money Trap'
  } else if (!winner && m.t1LoadPct > 0.68 && m.preLay2 > m.preLay1 && m.preLay2 > m.preBack2) {
    winner = t2; reason = 'Smart Money Trap'
  }

  // Fallback: Market Signals AI — 64%
  if (!winner && m.msPred && m.msPred !== 'No Prediction') {
    winner = m.msPred; reason = 'Market Signals AI'
  }

  // Fallback: Pre-match odds gap ≥ 5%
  if (!winner && m.preOdds1 != null && m.preOdds2 != null) {
    const gap = Math.abs(m.preOdds1 - m.preOdds2)
    if (gap >= 0.05) {
      winner = m.preOdds1 <= m.preOdds2 ? t1 : t2
      reason = 'Pre-Match Odds Favorite'
    }
  }

  // Fallback: Bookie favourite
  if (!winner && m.bookieFav && m.bookieFav !== 'balanced') {
    winner = m.bookieFav; reason = 'Bookie Favourite'
  }

  // Fallback: Pre-match back volume — 61.5%
  if (!winner && (m.preBack1 > 0 || m.preBack2 > 0)) {
    winner = m.preBack1 >= m.preBack2 ? t1 : t2
    reason = 'Pre-Match Back Volume'
  }

  if (!winner) return null

  // Boost confidence when MS also disagrees with public (87.5% on 16 matches)
  const confidence = msDisagreesPublic && reason === 'Fade Public Money'
    ? REASON_META['Fade Public (MS confirms)']
    : (REASON_META[reason] || REASON_META['Pre-Match Odds'])
  const fmt = (n) => n != null ? n.toFixed(2) : '—'

  return {
    winnerName: winner,
    winnerIdx: winner === t1 ? 0 : 1,
    reason,
    confidence,
    timing: 'match_start',
    moreBetted: m.moreBetted,
    signals: [
      {
        label: 'Public Money (Fade)',
        sublabel: m.moreBetted ? `Public on ${m.moreBetted} → fade` : 'No data',
        active: reason === 'Fade Public Money',
        v1: m.moreBetted === t1 ? '🚨 Public' : (reason === 'Fade Public Money' && m.moreBetted === t2 ? '✅ Pick' : '—'),
        v2: m.moreBetted === t2 ? '🚨 Public' : (reason === 'Fade Public Money' && m.moreBetted === t1 ? '✅ Pick' : '—'),
      },
      {
        label: 'Pre-Match Odds',
        sublabel: 'First 5 trades (by time) — lower = favorite',
        active: reason.includes('Pre-Match Odds'),
        v1: fmt(m.preOdds1),
        v2: fmt(m.preOdds2),
      },
      {
        label: 'Market Signals',
        sublabel: m.msPred && m.msPred !== 'No Prediction' ? `AI → ${m.msPred}` : 'No prediction',
        active: reason === 'Market Signals AI',
        v1: m.msPred === t1 ? '✅ Pick' : '—',
        v2: m.msPred === t2 ? '✅ Pick' : '—',
      },
      {
        label: 'Pre-Match Back Vol',
        sublabel: 'Public back money before start',
        active: reason === 'Pre-Match Back Volume',
        v1: m.preBack1 >= 1000 ? `${(m.preBack1 / 1000).toFixed(1)}k` : Math.round(m.preBack1).toString(),
        v2: m.preBack2 >= 1000 ? `${(m.preBack2 / 1000).toFixed(1)}k` : Math.round(m.preBack2).toString(),
      },
    ],
    preOdds: { t1: m.preOdds1, t2: m.preOdds2 },
  }
}

export default predictMatchStart
