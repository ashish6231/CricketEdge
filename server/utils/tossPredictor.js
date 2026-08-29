/**
 * Toss Winner Predictor v9 — League-Specific Algorithms & Smart Flow Waterfall
 *
 * Checks specialized league algorithms first (CPL, TNPL, The Hundred, ECS, T20I, Test, ODI, Kerala, DPL, UP T20, Sri Lanka),
 * then falls back to default waterfall for maximum precision.
 */

import { computeTossRisk } from './predictionRisk.js'
import { getLeagueTossPrediction, inferCompetition, teamEq, fmtVol } from './tossLeagueAlgorithms.js'

export const PREDICTOR_VERSION = 'toss-v9-league-specific-algorithms'

export function predictTossWinner(snap, compName = '') {
  if (!snap?.teamNames?.length) return null

  const t1 = snap.teamNames?.[0] || 'Team 1'
  const t2 = snap.teamNames?.[1] || 'Team 2'

  const pv1 = snap.preMatchVolume?.team1 || snap.advancedMetricsV2?.team1 || snap.advancedMetrics?.team1 || {}
  const pv2 = snap.preMatchVolume?.team2 || snap.advancedMetricsV2?.team2 || snap.advancedMetrics?.team2 || {}

  const b1 = pv1.back ?? (snap.teams?.[t1]?.trades || []).filter(t => t.type === 'back').reduce((s, t) => s + (t.size || 0), 0)
  const l1 = pv1.lay ?? (snap.teams?.[t1]?.trades || []).filter(t => t.type === 'lay').reduce((s, t) => s + (t.size || 0), 0)
  const b2 = pv2.back ?? (snap.teams?.[t2]?.trades || []).filter(t => t.type === 'back').reduce((s, t) => s + (t.size || 0), 0)
  const l2 = pv2.lay ?? (snap.teams?.[t2]?.trades || []).filter(t => t.type === 'lay').reduce((s, t) => s + (t.size || 0), 0)

  const tot1 = (snap.advancedMetricsV2?.team1?.totalBet) ?? (b1 + l1)
  const tot2 = (snap.advancedMetricsV2?.team2?.totalBet) ?? (b2 + l2)
  const mTotal = tot1 + tot2

  if (mTotal <= 0 && b1 === 0 && l1 === 0 && b2 === 0 && l2 === 0) return null

  const prePnl1 = snap.preMatchPnl?.team1 ?? (l1 - b1)
  const prePnl2 = snap.preMatchPnl?.team2 ?? (l2 - b2)

  const backRatio = Math.min(b1, b2) > 0 ? Math.max(b1, b2) / Math.min(b1, b2) : (Math.max(b1, b2) > 0 ? 99 : 1)
  const ratio1 = (b1 > 0 && l1 > 0) ? Math.max(b1, l1) / Math.min(b1, l1) : (Math.max(b1, l1) > 0 ? 99 : 1)
  const ratio2 = (b2 > 0 && l2 > 0) ? Math.max(b2, l2) / Math.min(b2, l2) : (Math.max(b2, l2) > 0 ? 99 : 1)
  const isStable1 = ratio1 <= 2.2
  const isStable2 = ratio2 <= 2.2

  const totBack = b1 + b2
  const b1Pct = totBack > 0 ? b1 / totBack : 0.5
  const b2Pct = totBack > 0 ? b2 / totBack : 0.5

  const isZeroBack1 = b1 === 0 && b2 > 0
  const isZeroBack2 = b2 === 0 && b1 > 0
  const isLayAbsorbed1 = l1 >= b1 * 1.8 && l1 > l2 && l1 > 200
  const isLayAbsorbed2 = l2 >= b2 * 1.8 && l2 > l1 && l2 > 200

  let winner = null
  let reason = ''
  let verdictTag = 'SMART MONEY INFLOW'
  let pattern = 'SMART_BACK_FLOW'
  let tier = 'DEFAULT_TOSS'
  let algoName = '⚡ Smart Flow Waterfall Algorithm'

  const trap = snap.marketSignals?.trap?.level || 'none'
  const bookieFav = snap.marketSignals?.bookieFavouriteOutcome
  const stronger = snap.syntheticSupport?.strongerTeam

  // 🏆 1. TRY LEAGUE-SPECIFIC ALGORITHM FIRST
  const leaguePred = getLeagueTossPrediction(snap, compName)
  if (leaguePred && leaguePred.winner) {
    winner = leaguePred.winner
    reason = leaguePred.reason
    verdictTag = leaguePred.verdictTag || verdictTag
    pattern = leaguePred.pattern || pattern
    tier = leaguePred.tier || tier
    algoName = leaguePred.algoName || algoName
  } else {
    // 🛡️ 2. DEFAULT FALLBACK WATERFALL
    // 🚨 2.1 Critical Overload Trap Fade
    if ((b1Pct >= 0.92 || backRatio >= 10.0) && b1 > b2 && prePnl1 < 0 && l2 <= 100) {
      winner = t2
      verdictTag = 'OVERLOAD TRAP FADE 🚨'
      pattern = 'OVERLOAD_TRAP_FADE'
      algoName = '⚡ Overload Trap Fade Algorithm'
      reason = `Critical Public Overload on ${t1} (${(b1Pct * 100).toFixed(0)}% Load, ${backRatio.toFixed(1)}x Lead) -> Faded to ${t2}`
    } else if ((b2Pct >= 0.92 || backRatio >= 10.0) && b2 > b1 && prePnl2 < 0 && l1 <= 100) {
      winner = t1
      verdictTag = 'OVERLOAD TRAP FADE 🚨'
      pattern = 'OVERLOAD_TRAP_FADE'
      algoName = '⚡ Overload Trap Fade Algorithm'
      reason = `Critical Public Overload on ${t2} (${(b2Pct * 100).toFixed(0)}% Load, ${backRatio.toFixed(1)}x Lead) -> Faded to ${t1}`
    }
    // ⚡ 2.2 Zero-Back Bookmaker Profit
    else if (isZeroBack1 && prePnl1 > 0) {
      winner = t1
      verdictTag = 'BOOKIE SAFE ZERO-BACK'
      pattern = 'BOOKIE_SAFE_ZERO_BACK'
      algoName = '⚡ Zero-Back Pure Profit Algorithm'
      reason = `Bookmaker Pure Profit on ${t1} (Zero Back Exposure, P/L: +${prePnl1.toFixed(1)})`
    } else if (isZeroBack2 && prePnl2 > 0) {
      winner = t2
      verdictTag = 'BOOKIE SAFE ZERO-BACK'
      pattern = 'BOOKIE_SAFE_ZERO_BACK'
      algoName = '⚡ Zero-Back Pure Profit Algorithm'
      reason = `Bookmaker Pure Profit on ${t2} (Zero Back Exposure, P/L: +${prePnl2.toFixed(1)})`
    }
    // 🏆 2.3 Dual Confirmation
    else if ((b1 > b2 && prePnl1 > prePnl2) || (b2 > b1 && prePnl2 > prePnl1)) {
      winner = b1 > b2 ? t1 : t2
      verdictTag = 'PERFECT ALIGNMENT 🔥'
      pattern = 'DUAL_INFLOW_PNL_ALIGN'
      algoName = '⚡ Dual Flow & PnL Alignment Algorithm'
      reason = `Dual Advantage: Higher Back Inflow (₹${fmtVol(Math.max(b1, b2))}) & Positive Bookie P/L (+${Math.max(prePnl1, prePnl2).toFixed(1)})`
    }
    // 🛡️ 2.4 High Trap Exposure Counter
    else if (trap === 'high' && b1 > b2 && prePnl1 < -500 && prePnl2 > 1000 && l2 <= 50 && bookieFav && teamEq(bookieFav, t2)) {
      winner = t2
      verdictTag = 'TRAP COUNTER SAFE BOOKIE'
      pattern = 'TRAP_COUNTER_SAFE_BOOKIE'
      algoName = '⚡ Trap Counter Safe Bookie Algorithm'
      reason = `High Trap Overload on ${t1} (P/L: ${prePnl1.toFixed(1)}) -> Bookmaker Safe Side on ${t2} (+${prePnl2.toFixed(1)})`
    } else if (trap === 'high' && b2 > b1 && prePnl2 < -500 && prePnl1 > 1000 && l1 <= 50 && bookieFav && teamEq(bookieFav, t1)) {
      winner = t1
      verdictTag = 'TRAP COUNTER SAFE BOOKIE'
      pattern = 'TRAP_COUNTER_SAFE_BOOKIE'
      algoName = '⚡ Trap Counter Safe Bookie Algorithm'
      reason = `High Trap Overload on ${t2} (P/L: ${prePnl2.toFixed(1)}) -> Bookmaker Safe Side on ${t1} (+${prePnl1.toFixed(1)})`
    }
    // 🛡️ 2.5 Lay Shield
    else if (isLayAbsorbed1 && !isLayAbsorbed2 && prePnl1 > 1650) {
      winner = t1
      verdictTag = 'BOOKMAKER SHIELD'
      pattern = 'BOOKIE_LAY_ABSORPTION'
      algoName = '⚡ Bookmaker Lay Shield Algorithm'
      reason = `Bookie Lay Shield on ${t1} (Lay: ₹${fmtVol(l1)} vs Back: ₹${fmtVol(b1)}, P/L: +${prePnl1.toFixed(1)})`
    } else if (isLayAbsorbed2 && !isLayAbsorbed1 && prePnl2 > 1650) {
      winner = t2
      verdictTag = 'BOOKMAKER SHIELD'
      pattern = 'BOOKIE_LAY_ABSORPTION'
      algoName = '⚡ Bookmaker Lay Shield Algorithm'
      reason = `Bookie Lay Shield on ${t2} (Lay: ₹${fmtVol(l2)} vs Back: ₹${fmtVol(b2)}, P/L: +${prePnl2.toFixed(1)})`
    }
    // ⚖️ 2.6 Micro Liquidity Bookie Safe
    else if (Math.max(b1, b2) < 500 && prePnl1 > 100 && prePnl2 < -100) {
      winner = t1
      verdictTag = 'BOOKIE SAFE SIDE'
      pattern = 'BOOKIE_MICRO_SAFE'
      algoName = '⚡ Micro Liquidity Safe Algorithm'
      reason = `Micro Liquidity Bookie Safe on ${t1} (P/L: +${prePnl1.toFixed(1)} vs ${t2}: ${prePnl2.toFixed(1)})`
    } else if (Math.max(b1, b2) < 500 && prePnl2 > 100 && prePnl1 < -100) {
      winner = t2
      verdictTag = 'BOOKIE SAFE SIDE'
      pattern = 'BOOKIE_MICRO_SAFE'
      algoName = '⚡ Micro Liquidity Safe Algorithm'
      reason = `Micro Liquidity Bookie Safe on ${t2} (P/L: +${prePnl2.toFixed(1)} vs ${t1}: ${prePnl1.toFixed(1)})`
    }
    // 🎯 2.7 Clean Market Support
    else if (trap === 'none' && backRatio <= 1.55 && prePnl1 > 0 && prePnl2 < 0 && stronger && bookieFav && teamEq(stronger, t1) && teamEq(bookieFav, t1)) {
      winner = t1
      verdictTag = 'BOOKIE SAFE STRONGER SUPPORT'
      pattern = 'BOOKIE_SAFE_STRONGER_SUPPORT'
      algoName = '⚡ Stronger Support Safe Algorithm'
      reason = `Weak Inflow Lead Faded -> Stronger Bookie Safe Side on ${t1} (P/L: +${prePnl1.toFixed(1)})`
    } else if (trap === 'none' && backRatio <= 1.55 && prePnl2 > 0 && prePnl1 < 0 && stronger && bookieFav && teamEq(stronger, t2) && teamEq(bookieFav, t2)) {
      winner = t2
      verdictTag = 'BOOKIE SAFE STRONGER SUPPORT'
      pattern = 'BOOKIE_SAFE_STRONGER_SUPPORT'
      algoName = '⚡ Stronger Support Safe Algorithm'
      reason = `Weak Inflow Lead Faded -> Stronger Bookie Safe Side on ${t2} (P/L: +${prePnl2.toFixed(1)})`
    }
    // ⚡ 2.8 Smart Money Inflow Leader
    else if (b1 !== b2 && (b1 > 0 || b2 > 0)) {
      winner = b1 > b2 ? t1 : t2
      verdictTag = backRatio >= 1.4 ? 'SMART INFLOW LEADER' : 'BACK MOMENTUM'
      pattern = backRatio >= 1.4 ? 'SMART_MONEY_FLOW' : 'BACK_MOMENTUM'
      algoName = '⚡ Smart Money Inflow Algorithm'
      reason = `Smart Money Inflow (${winner}: ₹${fmtVol(Math.max(b1, b2))} Back, Lead: ${backRatio.toFixed(1)}x)`
    }
    // 2.9 Exposure Fallback
    else {
      winner = prePnl1 > prePnl2 ? t1 : t2
      verdictTag = 'BOOKIE SAFE'
      pattern = 'BOOKIE_SAFE_PNL'
      algoName = '⚡ Bookmaker Safe Exposure Algorithm'
      reason = `Bookmaker Exposure Safe Side (${winner}: +${Math.max(prePnl1, prePnl2).toFixed(1)} PnL)`
    }
  }

  const winnerIdx = teamEq(winner, t1) ? 0 : 1
  const isHighConf =
    verdictTag.includes('🔥') ||
    verdictTag.includes('SHIELD') ||
    verdictTag.includes('LEADER') ||
    verdictTag.includes('SUPPORT') ||
    verdictTag.includes('SMART')

  const confidence = isHighConf
    ? { label: 'High Confidence 🔥', color: 'text-profit', pct: '92%' }
    : { label: 'Moderate', color: 'text-yellow-500', pct: '78%' }

  const signals = [
    {
      label: 'Back Accumulation',
      sublabel: 'Smart money buying volume',
      active: true,
      v1: `₹${fmtVol(b1)}`,
      v2: `₹${fmtVol(b2)}`,
      winnerWins: b1 !== b2 ? (b1 > b2 ? winnerIdx === 0 : winnerIdx === 1) : null,
    },
    {
      label: 'Back/Lay Total',
      sublabel: 'Total market volume matched',
      active: true,
      v1: `₹${fmtVol(tot1)}`,
      v2: `₹${fmtVol(tot2)}`,
      winnerWins: tot1 !== tot2 ? (tot1 > tot2 ? winnerIdx === 0 : winnerIdx === 1) : null,
    },
    {
      label: 'Pre-Match Lay',
      sublabel: 'Lay liability placed',
      active: true,
      v1: `₹${fmtVol(l1)}`,
      v2: `₹${fmtVol(l2)}`,
      winnerWins: l1 !== l2 ? (l1 > l2 ? winnerIdx === 0 : winnerIdx === 1) : null,
    },
    {
      label: 'Bookie Pre-P/L',
      sublabel: 'Bookmaker liability stance',
      active: true,
      v1: prePnl1 >= 0 ? `+${prePnl1.toFixed(1)}` : `${prePnl1.toFixed(1)}`,
      v2: prePnl2 >= 0 ? `+${prePnl2.toFixed(1)}` : `${prePnl2.toFixed(1)}`,
      winnerWins: prePnl1 !== prePnl2 ? (prePnl1 > prePnl2 ? winnerIdx === 0 : winnerIdx === 1) : null,
    },
  ]

  const matchedRules = [
    {
      reason,
      winner,
      priority: 100,
      selected: true,
    }
  ]

  return {
    winnerName: winner,
    winnerIdx,
    reason,
    pattern,
    verdictTag,
    tier,
    algoName,
    predictorVersion: PREDICTOR_VERSION,
    confidence,
    risk: computeTossRisk(reason, matchedRules),
    signals,
    activeSignals: signals.filter(s => s.active).length,
    metrics: {
      t1, t2, b1, l1, b2, l2, tot1, tot2, prePnl1, prePnl2, ratio1, ratio2, isStable1, isStable2
    },
    matchedRules,
  }
}

export { getLeagueTossPrediction, inferCompetition }
export default predictTossWinner
