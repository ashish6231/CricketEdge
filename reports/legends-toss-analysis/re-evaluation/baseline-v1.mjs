/**
 * World Championship of Legends toss rules, fitted to 8 archived outcomes.
 * Thresholds were selected after seeing results; future accuracy is uncalibrated.
 * This module reads market inputs only, never result labels or match IDs.
 */
export const WORLD_LEGENDS_TOSS_VERSION = 'toss-world-legends-exposure-lay-v1'
export const WORLD_LEGENDS_TOSS_PARAMETERS = Object.freeze({
  layBackResistance: 0.10,
  zeroLayBackLead: 3,
})

export function isWorldLegendsTossLeague(name = '') {
  const comp = String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return /\bworld championship of legends\b/.test(comp)
    || /^wcl(?: t20)?(?: 20\d{2})?$/.test(comp)
}

export function getWorldLegendsTossPrediction(snap) {
  const metadata = {
    tier: 'WORLD_LEGENDS_TOSS_EXPOSURE_LAY',
    algoName: 'World Legends Exposure & Lay Toss Algorithm',
    predictorVersion: WORLD_LEGENDS_TOSS_VERSION,
    validation: 'in-sample-fit-only',
    trainingSamples: 8,
    holdoutSamples: 0,
  }
  const abstain = reason => ({ ...metadata, winner: null, abstain: true, reason })
  const names = snap?.teamNames
  if (!Array.isArray(names) || names.length !== 2 || !names.every(name => typeof name === 'string' && name.trim())
    || names[0].trim().toLowerCase() === names[1].trim().toLowerCase()) return abstain('Two distinct teams are required.')

  const sides = [0, 1].map(index => {
    const key = `team${index + 1}`
    const volume = snap.preMatchVolume?.[key]
    const exposure = snap.bookmakerExposure?.[key]
    return { team: names[index], back: volume?.back, lay: volume?.lay,
      pnl: snap.preMatchPnl?.[key], netExposure: exposure?.netExposure, exposureTeam: exposure?.teamName }
  })
  if (sides.some(side => ![side.back, side.lay, side.pnl, side.netExposure].every(Number.isFinite)
    || side.back < 0 || side.lay < 0)) return abstain('Usable back, lay, P/L and net exposure are required for both teams.')
  const normalized = name => String(name).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (sides.some(side => side.exposureTeam && normalized(side.exposureTeam) !== normalized(side.team))) {
    return abstain('Exposure participants do not match the toss market.')
  }
  if (sides[0].netExposure === sides[1].netExposure) return abstain('Net exposure is tied.')
  const leader = sides[0].netExposure > sides[1].netExposure ? sides[0] : sides[1]
  const other = sides.find(side => side !== leader)
  if (!(leader.netExposure > 0 && leader.pnl < 0 && other.pnl > 0 && leader.back > 0)) {
    return abstain('Higher positive exposure and negative P/L do not align.')
  }

  const layBackRatio = leader.lay / leader.back
  const bothZeroLay = leader.lay === 0 && other.lay === 0
  const backLead = other.back > 0 ? leader.back / other.back : null
  let winner = leader.team
  let pattern = 'WORLD_LEGENDS_EXPOSURE_AND_NEGATIVE_PL'
  let reason = `${leader.team} has higher positive net exposure (${leader.netExposure.toFixed(2)}) and negative P/L (${leader.pnl.toFixed(2)}); opponent P/L is positive.`
  if (layBackRatio >= WORLD_LEGENDS_TOSS_PARAMETERS.layBackResistance) {
    winner = other.team
    pattern = 'WORLD_LEGENDS_HIGH_LAY_RELATIVE_TO_BACK'
    reason = `${leader.team} has ${(layBackRatio * 100).toFixed(2)}% lay/back (at least 10%); the Legends exception selects ${winner}.`
  } else if (bothZeroLay && backLead !== null && backLead < WORLD_LEGENDS_TOSS_PARAMETERS.zeroLayBackLead) {
    winner = other.team
    pattern = 'WORLD_LEGENDS_ZERO_LAY_MODERATE_BACK_LEAD'
    reason = `Both lays are zero and ${leader.team}'s back lead is ${backLead.toFixed(2)}x (below 3x); the Legends exception selects ${winner}.`
  }
  return { ...metadata, winner, pattern, reason, verdictTag: 'WORLD LEGENDS EXPOSURE / LAY RULE',
    confidence: { label: 'League rule; future accuracy uncalibrated', color: 'text-yellow-500', pct: 'Uncalibrated', calibrated: false },
    evidence: { exposureLeader: leader.team, leaderExposure: leader.netExposure,
      otherExposure: other.netExposure, leaderPnl: leader.pnl, otherPnl: other.pnl,
      layBackRatio, backLead, bothZeroLay },
  }
}
