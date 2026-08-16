/**
 * Fav Flip Risk — early warning when PL/exposure looks safe on one side
 * but market flow/odds are shifting toward the other team becoming favorite.
 *
 * Leading signals (PL lags, flow leads):
 *   1. Odds momentum — opposite team odds dropping
 *   2. Bookie fav disagrees with PL-green / exposure-green team
 *   3. Load / back volume shifting to opposite team
 *   4. Lay pressure building on the currently "safe" team
 */

function medianPrices(trades) {
  if (!trades?.length) return null
  const sorted = trades.map(t => t.price).filter(p => p > 0).sort((a, b) => a - b)
  if (!sorted.length) return null
  return sorted[Math.floor(sorted.length / 2)]
}

function getFirstOdds(trades, n = 5) {
  if (!trades?.length) return null
  const early = [...trades]
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
    .slice(0, Math.min(n, trades.length))
  return medianPrices(early)
}

function getLastOdds(trades, n = 5) {
  if (!trades?.length) return null
  const late = [...trades]
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
    .slice(-Math.min(n, trades.length))
  return medianPrices(late)
}

function norm(s) {
  return String(s || '').trim().toLowerCase()
}

function teamEq(a, b) {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

function resolveSafeTeam({ t1, t2, pl1, pl2, exp1Net, exp2Net }) {
  // Prefer clear PL profit side; fall back to more-positive exposure.
  const plGap = Math.abs((pl1 ?? 0) - (pl2 ?? 0))
  if (pl1 != null && pl2 != null && plGap >= 50) {
    if (pl1 > pl2 && pl1 > 0) return t1
    if (pl2 > pl1 && pl2 > 0) return t2
  }
  if (exp1Net != null && exp2Net != null) {
    if (exp1Net > exp2Net && exp1Net > 0) return t1
    if (exp2Net > exp1Net && exp2Net > 0) return t2
  }
  // Soft PL lead even if both negative (less-loss side feels "safer" while waiting)
  if (pl1 != null && pl2 != null && pl1 !== pl2) {
    return pl1 > pl2 ? t1 : t2
  }
  return null
}

/**
 * @returns {null | {
 *   tier: 'low'|'medium'|'high',
 *   label: string,
 *   title: string,
 *   message: string,
 *   score: number,
 *   safeTeam: string,
 *   threatTeam: string,
 *   reasons: string[],
 * }}
 */
export function computeFavFlipRisk(snap, { pl1, pl2 } = {}) {
  if (!snap?.teamNames?.length) return null

  const t1 = snap.teamNames[0]
  const t2 = snap.teamNames[1]
  const t1Trades = snap.teams?.[t1]?.trades || []
  const t2Trades = snap.teams?.[t2]?.trades || []
  const m1 = snap.advancedMetricsV2?.team1 || snap.advancedMetrics?.team1 || {}
  const m2 = snap.advancedMetricsV2?.team2 || snap.advancedMetrics?.team2 || {}
  const exp1Net = snap.bookmakerExposure?.team1?.netExposure ?? null
  const exp2Net = snap.bookmakerExposure?.team2?.netExposure ?? null
  const bookieFav = snap.marketSignals?.bookieFavouriteOutcome
  const trap = snap.marketSignals?.trap?.level || 'none'

  const safeTeam = resolveSafeTeam({ t1, t2, pl1, pl2, exp1Net, exp2Net })
  if (!safeTeam) return null

  const threatTeam = teamEq(safeTeam, t1) ? t2 : t1
  const safeIsT1 = teamEq(safeTeam, t1)

  const pre1 = getFirstOdds(t1Trades)
  const pre2 = getFirstOdds(t2Trades)
  const last1 = getLastOdds(t1Trades, 5)
  const last2 = getLastOdds(t2Trades, 5)

  const safePre = safeIsT1 ? pre1 : pre2
  const threatPre = safeIsT1 ? pre2 : pre1
  const safeLast = safeIsT1 ? last1 : last2
  const threatLast = safeIsT1 ? last2 : last1

  const safeDrop = (safePre != null && safeLast != null) ? safeLast - safePre : null
  const threatDrop = (threatPre != null && threatLast != null) ? threatLast - threatPre : null

  const safeLoad = safeIsT1 ? (m1.totalBet ?? 0) : (m2.totalBet ?? 0)
  const threatLoad = safeIsT1 ? (m2.totalBet ?? 0) : (m1.totalBet ?? 0)
  const loadTotal = safeLoad + threatLoad
  const threatLoadPct = loadTotal > 0 ? threatLoad / loadTotal : 0.5

  const safeLay = safeIsT1 ? (m1.lay ?? 0) : (m2.lay ?? 0)
  const threatLay = safeIsT1 ? (m2.lay ?? 0) : (m1.lay ?? 0)
  const safeBack = safeIsT1 ? (m1.back ?? 0) : (m2.back ?? 0)

  let score = 0
  const reasons = []

  // 1) Odds momentum toward threat (threat odds falling harder)
  if (threatDrop != null && safeDrop != null) {
    const momentumGap = safeDrop - threatDrop // positive => threat dropping more (becoming fav)
    if (threatDrop <= -0.05 && momentumGap >= 0.04) {
      score += 3
      reasons.push(`${threatTeam} odds soft ho rahe hain (momentum)`)
    } else if (threatDrop <= -0.03 && momentumGap >= 0.02) {
      score += 2
      reasons.push(`${threatTeam} odds halka soft`)
    }
  } else if (threatLast != null && safeLast != null && threatLast + 0.05 < safeLast) {
    // Already cheaper on last prints without full pre/last history
    score += 2
    reasons.push(`${threatTeam} already lower live odds`)
  }

  // 2) Bookie fav already on threat side while PL/exposure still "safe"
  const hasBF = bookieFav && bookieFav !== 'balanced'
  if (hasBF && teamEq(bookieFav, threatTeam)) {
    score += 3
    reasons.push(`Bookie fav pehle se ${threatTeam}`)
  } else if (hasBF && teamEq(bookieFav, safeTeam)) {
    score -= 1
  }

  // 3) Load / public money on threat
  if (threatLoadPct >= 0.62) {
    score += 2
    reasons.push(`Load ${threatTeam} pe zyada (${(threatLoadPct * 100).toFixed(0)}%)`)
  } else if (threatLoadPct >= 0.55) {
    score += 1
    reasons.push(`Load shift ${threatTeam} taraf`)
  }

  // 4) Lay pressure on currently safe team (people fading the PL-green side)
  if (safeLay > safeBack && safeLay > threatLay && safeLay >= 80) {
    score += 2
    reasons.push(`${safeTeam} pe lay pressure badh raha hai`)
  }

  // 5) Trap markets flip harder
  if (trap === 'high') {
    score += 1
    reasons.push('Trap market — flips tez hote hain')
  }

  // Need at least one real forward signal
  if (score <= 0 || reasons.length === 0) {
    return {
      tier: 'low',
      label: 'Low',
      title: 'Fav flip risk: Low',
      message: `${safeTeam} pe PL/exposure abhi stable dikh raha hai — opposite side pe clear shift nahi.`,
      score: Math.max(0, score),
      safeTeam,
      threatTeam,
      reasons: [],
    }
  }

  let tier = 'medium'
  let label = 'Medium'
  let title = 'Fav flip risk: Medium'
  if (score >= 6) {
    tier = 'high'
    label = 'High'
    title = 'Fav flip risk: High'
  } else if (score <= 2) {
    tier = 'low'
    label = 'Low'
    title = 'Fav flip risk: Low'
  }

  const advice = tier === 'high'
    ? `PL/exposure ${safeTeam} pe green ho sakta hai, lekin market ${threatTeam} ko fav bana sakta hai. Non-fav wait mat karo — late load pe entry miss hogi.`
    : `PL abhi ${safeTeam} pe safe lag raha hai, lekin ${threatTeam} taraf flow shuru. Odds soft hone se pehle decide karo.`

  return {
    tier,
    label,
    title,
    message: `${advice} ${reasons.slice(0, 3).join(' · ')}`,
    score,
    safeTeam,
    threatTeam,
    reasons,
  }
}

export default computeFavFlipRisk
