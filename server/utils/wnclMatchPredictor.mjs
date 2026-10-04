import { getDefaultAlgorithmPrediction } from './leagueAlgorithms.mjs';
import { checkPreMatchDataQuality } from './preMatchDataQuality.mjs';

export const WNCL_ALGORITHM = Object.freeze({
  league: "Women's National Cricket League",
  algorithmId: 'match-wncl-prematch-rules-v1',
  // Independent initial profile; no WNCL training history is available yet.
  parameters: Object.freeze({ totalRatio: 1.5, backRatio: 1.4 }),
});
export function isWNCLLeague(name) {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return /^(?:wncl|womensnationalcricketleague|womennationalcricketleague)(?:20\d{2}(?:20\d{2}|\d{2})?)?$/.test(key);
}
export function wnclTeamKey(name) {
  const key = String(name || '').toLowerCase().replace(/\b(women|womens|woman|w|wncl)\b/g, '').replace(/[^a-z0-9]/g, '');
  const aliases = { nsw:'newsouthwales', nswwales:'newsouthwales', nswbreakers:'newsouthwales', qld:'queensland',
    newsouthwalesbreakers:'newsouthwales', queenslandfire:'queensland', tasmaniantigers:'tasmania',
    tasmaniatigers:'tasmania', actmeteors:'act', australiancapitalterritory:'act', sascorpions:'southaustralia',
    southaustraliascorpions:'southaustralia' };
  return aliases[key] || key;
}
export function predictWNCLMatch(snap, parameters = WNCL_ALGORITHM.parameters) {
  if (!checkPreMatchDataQuality(snap).valid) return null;
  const { team1:a, team2:b } = snap.preMatchVolume;
  const prediction = getDefaultAlgorithmPrediction(a.back,b.back,a.lay,b.lay,
    snap.preMatchPnl.team1,snap.preMatchPnl.team2,snap.teamNames[0],snap.teamNames[1],parameters);
  if (!prediction) return null;
  return { ...prediction, tier:`WNCL_${prediction.tier}`, reason:'WNCL frozen pre-match market-flow baseline',
    confidence:'WNCL baseline; accuracy not yet measured' };
}
