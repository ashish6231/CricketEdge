/**
 * Gated fade pick — exposure first, then P/L when both sides are negative.
 *
 * 1. One team clearly negative exposure, the other positive → pick the negative team.
 * 2. Both negative → pick higher bookie P/L (more profit); tie-break with more-negative exposure.
 * 3. Both positive → fade the lower-exposure team (no skip banner).
 * Trap ≠ none still skips the take.
 */

import { getBookiePl, getTeamMetrics, splitMatchOutcomes } from './bookiePl.js'

function norm(s) {
  return String(s || '').trim().toLowerCase()
}

export function teamEq(a, b) {
  const na = norm(a)
  const nb = norm(b)
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na))
}

function blRatio(metrics) {
  const back = metrics?.back ?? 0
  const lay = metrics?.lay ?? 0
  if (!(lay > 0)) return null
  return back / lay
}

function netExposureFor(snap, teamName) {
  if (!teamName) return null
  const exp = snap?.bookmakerExposure || {}
  for (const key of ['team1', 'team2', 'draw']) {
    const row = exp[key]
    if (row && teamEq(row.teamName, teamName) && typeof row.netExposure === 'number') {
      return row.netExposure
    }
  }
  const { t1, t2 } = splitMatchOutcomes(snap?.teamNames)
  if (teamEq(teamName, t1) && typeof exp.team1?.netExposure === 'number') return exp.team1.netExposure
  if (teamEq(teamName, t2) && typeof exp.team2?.netExposure === 'number') return exp.team2.netExposure
  return null
}

function plGreenFromNegExp(t1, t2, e1, e2, pl1, pl2) {
  const t1Ok = typeof e1 === 'number' && e1 < 0 && typeof pl1 === 'number' && pl1 > 0
  const t2Ok = typeof e2 === 'number' && e2 < 0 && typeof pl2 === 'number' && pl2 > 0
  if (t1Ok && !t2Ok) return t1
  if (t2Ok && !t1Ok) return t2
  if (t1Ok && t2Ok) {
    if (pl1 !== pl2) return pl1 > pl2 ? t1 : t2
    return null
  }
  return null
}

function pickFromExposureAndPl(t1, t2, e1, e2, pl1, pl2) {
  if (typeof e1 !== 'number' || typeof e2 !== 'number') {
    return { pick: null, reason: 'Need both net exposures' }
  }

  const t1Neg = e1 < 0
  const t2Neg = e2 < 0

  if (t1Neg && !t2Neg) {
    return { pick: t1, reason: 'Only T1 negative exposure' }
  }
  if (t2Neg && !t1Neg) {
    return { pick: t2, reason: 'Only T2 negative exposure' }
  }

  if (t1Neg && t2Neg) {
    if (pl1 != null && pl2 != null && pl1 !== pl2) {
      return {
        pick: pl1 > pl2 ? t1 : t2,
        reason: 'Both neg exp → higher P/L',
      }
    }
    if (e1 !== e2) {
      return {
        pick: e1 < e2 ? t1 : t2,
        reason: 'Both neg exp → lower exposure',
      }
    }
    return { pick: null, reason: 'Both neg exp tied' }
  }

  if (e1 !== e2) {
    return {
      pick: e1 < e2 ? t1 : t2,
      reason: 'Both pos exp → lower exposure',
    }
  }
  return { pick: null, reason: 'Both exposures tied' }
}

/**
 * @returns {null | {
 *   status: 'take' | 'skip',
 *   winnerName: string | null,
 *   publicTeam: string | null,
 *   trap: string,
 *   reason: string,
 *   backtest: { label: string, pct: string, sample: string },
 *   confirms: { negExposure: boolean, plGreen: boolean, lowerRatio: boolean, totGap: boolean },
 *   plGreenTeam: string | null,
 *   lowerRatioTeam: string | null,
 *   totGapPct: number | null,
 *   fadeExposure: number | null,
 *   publicExposure: number | null,
 * }}
 */
export function predictGatedFade(snap) {
  if (!snap?.teamNames?.length) return null

  const { t1, t2 } = splitMatchOutcomes(snap.teamNames)
  const trap = snap.marketSignals?.trap?.level || 'none'
  const moreBetted = snap.marketSignals?.moreBettedTeam
  const publicTeam = moreBetted && moreBetted !== 'balanced' ? moreBetted : null

  const e1 = netExposureFor(snap, t1)
  const e2 = netExposureFor(snap, t2)
  const { pl1, pl2 } = getBookiePl(snap, t1, t2)
  const { pick: winnerName, reason: pickReason } = pickFromExposureAndPl(t1, t2, e1, e2, pl1, pl2)

  const fadeExposure = winnerName ? netExposureFor(snap, winnerName) : null
  const publicExposure = netExposureFor(snap, publicTeam)
  const negExposure = typeof fadeExposure === 'number' && fadeExposure < 0

  const plGreenTeam = plGreenFromNegExp(t1, t2, e1, e2, pl1, pl2)

  const r1 = blRatio(getTeamMetrics(snap, 0))
  const r2 = blRatio(getTeamMetrics(snap, 1))
  const lowerRatioTeam = r1 != null && r2 != null && r1 !== r2
    ? (r1 < r2 ? t1 : t2)
    : null

  const m1 = getTeamMetrics(snap, 0)
  const m2 = getTeamMetrics(snap, 1)
  const totSum = (m1.totalBet || 0) + (m2.totalBet || 0)
  const totGapPct = totSum > 0
    ? Math.abs((m1.totalBet || 0) - (m2.totalBet || 0)) / totSum
    : null

  const confirms = {
    negExposure,
    plGreen: !!(winnerName && plGreenTeam && teamEq(winnerName, plGreenTeam)),
    lowerRatio: !!(winnerName && lowerRatioTeam && teamEq(winnerName, lowerRatioTeam)),
    totGap: totGapPct != null && totGapPct >= 0.15,
  }

  const shared = {
    winnerName,
    publicTeam,
    t1,
    t2,
    trap,
    confirms,
    plGreenTeam,
    lowerRatioTeam,
    totGapPct,
    fadeExposure,
    publicExposure,
    t1Exposure: e1,
    t2Exposure: e2,
  }

  if (!winnerName) {
    return {
      ...shared,
      status: 'skip',
      reason: pickReason,
      backtest: { label: 'Need negative exposure', pct: '—', sample: 'split-sign or both-neg P/L' },
    }
  }

  if (trap !== 'none') {
    return {
      ...shared,
      status: 'skip',
      reason: 'Trap high — no pick',
      backtest: { label: 'Skip trap≠none', pct: '—', sample: 'when trap=none' },
    }
  }

  return {
    ...shared,
    status: 'take',
    reason: pickReason,
    backtest: { label: 'Exposure + P/L pick', pct: '—', sample: 'neg exp, or both-neg via P/L' },
  }
}

export default predictGatedFade
