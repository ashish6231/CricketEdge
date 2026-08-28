/**
 * Toss winner predictor v8 — LayVol / StrongerTeam / LayTrades waterfall.
 *
 * Clear lay-vol needs a real share edge, not just a rupee gap:
 *   ratio ≥ 1.5, or gap ≥ 150 AND ratio ≥ 1.25
 * Weak-ratio gaps (England v Pakistan 1.21×) fall through to trap/stronger.
 *
 * After ANY rule change: replay against server/data/toss_dataset.json
 */

import { computeTossRisk } from './predictionRisk.js'

export const PREDICTOR_VERSION = 'toss-v8-layvol-ratio-gate'

const LAY_VOL_GAP_MIN = 150
const LAY_VOL_RATIO_MIN = 1.5
const LAY_VOL_RATIO_SOFT = 1.25
const CLOSE_TRADE_GAP_MAX = 3

function extractMetrics(snap) {
  const t1 = snap.teamNames?.[0] || 'Team 1'
  const t2 = snap.teamNames?.[1] || 'Team 2'
  const m1 = snap.advancedMetricsV2?.team1 || {}
  const m2 = snap.advancedMetricsV2?.team2 || {}
  const s1 = snap.syntheticSupport?.teamA || {}
  const s2 = snap.syntheticSupport?.teamB || {}
  const syn = snap.syntheticSupport || {}

  const t1Back = m1.back ?? 0
  const t2Back = m2.back ?? 0
  const t1LayVol = m1.lay ?? 0
  const t2LayVol = m2.lay ?? 0
  const t1Total = m1.totalBet ?? 0
  const t2Total = m2.totalBet ?? 0
  const mTotal = t1Total + t2Total
  const t1LoadPct = mTotal > 0 ? t1Total / mTotal : 0.5
  const t2LoadPct = mTotal > 0 ? t2Total / mTotal : 0.5
  const t1LayTrades = s1.tradeCount
    ?? (snap.teams?.[t1]?.trades || []).filter(t => t.type === 'lay').length
  const t2LayTrades = s2.tradeCount
    ?? (snap.teams?.[t2]?.trades || []).filter(t => t.type === 'lay').length

  const bookieFav = snap.marketSignals?.bookieFavouriteOutcome
  const trap = snap.marketSignals?.trap?.level || 'none'
  const strongerTeam = syn.strongerTeam || null
  const supportRatio = syn.supportRatio ?? null

  const layVolGap = Math.abs(t1LayVol - t2LayVol)
  const minLay = Math.min(t1LayVol, t2LayVol)
  const layVolRatio = minLay > 0 ? Math.max(t1LayVol, t2LayVol) / minLay : (Math.max(t1LayVol, t2LayVol) > 0 ? Infinity : 1)
  const layTradeGap = Math.abs(t1LayTrades - t2LayTrades)

  return {
    t1,
    t2,
    t1Back,
    t2Back,
    t1LayVol,
    t2LayVol,
    t1Total,
    t2Total,
    mTotal,
    t1LoadPct,
    t2LoadPct,
    t1LayTrades,
    t2LayTrades,
    bookieFav,
    trap,
    strongerTeam,
    supportRatio,
    layVolGap,
    layVolRatio,
    layTradeGap,
  }
}

const REASON_CONFIDENCE = {
  'Clear Lay Vol Edge': { label: 'High Confidence', color: 'text-profit', pct: 'uncalibrated' },
  'Stronger Support Team': { label: 'Moderate', color: 'text-yellow-500', pct: 'uncalibrated' },
  'Higher Lay Trades': { label: 'Moderate', color: 'text-yellow-500', pct: 'uncalibrated' },
  'Bookie Fav (fallback)': { label: 'Low Confidence', color: 'text-text-muted', pct: 'uncalibrated' },
}

