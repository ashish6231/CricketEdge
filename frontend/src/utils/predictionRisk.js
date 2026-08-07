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
  'Smart Money Trap': 'low',
  'Zero Lay Trap': 'low',
  'Volume Trap — Bookie Fav': 'low',
  'Smart Lay Vol (load fav trap)': 'low',
  'Balanced Market — Bookie Fav': 'medium',
  'Higher Lay Trades': 'medium',
  'Higher Lay Vol': 'high',
  'Bookie Fav (fallback)': 'high',
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

export function computeMatchStartRisk(reason, { publicOverridden = false, msDisagreesPublic = false } = {}) {
  if (publicOverridden) return { ...RISK_TIERS.high, reason, note: 'API public override' }
  if (reason === 'Fade Public Money' && msDisagreesPublic) {
    return { ...RISK_TIERS.low, reason }
  }
  const tier = MATCH_START_REASON_TIER[reason] || 'high'
  return { ...RISK_TIERS[tier], reason }
}
