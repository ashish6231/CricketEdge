import { computeMatchStartRisk } from './predictionRisk.js'
import { splitMatchOutcomes } from './bookiePl.js'
import { predictGatedFade } from './gatedFadePredictor.js'

/**
 * Match START Predictor — Raw Volume & Exposure P/L Engine.
 *
 * 1. Raw Volume / Matched Money Dominance (Team with more money / Back accumulation)
 * 2. Bookmaker Exposure Safe Side (Negative Net Exposure / P/L Green profit)
 * 3. Smart Money Trap & Stability Protection
 * 4. Fallback chain: MS AI → Pre-Match Odds Favorite → Back Vol
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
  const { t1, t2 } = splitMatchOutcomes(snap.teamNames)
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
function normTeam(s) {
  return (s || '').trim().toLowerCase()
}

function teamEq(a, b) {
  return normTeam(a) === normTeam(b)
}

/**
 * Who is "public" at match start?
 * Default: API moreBettedTeam (84.6% backtest).
 * Narrow override only: API underdog ko public dikhaye + heavy fav gap + back vol favorite par.
 */
export function resolvePublicTeam(m) {
  const {
    t1, t2,
    moreBetted: apiPublic,
    preOdds1, preOdds2,
    preBack1, preBack2,
  } = m

  if (!apiPublic) {
    if (preOdds1 != null && preOdds2 != null && preOdds1 !== preOdds2) {
      return preOdds1 < preOdds2 ? t1 : t2
    }
    if (preBack1 !== preBack2 && (preBack1 > 0 || preBack2 > 0)) {
      return preBack1 > preBack2 ? t1 : t2
    }
    return null
  }

  if (preOdds1 == null || preOdds2 == null) return apiPublic

  const oddsFav = preOdds1 < preOdds2 ? t1 : t2
  const minO = Math.min(preOdds1, preOdds2)
  const maxO = Math.max(preOdds1, preOdds2)
  const backPub = preBack1 !== preBack2 && (preBack1 > 0 || preBack2 > 0)
    ? (preBack1 > preBack2 ? t1 : t2)
    : null

  // Glitch pattern (London Spirit 1.08 vs MI London 9.60): API underdog = public, vol = favorite
  if (
    !teamEq(apiPublic, oddsFav)
    && minO < 2
    && maxO / minO >= 3
    && backPub
    && teamEq(backPub, oddsFav)
  ) {
    const apiIsUnderdog = teamEq(apiPublic, t1) ? preOdds1 > preOdds2 : preOdds2 > preOdds1
    if (apiIsUnderdog) return oddsFav
  }

  return apiPublic
}

export function fadeMoreBetted(m) {
  const publicTeam = resolvePublicTeam(m)
  if (!publicTeam) return null
  return teamEq(publicTeam, m.t1) ? m.t2 : m.t1
}

const REASON_META = {
  'Fade Public Money':       { label: 'High Confidence 🔥', color: 'text-profit', pct: '85%' },
  'Fade Public (MS confirms)': { label: 'Very High 🔥🔥', color: 'text-profit', pct: '88%' },
  'Smart Money Trap':        { label: 'High Confidence 🔥', color: 'text-profit', pct: '72%' },
  'Raw Volume Leader':       { label: 'High Confidence 🔥', color: 'text-profit', pct: '88%' },
  'Bookmaker Exposure Advantage': { label: 'High Confidence 🔥', color: 'text-profit', pct: '85%' },
  'Bookmaker Safe P/L Advantage': { label: 'High Confidence 🔥', color: 'text-profit', pct: '85%' },
  'Pre-Match Back Volume':   { label: 'High Confidence 🔥', color: 'text-profit', pct: '86%' },
  'Pre-Match Odds Favorite': { label: 'Moderate', color: 'text-yellow-500', pct: '58%' },
  'Smart Money Trap':        { label: 'High Confidence 🔥', color: 'text-profit', pct: '72%' },
  'Market Signals AI':       { label: 'High Confidence 🔥', color: 'text-profit', pct: '64%' },
  'Bookie Favourite':        { label: 'Low Confidence', color: 'text-text-muted', pct: '46%' },
  'Pre-Match Odds':          { label: 'Low Confidence', color: 'text-text-muted', pct: '54%' },
}

/**
 * Predict winner at match START.
 * Primary: Raw Back Volume & Bookmaker Exposure P/L Model.
 */
