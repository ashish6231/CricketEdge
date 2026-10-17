/**
 * World Championship of Legends toss rules, fitted to 8 verified archived
 * outcomes and 1 user-reported outcome. There is no independent test set.
 * Thresholds were selected after seeing results; future accuracy is uncalibrated.
 * This module reads market inputs only, never result labels or match IDs.
 */
export const WORLD_LEGENDS_TOSS_VERSION = 'toss-world-legends-support-activity-v3'
export const WORLD_LEGENDS_TOSS_PARAMETERS = Object.freeze({
  layBackResistance: 0.10,
  highLayMinBackLead: 3,
})

export function isWorldLegendsTossLeague(name = '') {
  const comp = String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return /\bworld championship of legends\b/.test(comp)
    || /^wcl(?: t20)?(?: 20\d{2})?$/.test(comp)
}

export function getWorldLegendsTossPrediction(snap) {
  const metadata = {
    tier: 'WORLD_LEGENDS_TOSS_SUPPORT_ACTIVITY',
    algoName: 'World Legends Support & Activity Toss Algorithm',
    predictorVersion: WORLD_LEGENDS_TOSS_VERSION,
    validation: 'in-sample-fit-only',
    trainingSamples: 9,
    trainingVerifiedSamples: 8,
    trainingUserReportedSamples: 1,
    holdoutSamples: 0,
    validationNote: 'Retrospective fit: 8 verified archived tosses and 1 user-reported outcome; 2 abandoned tosses excluded; no independent pre-toss validation.',
  }
  const abstain = reason => ({ ...metadata, winner: null, abstain: true, reason })
  const names = snap?.teamNames
  if (!Array.isArray(names) || names.length !== 2 || !names.every(name => typeof name === 'string' && name.trim())
    || names[0].trim().toLowerCase() === names[1].trim().toLowerCase()) return abstain('Two distinct teams are required.')

  const sides = [0, 1].map(index => {
    const key = `team${index + 1}`
    const volume = snap.preMatchVolume?.[key]
    return { team: names[index], back: volume?.back, lay: volume?.lay,
      activity: snap.preMatchTotalBets?.[key] }
  })
  if (sides.some(side => ![side.back, side.lay, side.activity]
    .every(value => Number.isFinite(value) && value >= 0))) {
    return abstain('Usable back, lay and pre-match activity are required for both teams.')
  }
  const support1 = sides[0].back + sides[1].lay
  const support2 = sides[1].back + sides[0].lay
  const supportTotal = support1 + support2
  const activityTotal = sides[0].activity + sides[1].activity
  if (![supportTotal, activityTotal].every(total => Number.isFinite(total) && total > 0)) {
    return abstain('Corrected support and activity totals must be positive and finite.')
  }
  if (support1 === support2 || sides[0].activity === sides[1].activity) {
    return abstain('Corrected support or pre-match activity is tied.')
  }
  const supportIdx = support1 > support2 ? 0 : 1
  const activityIdx = sides[0].activity > sides[1].activity ? 0 : 1
  if (supportIdx !== activityIdx) return abstain('Corrected support and pre-match activity favor different teams.')
  const leader = sides[supportIdx], other = sides[1 - supportIdx]
  const support = { team1: support1, team2: support2,
    pct1: support1 / supportTotal * 100, pct2: support2 / supportTotal * 100, leaderIdx: supportIdx }
  const activity = { team1: sides[0].activity, team2: sides[1].activity,
    pct1: sides[0].activity / activityTotal * 100, pct2: sides[1].activity / activityTotal * 100, leaderIdx: activityIdx }

  const layBackRatio = leader.back > 0 ? leader.lay / leader.back : null
  const bothZeroLay = leader.lay === 0 && other.lay === 0
  const backLead = other.back > 0 ? leader.back / other.back : null
  const highLayResistance = layBackRatio !== null && layBackRatio >= WORLD_LEGENDS_TOSS_PARAMETERS.layBackResistance
  // High relative lay alone also occurs in fairly balanced markets. Require
  // back dominance as well before reversing the support/activity selection.
  // Zero opposing back is complete dominance, represented without Infinity.
  const highLayBackDominance = leader.back > 0 && (other.back === 0 || backLead >= WORLD_LEGENDS_TOSS_PARAMETERS.highLayMinBackLead)
  let winner = leader.team
  let pattern = 'WORLD_LEGENDS_SUPPORT_ACTIVITY_CONSENSUS'
  let reason = `${leader.team} leads corrected support (${(supportIdx === 0 ? support.pct1 : support.pct2).toFixed(2)}%) and pre-match activity (${(activityIdx === 0 ? activity.pct1 : activity.pct2).toFixed(2)}%); both signals agree.`
  if (highLayResistance && highLayBackDominance) {
    winner = other.team
    pattern = 'WORLD_LEGENDS_HIGH_LAY_AND_BACK_DOMINANCE'
    const leadText = backLead === null ? 'no opposing back volume' : `${backLead.toFixed(2)}x back lead (at least ${WORLD_LEGENDS_TOSS_PARAMETERS.highLayMinBackLead}x)`
    reason = `${leader.team} has ${(layBackRatio * 100).toFixed(2)}% lay/back (at least ${WORLD_LEGENDS_TOSS_PARAMETERS.layBackResistance * 100}%) and ${leadText}; the Legends exception selects ${winner}.`
  } else if (bothZeroLay) {
    winner = other.team
    pattern = 'WORLD_LEGENDS_BOTH_ZERO_LAY'
    reason = `Both matched lay stakes are zero; the Legends exception reverses the support/activity selection (${leader.team}) to ${winner}.`
  } else if (highLayResistance) {
    reason += ` Lay/back is ${(layBackRatio * 100).toFixed(2)}%, but the ${backLead.toFixed(2)}x back lead is below ${WORLD_LEGENDS_TOSS_PARAMETERS.highLayMinBackLead}x, so the high-lay exception does not apply.`
  }
  return { ...metadata, winner, pattern, reason, verdictTag: 'WORLD LEGENDS SUPPORT / ACTIVITY RULE',
    confidence: { label: 'League rule; future accuracy uncalibrated', color: 'text-yellow-500', pct: 'Uncalibrated', calibrated: false },
    evidence: { baselineLeader: leader.team, baselineIdx: supportIdx, support, activity,
      layBackRatio, backLead, bothZeroLay, highLayResistance, highLayBackDominance,
      highLayExceptionApplied: highLayResistance && highLayBackDominance,
      zeroLayExceptionApplied: bothZeroLay, inputSource: 'toss-pre-match' },
  }
}
