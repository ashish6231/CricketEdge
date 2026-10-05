/** Shared risk tiers for toss + match-start picks */

export const RISK_TIERS = {
  low: {
    tier: 'low',
    label: 'Low Risk',
    shortLabel: 'Low',
    color: 'text-[#22c55e]',
    hex: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.35)',
    emoji: '🟢',
    wrongPct: '~10–15%',
  },
  medium: {
    tier: 'medium',
    label: 'Medium Risk',
    shortLabel: 'Medium',
    color: 'text-[#eab308]',
    hex: '#eab308',
    bg: 'rgba(234,179,8,0.12)',
    border: 'rgba(234,179,8,0.35)',
    emoji: '🟡',
    wrongPct: '~20–27%',
  },
  high: {
    tier: 'high',
    label: 'High Risk',
    shortLabel: 'High',
    color: 'text-[#ef4444]',
    hex: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.35)',
    emoji: '🔴',
    wrongPct: '~35–45%',
    avoidEntry: true,
  },
}

const TOSS_REASON_TIER = {
  'Clear Lay Vol Edge': 'low',
  'Stronger Support Team': 'medium',
  'Higher Lay Trades': 'medium',
  'Bookie Fav (fallback)': 'high',
  // legacy reasons (older captures / UI)
  'Smart Money Trap': 'low',
  'Zero Lay Trap': 'low',
  'Higher Lay Vol': 'high',
}

const MATCH_START_REASON_TIER = {
  'Fade Public (MS confirms)': 'low',
  'Fade Public Money': 'medium',
  'Smart Money Trap': 'medium',
  'Market Signals AI': 'high',
  'Pre-Match Odds Favorite': 'high',
  'Pre-Match Back Volume': 'high',
  'Bookie Favourite': 'high',
  'Pre-Match Odds': 'high',
}

function hasConflictingRules(matchedRules) {
  if (!matchedRules?.length || matchedRules.length < 2) return false
  const winners = new Set(matchedRules.map((r) => r.winner))
  return winners.size > 1
}

export function computeTossRisk(reason, matchedRules = []) {
  let tier = TOSS_REASON_TIER[reason] || 'medium'
  if (hasConflictingRules(matchedRules) && tier === 'low') tier = 'medium'
  return { ...RISK_TIERS[tier], reason }
}

export function computeMatchStartRisk(
  reason,
  {
    publicOverridden = false,
    msDisagreesPublic = false,
    extremeDogFade = false,
    leagueRegistered = true,
    validation = null,
    trainingSamples = 0,
  } = {},
) {
  if (extremeDogFade) {
    return {
      ...RISK_TIERS.high,
      reason,
      note: 'Heavy underdog fade — favourite decimal odds 1.30–1.45 ke paas hai',
      avoidEntry: true,
    }
  }
  if (!leagueRegistered) {
    return { ...RISK_TIERS.high, reason, note: 'Is league ke liye dedicated algorithm available nahi hai', avoidEntry: true }
  }
  // `marketSignals` is refreshed during play, while this badge describes the
  // locked pre-match pick. A later disagreement must be shown as a live
  // reversal, not used to rewrite every start pick as high risk.
  if (publicOverridden) return { ...RISK_TIERS.medium, reason, note: 'Public-team feed ko frozen pre-match flow ne override kiya' }
  if (reason === 'Fade Public Money' && msDisagreesPublic) {
    return { ...RISK_TIERS.low, reason }
  }
  const weakMoneyShare = reason?.match(/Money Leader \((\d+)% Share\)/i)
  if (weakMoneyShare && Number(weakMoneyShare[1]) < 55) {
    return { ...RISK_TIERS.high, reason, note: 'Pre-match money split almost even hai', avoidEntry: true }
  }
  if (validation === 'retrospective-development-checks' && trainingSamples >= 10) {
    return {
      ...RISK_TIERS.low,
      reason,
      note: `${trainingSamples} verified league matches par historical checks available hain`,
    }
  }
  const tier = MATCH_START_REASON_TIER[reason] || 'medium'
  return { ...RISK_TIERS[tier], reason }
}
