import { predictNormalLeagueMatch, PREDICTOR_VERSION } from '../../../server/utils/normalLeagueMatchPredictor.mjs'
export { PREDICTOR_VERSION }
import { predictLeagueMatch } from '../../../server/utils/matchLeagueModel.js'
import { computeMatchStartRisk } from './predictionRisk.js'
import { splitMatchOutcomes } from './bookiePl.js'

/**
 * Match START Predictor — shared normal league rules.
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

/**
 * Predict winner at match START.
 * Default: the same league registry and rule engine as the server.
 */
export function predictMatchStart(snap, { mode = 'rules' } = {}) {
  if (mode === 'historical-fit') {
    const prediction = predictLeagueMatch(snap)
    if (!prediction) return null
    return {
      winnerName: prediction.winner, winnerIdx: prediction.winnerIdx,
      reason: prediction.reason, predictorVersion: prediction.predictorVersion,
      confidence: { label: 'Historical fit; unvalidated', color: 'text-text-muted', pct: 'Uncalibrated', calibrated: false },
      timing: 'historical_fit', validation: 'in-sample',
      trainingSamples: prediction.trainingSamples, leafSamples: prediction.leafSamples,
      signals: [], preOdds: { t1: null, t2: null },
    }
  }
  if (mode !== 'rules') throw new Error(`Unknown match prediction mode: ${mode}`)
  const prediction = predictNormalLeagueMatch(snap)
  if (!prediction) return null
  const m = extractStartMetrics(snap)
  const { t1, t2 } = m
  const publicTeam = resolvePublicTeam(m)
  const winner = prediction.winner
  const pickOdds = winner === t1 ? m.preOdds1 : m.preOdds2
  const oppOdds = winner === t1 ? m.preOdds2 : m.preOdds1
  const extremeDogFade = pickOdds != null && oppOdds != null && oppOdds <= 0.45 && pickOdds >= 2.5
  const publicOverridden = !!(m.moreBetted && publicTeam && !teamEq(m.moreBetted, publicTeam))
  const msDisagreesPublic = !!(m.msPred && m.msPred !== 'No Prediction' && publicTeam && !teamEq(m.msPred, publicTeam))
  return {
    ...prediction,
    winnerName: winner,
    confidence: { label: 'League algorithm; uncalibrated', color: 'text-text-muted', pct: 'Uncalibrated', calibrated: false },
    risk: computeMatchStartRisk(prediction.reason, { publicOverridden, msDisagreesPublic, extremeDogFade }),
    timing: 'match_start', lockedAt: 'match_open',
    moreBetted: publicTeam, apiMoreBetted: m.moreBetted,
    publicOverridden, msDisagreesPublic, extremeDogFade,
    signals: [{
      label: 'League algorithm', sublabel: prediction.algorithmLeague || 'Unregistered league fallback', active: true,
      v1: winner === t1 ? 'Pick' : '—', v2: winner === t2 ? 'Pick' : '—',
    }, {
      label: 'Pre-Match Back Vol', sublabel: 'Frozen market inputs', active: true,
      v1: String(Math.round(m.preBack1)), v2: String(Math.round(m.preBack2)),
    }],
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
  // Discard a lock from a previous algorithm, keeping ordinary polling stable.
  if (current.predictorVersion && (current.predictorVersion !== locked.predictorVersion || current.algorithmId !== locked.algorithmId
    || current.profileVersion && current.profileVersion !== locked.profileVersion)) {
    return { ...current, lockedAt: current.lockedAt || 'match_open' }
  }

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