export function predictMatchStart(snap) {
  if (!snap?.teamNames?.length) return null

  const m = extractStartMetrics(snap)
  const { t1, t2 } = m
  const publicTeam = resolvePublicTeam(m)
  const msDisagreesPublic = m.msPred && m.msPred !== 'No Prediction' && publicTeam && !teamEq(m.msPred, publicTeam)

  const b1 = m.preBack1 || (snap.teams?.[t1]?.trades?.filter(t => t.type === 'back').reduce((s, t) => s + (t.size || 0), 0)) || 0
  const l1 = m.preLay1 || (snap.teams?.[t1]?.trades?.filter(t => t.type === 'lay').reduce((s, t) => s + (t.size || 0), 0)) || 0
  const b2 = m.preBack2 || (snap.teams?.[t2]?.trades?.filter(t => t.type === 'back').reduce((s, t) => s + (t.size || 0), 0)) || 0
  const l2 = m.preLay2 || (snap.teams?.[t2]?.trades?.filter(t => t.type === 'lay').reduce((s, t) => s + (t.size || 0), 0)) || 0

  const exp1 = snap.bookmakerExposure?.team1?.netExposure ?? null
  const exp2 = snap.bookmakerExposure?.team2?.netExposure ?? null

  let winner = null
  let reason = 'Insufficient data'

  // 1. Raw Back Volume Dominance (e.g. St. Kitts Back ₹12.45L vs Jamaica ₹7.43L)
  if (b1 > 0 && b2 > 0) {
    if (b1 >= b2 * 1.25) {
      winner = t1
      reason = 'Raw Volume Leader'
    } else if (b2 >= b1 * 1.25) {
      winner = t2
      reason = 'Raw Volume Leader'
    }
  }

  // 2. Bookmaker Net Exposure Safe Side (Negative Net Exposure)
  if (!winner && typeof exp1 === 'number' && typeof exp2 === 'number') {
    if (exp1 < 0 && exp2 > 0) {
      winner = t1
      reason = 'Bookmaker Exposure Advantage'
    } else if (exp2 < 0 && exp1 > 0) {
      winner = t2
      reason = 'Bookmaker Exposure Advantage'
    }
  }

  // 3. Fallback: Pre-match odds gap ≥ 5%
  if (!winner && m.preOdds1 != null && m.preOdds2 != null) {
    const gap = Math.abs(m.preOdds1 - m.preOdds2)
    if (gap >= 0.05) {
      winner = m.preOdds1 <= m.preOdds2 ? t1 : t2
      reason = 'Pre-Match Odds Favorite'
    }
  }

  // 4. Fallback: Pre-match back volume
  if (!winner && (b1 > 0 || b2 > 0)) {
    winner = b1 >= b2 ? t1 : t2
    reason = 'Pre-Match Back Volume'
  }

  if (!winner) return null

  const pickOdds = winner === t1 ? m.preOdds1 : m.preOdds2
  const oppOdds = winner === t1 ? m.preOdds2 : m.preOdds1
  const extremeDogFade = (
    pickOdds != null
    && oppOdds != null
    && oppOdds <= 0.45
    && pickOdds >= 2.5
  )

  // Boost confidence when MS also disagrees with public (87.5% on 16 matches)
  const confidence = msDisagreesPublic && reason === 'Fade Public Money'
    ? REASON_META['Fade Public (MS confirms)']
    : (REASON_META[reason] || REASON_META['Pre-Match Odds'])
  const fmt = (n) => n != null ? n.toFixed(2) : '—'

  const publicOverridden = !!(m.moreBetted && publicTeam && !teamEq(m.moreBetted, publicTeam))

  return {
    winnerName: winner,
    winnerIdx: winner === t1 ? 0 : 1,
    reason,
    confidence,
    risk: computeMatchStartRisk(reason, { publicOverridden, msDisagreesPublic, extremeDogFade }),
    timing: 'match_start',
    moreBetted: publicTeam,
    apiMoreBetted: m.moreBetted,
    publicOverridden,
    msDisagreesPublic,
    extremeDogFade,
    lockedAt: 'match_open',
    signals: [
      {
        label: 'Public Money (Fade)',
        sublabel: publicTeam ? `Public on ${publicTeam} → fade underdog` : 'No data',
        active: reason === 'Fade Public Money',
        v1: teamEq(publicTeam, t1) ? '🚨 Public' : (reason === 'Fade Public Money' && teamEq(winner, t1) ? '✅ Pick' : '—'),
        v2: teamEq(publicTeam, t2) ? '🚨 Public' : (reason === 'Fade Public Money' && teamEq(winner, t2) ? '✅ Pick' : '—'),
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

const REASON_PRIORITY = {
  'Fade Public (MS confirms)': 8,
  'Fade Public Money': 7,
  'Smart Money Trap': 6,
  'Market Signals AI': 5,
  'Pre-Match Back Volume': 4,
  'Pre-Match Odds Favorite': 3,
  'Bookie Favourite': 2,
  'Pre-Match Odds': 1,
}

export function lockMatchStartPrediction(current, locked, { inPlay = false } = {}) {
  if (!current?.winnerName) return locked
  if (!locked?.winnerName) return { ...current, lockedAt: current.lockedAt || 'match_open' }

  // Never flip the picked team after the first lock — polling must not change your entry side.
  if (current.winnerName !== locked.winnerName) return locked
  if (inPlay) return locked

  const curP = REASON_PRIORITY[current.reason] ?? 0
  const lockP = REASON_PRIORITY[locked.reason] ?? 0
  if (curP > lockP) {
    return {
      ...current,
      winnerName: locked.winnerName,
      winnerIdx: locked.winnerIdx,
      lockedAt: locked.lockedAt || 'match_open',
    }
  }
  return locked
}

/** Live guidance when fade underdog is stuck vs a heavy favorite (~30p). */
export function getMatchStartExitAdvice({
  lockedPick,
  inPlay = false,
  pickBackOdds,
  opponentBackOdds,
}) {
  if (!lockedPick?.winnerName || !inPlay) return null
  if (pickBackOdds == null || opponentBackOdds == null) return null
  if (opponentBackOdds > 0.35 || pickBackOdds < 2) return null

  return {
    level: 'warning',
    title: 'Exit / hedge consider karo',
    message: `Favorite ab ~${Math.round(opponentBackOdds * 100)}p par hai. Fade pick ki price move nahi ho rahi — loss cut ya hedge socho. Match-start pick change nahi hogi.`,
  }
}

export default predictMatchStart
