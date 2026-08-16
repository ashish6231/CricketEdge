/**
 * Spoofing Detector — cumulative fake/unmatched order volume.
 *
 * Uses advancedMetricsV2 back/lay (includes canceled/spoofed orders, not just trades).
 * Formula: matched = min(back, lay); fake = excess on each side.
 *
 * Note: advancedMetrics (v1) equals trades sum only — wrong for spoofing on large matches.
 */

import { getTeamMetrics, splitMatchOutcomes } from './bookiePl'

export function calcFakeVolume(backVol = 0, layVol = 0) {
  const matched = Math.min(backVol, layVol)
  const fakeBack = backVol - matched
  const fakeLay = layVol - matched
  return { fakeBack, fakeLay, oppFakeLay: fakeLay, total: fakeBack + fakeLay }
}

/** Full spoofing breakdown for both teams */
export function getSpoofingMetrics(snap) {
  const { t1, t2 } = splitMatchOutcomes(snap?.teamNames)
  const m1 = getTeamMetrics(snap, 0)
  const m2 = getTeamMetrics(snap, 1)

  const t1Fake = calcFakeVolume(m1.back, m1.lay)
  const t2Fake = calcFakeVolume(m2.back, m2.lay)
  const totalFake = t1Fake.total + t2Fake.total
  const t1Pct = totalFake > 0 ? (t1Fake.total / totalFake) * 100 : 50
  const t2Pct = 100 - t1Pct
  const mostFakeTeam = t1Fake.total >= t2Fake.total ? t1 : t2

  return { t1, t2, t1Fake, t2Fake, t1Pct, t2Pct, mostFakeTeam, source: 'advancedMetricsV2' }
}

export default getSpoofingMetrics
