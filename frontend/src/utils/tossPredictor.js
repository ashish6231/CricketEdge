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

export function predictTossWinner(snap) {
  if (!snap?.teamNames?.length) return null

  const m = extractMetrics(snap)
  if (m.mTotal <= 0) return null

  const hasBF = m.bookieFav && m.bookieFav !== 'balanced'
  const picked = pickWinner(m, hasBF)
  if (!picked) return null

  const { winner, reason, pattern } = picked
  const winnerIdx = teamEq(winner, m.t1) ? 0 : 1
  const confidence = REASON_CONFIDENCE[reason] || REASON_CONFIDENCE['Bookie Fav (fallback)']

  const fmtPct = (n) => `${(n * 100).toFixed(0)}%`
  const fmtRs = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`

  const signals = [
    {
      label: 'Lay Volume',
      sublabel: pattern === 'CLEAR_LAY_VOL'
        ? `Clear edge (gap ₹${Math.round(m.layVolGap)} / ratio ${m.layVolRatio === Infinity ? '∞' : m.layVolRatio.toFixed(2)})`
        : 'Total lay liability',
      active: pattern === 'CLEAR_LAY_VOL' || reason === 'Clear Lay Vol Edge',
      v1: fmtRs(m.t1LayVol),
      v2: fmtRs(m.t2LayVol),
      winnerWins: m.t1LayVol !== m.t2LayVol
        ? (m.t1LayVol > m.t2LayVol ? winnerIdx === 0 : winnerIdx === 1)
        : null,
    },
    {
      label: 'Stronger Support',
      sublabel: m.strongerTeam
        ? `supportProduct leader${m.supportRatio ? ` (${m.supportRatio.toFixed(2)}×)` : ''}`
        : 'No strongerTeam signal',
      active: pattern === 'STRONGER_SUPPORT',
      v1: teamEq(m.strongerTeam, m.t1) ? '✅ Stronger' : '—',
      v2: teamEq(m.strongerTeam, m.t2) ? '✅ Stronger' : '—',
      winnerWins: m.strongerTeam ? teamEq(m.strongerTeam, winner) : null,
    },
    {
      label: 'Lay Trades',
      sublabel: 'More lay trades = market signal',
      active: pattern === 'LAY_TRADES',
      v1: `${m.t1LayTrades} trades`,
      v2: `${m.t2LayTrades} trades`,
      winnerWins: m.t1LayTrades !== m.t2LayTrades
        ? (m.t1LayTrades > m.t2LayTrades ? winnerIdx === 0 : winnerIdx === 1)
        : null,
    },
    {
      label: 'Market Load',
      sublabel: 'Total bet volume share',
      active: false,
      v1: `${fmtPct(m.t1LoadPct)} (${fmtRs(m.t1Total)})`,
      v2: `${fmtPct(m.t2LoadPct)} (${fmtRs(m.t2Total)})`,
      winnerWins: m.t1Total >= m.t2Total ? winnerIdx === 0 : winnerIdx === 1,
    },
    {
      label: 'Bookie Favourite',
      sublabel: hasBF ? `Market expects ${m.bookieFav}` : 'No clear favourite',
      active: pattern === 'BOOKIE_FAV',
      v1: m.bookieFav === m.t1 ? '✅ Fav' : '—',
      v2: m.bookieFav === m.t2 ? '✅ Fav' : '—',
      winnerWins: hasBF ? teamEq(m.bookieFav, winner) : null,
    },
    {
      label: 'Trap Signal',
      sublabel: m.trap === 'high' ? 'Public overload detected' : 'Normal market',
      active: pattern === 'STRONGER_SUPPORT' && m.trap === 'high',
      v1: m.trap === 'high' ? 'High' : 'Normal',
      v2: '',
      winnerWins: pattern === 'STRONGER_SUPPORT' ? true : null,
    },
  ]

  const unionSignals = buildMatchedSignals(m, winner)
  const matchedRules = [
    {
      reason,
      winner,
      priority: 100,
      selected: true,
    },
    ...unionSignals.filter(s => s.reason !== reason),
  ]

  return {
    winnerName: winner,
    winnerIdx,
    reason,
    pattern,
    predictorVersion: PREDICTOR_VERSION,
    confidence,
    risk: computeTossRisk(reason, matchedRules),
    signals,
    activeSignals: signals.filter(s => s.active).length,
    metrics: m,
    matchedRules,
  }
}

export default predictTossWinner
