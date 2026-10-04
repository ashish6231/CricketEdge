import { getDefaultAlgorithmPrediction } from './leagueAlgorithms.mjs';
import { checkPreMatchDataQuality } from './preMatchDataQuality.mjs';

export const EMIRATES_D10_ALGORITHM = Object.freeze({
  league: 'Emirates D10 League',
  algorithmId: 'match-emirates-d10-prematch-rules-v1',
  // Independent starting profile. No D10 market-history training samples yet.
  parameters: Object.freeze({ totalRatio: 1.5, backRatio: 1.4 }),
});

export function isEmiratesD10League(name) {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return /^(?:emiratesd10(?:league|tournament)?|dafanewsd10|uaeemiratesd10|d10)(?:20\d{2})?$/.test(key);
}

export function predictEmiratesD10Match(snap, parameters = EMIRATES_D10_ALGORITHM.parameters) {
  if (!checkPreMatchDataQuality(snap).valid) return null;
  const { team1: a, team2: b } = snap.preMatchVolume;
  const prediction = getDefaultAlgorithmPrediction(
    a.back, b.back, a.lay, b.lay,
    snap.preMatchPnl.team1, snap.preMatchPnl.team2,
    snap.teamNames[0], snap.teamNames[1], parameters,
  );
  if (!prediction) return null;
  return { ...prediction, tier: `EMIRATES_D10_${prediction.tier}`,
    reason: 'Emirates D10 frozen pre-match market-flow baseline',
    confidence: 'D10 baseline; accuracy not yet measured',
  };
}
