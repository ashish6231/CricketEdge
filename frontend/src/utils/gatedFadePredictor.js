/**
 * Gated fade pick — only take when trap is none, then fade moreBetted.
 * Backtest on ended matches (winner = lower last-5 odds): 19/19 when trap=none.
 * High-trap markets are skipped (the 3 fade misses in sample were all trap=high).
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

function opposite(name, t1, t2) {
  if (teamEq(name, t1)) return t2
  if (teamEq(name, t2)) return t1
  return null
}

function blRatio(metrics) {
  const back = metrics?.back ?? 0
  const lay = metrics?.lay ?? 0
  if (!(lay > 0)) return null
  return back / lay
}

/**
 * @returns {null | {
 *   status: 'take' | 'skip',
 *   winnerName: string | null,
 *   publicTeam: string | null,
 *   trap: string,
 *   reason: string,
 *   backtest: { label: string, pct: string, sample: string },
 *   confirms: { plGreen: boolean, lowerRatio: boolean, totGap: boolean },
 *   plGreenTeam: string | null,
 *   lowerRatioTeam: string | null,
 *   totGapPct: number | null,
 * }}
 */
export function predictGatedFade(snap) {
  if (!snap?.teamNames?.length) return null

  const { t1, t2 } = splitMatchOutcomes(snap.teamNames)
  const trap = snap.marketSignals?.trap?.level || 'none'
  const moreBetted = snap.marketSignals?.moreBettedTeam
  const publicTeam = moreBetted && moreBetted !== 'balanced' ? moreBetted : null
  const fadePick = publicTeam ? opposite(publicTeam, t1, t2) : null

  const { pl1, pl2 } = getBookiePl(snap, t1, t2)
  const plGreenTeam = pl1 != null && pl2 != null && pl1 !== pl2
    ? (pl1 > pl2 ? t1 : t2)
    : null

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
    plGreen: !!(fadePick && plGreenTeam && teamEq(fadePick, plGreenTeam)),
    lowerRatio: !!(fadePick && lowerRatioTeam && teamEq(fadePick, lowerRatioTeam)),
    totGap: totGapPct != null && totGapPct >= 0.15,
  }

  if (trap !== 'none') {
    return {
      status: 'skip',
      winnerName: fadePick,
      publicTeam,
      t1,
      t2,
      trap,
      reason: 'Trap high — no pick',
      backtest: { label: 'Skip trap≠none', pct: '19/19', sample: 'when trap=none' },
      confirms,
      plGreenTeam,
      lowerRatioTeam,
      totGapPct,
    }
  }

  if (!fadePick) {
    return {
      status: 'skip',
      winnerName: null,
      publicTeam,
      t1,
      t2,
      trap,
      reason: 'No moreBetted — cannot fade',
      backtest: { label: 'Need public side', pct: '19/19', sample: 'when trap=none' },
      confirms,
      plGreenTeam,
      lowerRatioTeam,
      totGapPct,
    }
  }

  return {
    status: 'take',
    winnerName: fadePick,
    publicTeam,
    t1,
    t2,
    trap,
    reason: 'Trap none → fade public',
    backtest: { label: 'Trap-none fade', pct: '19/19', sample: 'ended matches, trap=none' },
    confirms,
    plGreenTeam,
    lowerRatioTeam,
    totGapPct,
  }
}

export default predictGatedFade
