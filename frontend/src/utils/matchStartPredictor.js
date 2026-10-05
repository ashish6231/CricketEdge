import { predictNormalLeagueMatch, PREDICTOR_VERSION } from '../../../server/utils/normalLeagueMatchPredictor.mjs'
export { PREDICTOR_VERSION }
import { predictLeagueMatch } from '../../../server/utils/matchLeagueModel.js'
import { computeMatchStartRisk } from './predictionRisk.js'
import { splitMatchOutcomes, timestamp, tradeTimestamp } from './bookiePl.js'

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
  const sorted = trades.map(t => Number(t.price)).filter(p => Number.isFinite(p) && p > 1).sort((a, b) => a - b)
  if (!sorted.length) return null
  return sorted[Math.floor(sorted.length / 2)]
}

export function getFirstTrades(trades, n = 5, startTime = null) {
  if (!trades?.length) return []
  const start = timestamp(startTime)
  return [...trades]
    .filter(trade => start == null || (tradeTimestamp(trade) != null && tradeTimestamp(trade) < start))
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
    .slice(0, n)
}

export function getPreMatchOdds(trades, n = 5, startTime = null) {
  return medianPrices(getFirstTrades(trades, n, startTime))
}

export function extractStartMetrics(snap) {
  const { t1, t2 } = splitMatchOutcomes(snap.teamNames)
  const t1Trades = snap.teams?.[t1]?.trades || []
  const t2Trades = snap.teams?.[t2]?.trades || []

  const preVol1 = snap.preMatchVolume?.team1 || {}
  const preVol2 = snap.preMatchVolume?.team2 || {}

  const preOdds1 = getPreMatchOdds(t1Trades, 5, snap.startTime)
  const preOdds2 = getPreMatchOdds(t2Trades, 5, snap.startTime)

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
  const extremeDogFade = pickOdds != null && oppOdds != null && oppOdds <= 1.45 && pickOdds >= 2.5
  const publicOverridden = !!(m.moreBetted && publicTeam && !teamEq(m.moreBetted, publicTeam))
  const msDisagreesPublic = !!(m.msPred && m.msPred !== 'No Prediction' && publicTeam && !teamEq(m.msPred, publicTeam))
  const algorithmDisagreesMarket = !!(m.msPred && m.msPred !== 'No Prediction' && !teamEq(m.msPred, winner))
  const evidence = prediction.marketEvidence
  const evidenceSignals = evidence ? [{
    label: 'Corrected support', sublabel: 'Own Back + opponent Lay', active: true,
    v1: `${evidence.support.pct1.toFixed(0)}%`, v2: `${evidence.support.pct2.toFixed(0)}%`,
  }, {
    label: 'Pre-match activity', sublabel: `${evidence.agreeingSignals}/${evidence.signalCount} signals aligned`, active: true,
    v1: `${evidence.activity.pct1.toFixed(0)}%`, v2: `${evidence.activity.pct2.toFixed(0)}%`,
  }] : []
  return {
    ...prediction,
    winnerName: winner,
    confidence: { label: prediction.confidence || 'League algorithm; uncalibrated', color: 'text-text-muted', pct: 'Uncalibrated', calibrated: false },
    risk: computeMatchStartRisk(prediction.reason, {
      publicOverridden,
      msDisagreesPublic,
      extremeDogFade,
      leagueRegistered: prediction.leagueRegistered,
      validation: prediction.validation,
      trainingSamples: prediction.trainingSamples,
    }),
    timing: 'match_start', lockedAt: 'match_open',
    moreBetted: publicTeam, apiMoreBetted: m.moreBetted,
    publicOverridden, msDisagreesPublic, extremeDogFade, algorithmDisagreesMarket,
    signals: [...evidenceSignals, {
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

  // Keep the picked team stable, while refreshing safety metadata added by the
  // current predictor. Older session locks may not contain risk/no-bet fields.
  const withFreshSafety = {
    ...locked,
    risk: current.risk ?? locked.risk,
    confidence: current.confidence ?? locked.confidence,
    preOdds: locked.preOdds ?? current.preOdds,
    signals: current.signals ?? locked.signals,
    marketEvidence: current.marketEvidence ?? locked.marketEvidence,
    algorithmLeague: current.algorithmLeague ?? locked.algorithmLeague,
    lockedAt: locked.lockedAt || 'match_open',
  }

  // Never flip the picked team after the first lock — polling must not rewrite
  // the original entry signal. Live reversal guidance is calculated separately.
  if (current.winnerName !== locked.winnerName) return withFreshSafety
  if (inPlay) return withFreshSafety

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
  return withFreshSafety
}

/** Live guidance when the market moves materially against the locked start pick. */
export function getMatchStartExitAdvice({
  lockedPick,
  inPlay = false,
  pickBackOdds,
  opponentBackOdds,
}) {
  if (!lockedPick?.winnerName || !inPlay) return null
  if (!Number.isFinite(pickBackOdds) || !Number.isFinite(opponentBackOdds) || pickBackOdds <= 1 || opponentBackOdds <= 1) return null

  const pickedTeamIndex = lockedPick.winnerIdx === 1 ? 1 : 0
  const entryPickOdds = pickedTeamIndex === 0 ? lockedPick.preOdds?.t1 : lockedPick.preOdds?.t2
  const entryOpponentOdds = pickedTeamIndex === 0 ? lockedPick.preOdds?.t2 : lockedPick.preOdds?.t1
  const hasEntryOdds = Number.isFinite(entryPickOdds) && entryPickOdds > 1 && Number.isFinite(entryOpponentOdds) && entryOpponentOdds > 1
  const favouriteFlipped = hasEntryOdds && entryPickOdds < entryOpponentOdds && pickBackOdds > opponentBackOdds
  const pickDrift = hasEntryOdds ? pickBackOdds / entryPickOdds : null
  const opponentShorten = hasEntryOdds ? opponentBackOdds / entryOpponentOdds : null
  const sharpMoveAgainst = pickDrift != null && opponentShorten != null && pickDrift >= 1.15 && opponentShorten <= 0.88
  const opponentNowHeavyFavourite = opponentBackOdds <= 1.35 && pickBackOdds >= 2

  if (!favouriteFlipped && !sharpMoveAgainst && !opponentNowHeavyFavourite) return null

  return {
    level: opponentNowHeavyFavourite || sharpMoveAgainst ? 'danger' : 'warning',
    title: 'Strong live reversal — new entry avoid karo',
    message: `Locked pick ${lockedPick.winnerName} ke against market flip hua: pick ${pickBackOdds.toFixed(2)}, opponent ${opponentBackOdds.toFixed(2)}. Open position ka risk review karo; match-start pick ko live certainty mat samjho.`,
    favouriteFlipped,
    sharpMoveAgainst,
  }
}

export default predictMatchStart
