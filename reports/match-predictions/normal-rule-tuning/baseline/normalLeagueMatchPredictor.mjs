import { getLeagueAlgorithmPrediction, getDefaultAlgorithmPrediction } from './leagueAlgorithms.mjs';

export const PREDICTOR_VERSION = 'match-v3-normal-league-rules';
export const DEFAULT_MATCH_MODE = 'rules';
const normalize = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Separate league entries and parameter objects permit independent changes.
// Existing specialist rules are preserved; leagues without a specialist start
// with their own copy of the common market-rule profile, not a fitted tree.
export const LEAGUE_MATCH_ALGORITHMS = Object.freeze([
  { league: "ACC Men's Premier Cup", algorithmId: "match-acc-men-s-premier-cup-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Asian Games Men", algorithmId: "match-asian-games-men-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Asian Games T20", algorithmId: "match-asian-games-t20-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Asian Games Women", algorithmId: "match-asian-games-women-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Australia One Day Cup", algorithmId: "match-australia-one-day-cup-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "CSA One-Day Challenge Div 2", algorithmId: "match-csa-one-day-challenge-div-2-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Caribbean Premier League", algorithmId: "match-caribbean-premier-league-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Delhi Premier League", algorithmId: "match-delhi-premier-league-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "European T20 Premier League", algorithmId: "match-european-t20-premier-league-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "First Class Matches", algorithmId: "match-first-class-matches-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "ILT20 Development Tournament", algorithmId: "match-ilt20-development-tournament-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "International Twenty20 Matches", algorithmId: "match-international-twenty20-matches-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Kerala Cricket League", algorithmId: "match-kerala-cricket-league-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Metro Bank One Day Cup", algorithmId: "match-metro-bank-one-day-cup-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Metro Bank Womens One Day Cup", algorithmId: "match-metro-bank-womens-one-day-cup-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Netherlands Topklasse T20", algorithmId: "match-netherlands-topklasse-t20-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "One Day Internationals", algorithmId: "match-one-day-internationals-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "One Day Matches", algorithmId: "match-one-day-matches-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Sher E Punjab T20 League", algorithmId: "match-sher-e-punjab-t20-league-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "South Africa T20 Challenge", algorithmId: "match-south-africa-t20-challenge-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "T20 African Continental Cup", algorithmId: "match-t20-african-continental-cup-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "T20 Matches", algorithmId: "match-t20-matches-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Tamil Nadu Premier League", algorithmId: "match-tamil-nadu-premier-league-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Test Matches", algorithmId: "match-test-matches-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "The Hundred", algorithmId: "match-the-hundred-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "The Hundred - Womens", algorithmId: "match-the-hundred-womens-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Unofficial International Matches", algorithmId: "match-unofficial-international-matches-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Uttar Pradesh Premier League", algorithmId: "match-uttar-pradesh-premier-league-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Uttarakhand Premier League", algorithmId: "match-uttarakhand-premier-league-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Women's Asia Cup T20", algorithmId: "match-women-s-asia-cup-t20-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Women's Caribbean Premier League", algorithmId: "match-women-s-caribbean-premier-league-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Women's One Day Matches", algorithmId: "match-women-s-one-day-matches-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Women's T20 County Cup", algorithmId: "match-women-s-t20-county-cup-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Womens International Twenty20 Matches", algorithmId: "match-womens-international-twenty20-matches-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Womens One Day Internationals", algorithmId: "match-womens-one-day-internationals-rules-v1", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
].map(entry => Object.freeze({ ...entry, parameters: Object.freeze(entry.parameters) })));
const registry = new Map(LEAGUE_MATCH_ALGORITHMS.map(entry => [normalize(entry.league), entry]));
const aliases = {
  t20i: 'International Twenty20 Matches',
  'internationalt20matches': 'International Twenty20 Matches',
  cpl: 'Caribbean Premier League', wcpl: "Women's Caribbean Premier League",
  tnpl: 'Tamil Nadu Premier League', upt20: 'Uttar Pradesh Premier League',
  dpl: 'Delhi Premier League',
};
export function getLeagueMatchAlgorithm(name) {
  const key = normalize(name);
  return registry.get(key) || registry.get(normalize(aliases[key])) || null;
}
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function predictNormalLeagueMatch(snap) {
  if (!Array.isArray(snap?.teamNames) || snap.teamNames.length < 2) return null;
  const [team1, team2] = snap.teamNames;
  const v1 = snap.preMatchVolume?.team1 || {}, v2 = snap.preMatchVolume?.team2 || {};
  const b1 = nonnegative(v1.back), b2 = nonnegative(v2.back);
  const l1 = nonnegative(v1.lay), l2 = nonnegative(v2.lay);
  if (b1 + b2 + l1 + l2 === 0) return null;
  const pnl1 = finite(snap.preMatchPnl?.team1) ?? l1 - b1 + b2 - l2;
  const pnl2 = finite(snap.preMatchPnl?.team2) ?? l2 - b2 + b1 - l1;
  const algorithm = getLeagueMatchAlgorithm(snap.competitionName);
  const leagueName = algorithm?.league || snap.competitionName || '';
  const rules = { ...algorithm?.parameters, explicitLeagueOnly: true };
  const specialist = getLeagueAlgorithmPrediction(leagueName, b1, b2, l1, l2, pnl1, pnl2, team1, team2, snap, rules);
  const prediction = specialist || getDefaultAlgorithmPrediction(b1, b2, l1, l2, pnl1, pnl2, team1, team2, rules);
  if (!prediction || ![team1, team2].includes(prediction.winner)) return null;
  return {
    ...prediction, winnerIdx: prediction.winner === team1 ? 0 : 1,
    reason: prediction.reason || prediction.confidence || 'League market rule',
    predictorVersion: PREDICTOR_VERSION,
    algorithmId: algorithm?.algorithmId || 'match-unregistered-league-fallback',
    algorithmLeague: algorithm?.league || null,
    leagueRegistered: !!algorithm, ruleFamily: specialist ? 'league-specialist' : 'market-flow',
    confidence: /%/.test(prediction.confidence || '') ? 'Rule support; live accuracy uncalibrated' : prediction.confidence || 'Uncalibrated rule support',
    confidenceCalibrated: false, validation: 'unvalidated', modelScope: 'rules', mode: DEFAULT_MATCH_MODE,
  };
}