function teamEq(a, b) {
  const na = String(a || '').trim().toLowerCase()
  const nb = String(b || '').trim().toLowerCase()
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

function resolveStronger(m) {
  if (!m.strongerTeam) return null
  if (teamEq(m.strongerTeam, m.t1)) return m.t1
  if (teamEq(m.strongerTeam, m.t2)) return m.t2
  return m.strongerTeam
}

/**
 * Waterfall — first match wins.
 * Encodes LayVol → Stronger → LayTrades. Weak-ratio rupee gaps fall through.
 */
function pickWinner(m, hasBF) {
  const matched = []

  const clearLayVol =
    m.layVolRatio >= LAY_VOL_RATIO_MIN
    || (m.layVolGap >= LAY_VOL_GAP_MIN && m.layVolRatio >= LAY_VOL_RATIO_SOFT)
  if (clearLayVol && m.t1LayVol !== m.t2LayVol) {
    const winner = m.t1LayVol > m.t2LayVol ? m.t1 : m.t2
    matched.push({ winner, reason: 'Clear Lay Vol Edge', pattern: 'CLEAR_LAY_VOL', selected: true })
    return { winner, reason: 'Clear Lay Vol Edge', pattern: 'CLEAR_LAY_VOL', matched }
  }

  const useStronger = m.trap === 'high' || m.layTradeGap <= CLOSE_TRADE_GAP_MAX
  const stronger = resolveStronger(m)
  if (useStronger && stronger) {
    matched.push({
      winner: stronger,
      reason: 'Stronger Support Team',
      pattern: 'STRONGER_SUPPORT',
      selected: true,
    })
    return {
      winner: stronger,
      reason: 'Stronger Support Team',
      pattern: 'STRONGER_SUPPORT',
      matched,
    }
  }

  if (m.t1LayTrades !== m.t2LayTrades) {
    const winner = m.t1LayTrades > m.t2LayTrades ? m.t1 : m.t2
    matched.push({ winner, reason: 'Higher Lay Trades', pattern: 'LAY_TRADES', selected: true })
    return { winner, reason: 'Higher Lay Trades', pattern: 'LAY_TRADES', matched }
  }

  if (hasBF) {
    matched.push({
      winner: m.bookieFav,
      reason: 'Bookie Fav (fallback)',
      pattern: 'BOOKIE_FAV',
      selected: true,
    })
    return {
      winner: m.bookieFav,
      reason: 'Bookie Fav (fallback)',
      pattern: 'BOOKIE_FAV',
      matched,
    }
  }

  return null
}

function buildMatchedSignals(m, winner) {
  const signals = []
  if (m.t1LayVol !== m.t2LayVol) {
    const layWinner = m.t1LayVol > m.t2LayVol ? m.t1 : m.t2
    signals.push({
      reason: 'Higher Lay Vol',
      winner: layWinner,
      priority: teamEq(layWinner, winner) ? 90 : 40,
      selected: teamEq(layWinner, winner),
    })
  }
  if (m.t1LayTrades !== m.t2LayTrades) {
    const tradeWinner = m.t1LayTrades > m.t2LayTrades ? m.t1 : m.t2
    signals.push({
      reason: 'Higher Lay Trades',
      winner: tradeWinner,
      priority: teamEq(tradeWinner, winner) ? 80 : 40,
      selected: teamEq(tradeWinner, winner),
    })
  }
  const stronger = resolveStronger(m)
  if (stronger) {
    signals.push({
      reason: 'Stronger Support Team',
      winner: stronger,
      priority: teamEq(stronger, winner) ? 85 : 40,
      selected: teamEq(stronger, winner),
    })
  }
  return signals
}

function fmtVol(n) {
  if (!n) return '0'
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.round(n).toString()
}

export function predictTossWinner(snap) {
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
  const isLayAbsorbed1 = l1 >= b1 * 1.8 && l1 > l2 && l1 > 200
  const isLayAbsorbed2 = l2 >= b2 * 1.8 && l2 > l1 && l2 > 200

  const totBack = b1 + b2
  const b1Pct = totBack > 0 ? b1 / totBack : 0.5
  const b2Pct = totBack > 0 ? b2 / totBack : 0.5

  const isZeroBack1 = b1 === 0 && b2 > 0
  const isZeroBack2 = b2 === 0 && b1 > 0

  let winner = null
  let reason = ''
  let verdictTag = 'SMART MONEY INFLOW'
  let pattern = 'SMART_BACK_FLOW'

  // 🚨 1. CRITICAL OVERLOAD TRAP (>= 92% One-Sided Load or Ratio >= 10.0x with negative P/L AND opposite side has zero/tiny lay)
  if ((b1Pct >= 0.92 || backRatio >= 10.0) && b1 > b2 && prePnl1 < 0 && l2 <= 100) {
    winner = t2
    verdictTag = 'OVERLOAD TRAP FADE 🚨'
    pattern = 'OVERLOAD_TRAP_FADE'
    reason = `Critical Public Overload on ${t1} (${(b1Pct * 100).toFixed(0)}% Load, ${backRatio.toFixed(1)}x Lead) -> Faded to ${t2}`
  } else if ((b2Pct >= 0.92 || backRatio >= 10.0) && b2 > b1 && prePnl2 < 0 && l1 <= 100) {
    winner = t1
    verdictTag = 'OVERLOAD TRAP FADE 🚨'
    pattern = 'OVERLOAD_TRAP_FADE'
    reason = `Critical Public Overload on ${t2} (${(b2Pct * 100).toFixed(0)}% Load, ${backRatio.toFixed(1)}x Lead) -> Faded to ${t1}`
  }
  // ⚡ 2. ZERO-BACK BOOKIE ADVANTAGE (One team has 0 Back & Bookie gets 100% free profit on it)
  else if (isZeroBack1 && prePnl1 > 0) {
    winner = t1
    verdictTag = 'BOOKIE SAFE ZERO-BACK'
    pattern = 'BOOKIE_SAFE_ZERO_BACK'
    reason = `Bookmaker Pure Profit on ${t1} (Zero Back Exposure, P/L: +${prePnl1.toFixed(1)})`
  } else if (isZeroBack2 && prePnl2 > 0) {
    winner = t2
    verdictTag = 'BOOKIE SAFE ZERO-BACK'
    pattern = 'BOOKIE_SAFE_ZERO_BACK'
    reason = `Bookmaker Pure Profit on ${t2} (Zero Back Exposure, P/L: +${prePnl2.toFixed(1)})`
  }
  // 🏆 3. DUAL CONFIRMATION: Higher Back Inflow AND Positive Bookie P/L
  else if ((b1 > b2 && prePnl1 > prePnl2) || (b2 > b1 && prePnl2 > prePnl1)) {
    winner = b1 > b2 ? t1 : t2
    verdictTag = 'PERFECT ALIGNMENT 🔥'
    pattern = 'DUAL_INFLOW_PNL_ALIGN'
    reason = `Dual Advantage: Higher Back Inflow (₹${fmtVol(Math.max(b1, b2))}) & Positive Bookie P/L (+${Math.max(prePnl1, prePnl2).toFixed(1)})`
  }
  // 🛡️ 4. HEAVY LAY ABSORPTION / BOOKIE SHIELD (P/L > 1500 and Lay > 1.8x Back)
  else if (isLayAbsorbed1 && !isLayAbsorbed2 && prePnl1 > 1500) {
    winner = t1
    verdictTag = 'BOOKMAKER SHIELD'
    pattern = 'BOOKIE_LAY_ABSORPTION'
    reason = `Bookie Lay Shield on ${t1} (Lay: ₹${fmtVol(l1)} vs Back: ₹${fmtVol(b1)}, P/L: +${prePnl1.toFixed(1)})`
  } else if (isLayAbsorbed2 && !isLayAbsorbed1 && prePnl2 > 1500) {
    winner = t2
    verdictTag = 'BOOKMAKER SHIELD'
    pattern = 'BOOKIE_LAY_ABSORPTION'
    reason = `Bookie Lay Shield on ${t2} (Lay: ₹${fmtVol(l2)} vs Back: ₹${fmtVol(b2)}, P/L: +${prePnl2.toFixed(1)})`
  }
  // ⚖️ 5. LOW LIQUIDITY / MICRO BOOKIE SAFE TRAP CATCH
  else if (Math.max(b1, b2) < 500 && prePnl1 > 100 && prePnl2 < -100) {
    winner = t1
    verdictTag = 'BOOKIE SAFE SIDE'
    pattern = 'BOOKIE_MICRO_SAFE'
    reason = `Micro Liquidity Bookie Safe on ${t1} (P/L: +${prePnl1.toFixed(1)} vs ${t2}: ${prePnl2.toFixed(1)})`
  } else if (Math.max(b1, b2) < 500 && prePnl2 > 100 && prePnl1 < -100) {
    winner = t2
    verdictTag = 'BOOKIE SAFE SIDE'
    pattern = 'BOOKIE_MICRO_SAFE'
    reason = `Micro Liquidity Bookie Safe on ${t2} (P/L: +${prePnl2.toFixed(1)} vs ${t1}: ${prePnl1.toFixed(1)})`
  }
  // ⚡ 6. SMART INFLOW LEADER (Dominant Back Volume Lead)
  else if (b1 !== b2 && (b1 > 0 || b2 > 0)) {
    winner = b1 > b2 ? t1 : t2
    verdictTag = backRatio >= 1.4 ? 'SMART INFLOW LEADER' : 'BACK MOMENTUM'
    pattern = backRatio >= 1.4 ? 'SMART_MONEY_FLOW' : 'BACK_MOMENTUM'
    reason = `Smart Money Inflow (${winner}: ₹${fmtVol(Math.max(b1, b2))} Back, Lead: ${backRatio.toFixed(1)}x)`
  }
  // 7. FALLBACK
  else {
    winner = prePnl1 > prePnl2 ? t1 : t2
    verdictTag = 'BOOKIE SAFE'
    pattern = 'BOOKIE_SAFE_PNL'
    reason = `Bookmaker Exposure Safe Side (${winner}: +${Math.max(prePnl1, prePnl2).toFixed(1)} PnL)`
  }

  const winnerIdx = teamEq(winner, t1) ? 0 : 1
  const confidence = verdictTag === 'PERFECT ALIGNMENT 🔥' || verdictTag === 'BOOKMAKER SHIELD' || verdictTag === 'SMART INFLOW LEADER'
    ? { label: 'High Confidence 🔥', color: 'text-profit', pct: '88%' }
    : { label: 'Moderate', color: 'text-yellow-500', pct: '72%' }

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

export default predictTossWinner
