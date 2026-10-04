import { LEAGUE_PREMATCH_ADJUSTMENTS } from './leaguePreMatchAdjustments.mjs';
import { extractRuleAdjustmentFeatures, applyRuleAdjustments, describeAdjustment } from './preMatchRuleAdjustments.mjs';
import { getLeagueAlgorithmPrediction, getDefaultAlgorithmPrediction } from './leagueAlgorithms.mjs';
import { EMIRATES_D10_ALGORITHM, isEmiratesD10League, predictEmiratesD10Match } from './emiratesD10MatchPredictor.mjs';
import { checkPreMatchDataQuality } from './preMatchDataQuality.mjs';
import { WNCL_ALGORITHM, isWNCLLeague, predictWNCLMatch } from './wnclMatchPredictor.mjs';
import { INDEPENDENT_LEAGUE_PROFILES } from './matchLeagueProfiles/index.mjs';

export const PREDICTOR_VERSION = 'match-v8-zero-regression-guards';
export const DEFAULT_MATCH_MODE = 'rules';
const normalize = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const profiles = new Map(INDEPENDENT_LEAGUE_PROFILES.map(profile => [normalize(profile.league), profile]));

// Separate league entries and parameter objects permit independent changes.
// Existing specialist rules are preserved; leagues without a specialist start
// with their own copy of the common market-rule profile, not a fitted tree.
export const LEAGUE_MATCH_ALGORITHMS = Object.freeze([
  EMIRATES_D10_ALGORITHM,
  WNCL_ALGORITHM,
  { league: "ACC Men's Premier Cup", algorithmId: "match-acc-men-s-premier-cup-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Asian Games Men", algorithmId: "match-asian-games-men-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Asian Games T20", algorithmId: "match-asian-games-t20-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Asian Games Women", algorithmId: "match-asian-games-women-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Australia One Day Cup", algorithmId: "match-australia-one-day-cup-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "CSA Womens Pro50", algorithmId: "match-csa-womens-pro50-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "CSA One-Day Challenge Div 2", algorithmId: "match-csa-one-day-challenge-div-2-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Canada Super 60", algorithmId: "match-canada-super-60-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Canada Super 60 Women", algorithmId: "match-canada-super-60-women-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Caribbean Premier League", algorithmId: "match-caribbean-premier-league-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Delhi Premier League", algorithmId: "match-delhi-premier-league-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "European T20 Premier League", algorithmId: "match-european-t20-premier-league-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "European Cricket Series", algorithmId: "match-european-cricket-series-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "First Class Matches", algorithmId: "match-first-class-matches-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "ILT20 Development Tournament", algorithmId: "match-ilt20-development-tournament-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "International Twenty20 Matches", algorithmId: "match-international-twenty20-matches-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Kerala Cricket League", algorithmId: "match-kerala-cricket-league-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Metro Bank One Day Cup", algorithmId: "match-metro-bank-one-day-cup-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Metro Bank Womens One Day Cup", algorithmId: "match-metro-bank-womens-one-day-cup-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Netherlands Topklasse T20", algorithmId: "match-netherlands-topklasse-t20-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "One Day Internationals", algorithmId: "match-one-day-internationals-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "One Day Matches", algorithmId: "match-one-day-matches-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Sher E Punjab T20 League", algorithmId: "match-sher-e-punjab-t20-league-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "South Africa T20 Challenge", algorithmId: "match-south-africa-t20-challenge-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "T20 African Continental Cup", algorithmId: "match-t20-african-continental-cup-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "T20 Matches", algorithmId: "match-t20-matches-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Tamil Nadu Premier League", algorithmId: "match-tamil-nadu-premier-league-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Test Matches", algorithmId: "match-test-matches-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "The Hundred", algorithmId: "match-the-hundred-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "The Hundred - Womens", algorithmId: "match-the-hundred-womens-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Unofficial International Matches", algorithmId: "match-unofficial-international-matches-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Uttar Pradesh Premier League", algorithmId: "match-uttar-pradesh-premier-league-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Uttarakhand Premier League", algorithmId: "match-uttarakhand-premier-league-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
  { league: "Women's Asia Cup T20", algorithmId: "match-women-s-asia-cup-t20-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Women's Caribbean Premier League", algorithmId: "match-women-s-caribbean-premier-league-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Women's One Day Matches", algorithmId: "match-women-s-one-day-matches-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Women's T20 County Cup", algorithmId: "match-women-s-t20-county-cup-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Womens International Twenty20 Matches", algorithmId: "match-womens-international-twenty20-matches-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "Womens One Day Internationals", algorithmId: "match-womens-one-day-internationals-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4, womenFlowRatio: 1.25 } },
  { league: "World Championship of Legends T20", algorithmId: "match-world-championship-of-legends-t20-rules-v2", parameters: { totalRatio: 1.5, backRatio: 1.4 } },
].map(entry => {
  const profile = profiles.get(normalize(entry.league));
  if (!profile) throw new Error(`Missing independent league profile: ${entry.league}`);
  return Object.freeze({ ...entry, algorithmId: profile.algorithmId,
    parameters: profile.parameters, profile, predict: profile.predict });
}));
const registry = new Map(LEAGUE_MATCH_ALGORITHMS.map(entry => [normalize(entry.league), entry]));
const aliases = {
  t20i: 'International Twenty20 Matches',
  'internationalt20matches': 'International Twenty20 Matches',
  cpl: 'Caribbean Premier League', wcpl: "Women's Caribbean Premier League",
  tnpl: 'Tamil Nadu Premier League', upt20: 'Uttar Pradesh Premier League',
  dpl: 'Delhi Premier League',
};
export function getLeagueMatchAlgorithm(name) {
  if (isWNCLLeague(name)) return registry.get(normalize(WNCL_ALGORITHM.league));
  if (isEmiratesD10League(name)) return registry.get(normalize(EMIRATES_D10_ALGORITHM.league));
  const key = normalize(name);
  return registry.get(key) || registry.get(normalize(aliases[key])) || null;
}
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function normalizeFrozenMatchInput(snap) {
  if (!Array.isArray(snap?.teamNames) || snap.teamNames.length < 2) return null;
  const teamNames = snap.teamNames.slice(0, 2);
  if (!teamNames.every(name => typeof name === 'string' && name.trim()) || teamNames[0] === teamNames[1]) return null;
  const volumes = ['team1', 'team2'].map(key => {
    const back = nonnegative(snap.preMatchVolume?.[key]?.back), lay = nonnegative(snap.preMatchVolume?.[key]?.lay);
    return { back, lay, total: back + lay };
  });
  if (volumes[0].total + volumes[1].total === 0) return null;
  const pnl = ['team1', 'team2'].map((key, i) => finite(snap.preMatchPnl?.[key]) ?? volumes[i].lay - volumes[i].back + volumes[1-i].back - volumes[1-i].lay);
  const bets = ['team1', 'team2'].map(key => nonnegative(snap.preMatchTotalBets?.[key]));
  if (volumes[0].back === volumes[1].back && volumes[0].lay === volumes[1].lay && pnl[0] === pnl[1] && bets[0] === bets[1]) return null;
  return { teamNames, competitionName: snap.competitionName || '',
    preMatchVolume: {team1: volumes[0], team2: volumes[1]},
    preMatchPnl: {team1: pnl[0], team2: pnl[1]},
    preMatchTotalBets: {team1: bets[0], team2: bets[1]},
  };
}

// Kept separately so chronological tuning can evaluate the unfitted base rules.
export function predictFrozenLeagueBase(input) {
  if ((isEmiratesD10League(input?.competitionName) || isWNCLLeague(input?.competitionName)) && !checkPreMatchDataQuality(input).valid) return null;
  const snap = normalizeFrozenMatchInput(input);
  if (!snap) return null;
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
  const specialist = isWNCLLeague(leagueName) ? predictWNCLMatch(snap, algorithm.parameters) : isEmiratesD10League(leagueName)
    ? predictEmiratesD10Match(snap, algorithm.parameters)
    : getLeagueAlgorithmPrediction(leagueName, b1, b2, l1, l2, pnl1, pnl2, team1, team2, snap, rules);
  const prediction = specialist || getDefaultAlgorithmPrediction(b1, b2, l1, l2, pnl1, pnl2, team1, team2, rules);
  if (!prediction || ![team1, team2].includes(prediction.winner)) return null;
  return {
    ...prediction, winnerIdx: prediction.winner === team1 ? 0 : 1,
    reason: (prediction.reason || prediction.confidence || 'League market rule').replace(/^\d+(?:\.\d+)?%\s*(?:Sure\s*)?/, ''),
    predictorVersion: PREDICTOR_VERSION,
    algorithmId: algorithm?.algorithmId || 'match-unregistered-league-fallback',
    algorithmLeague: algorithm?.league || null,
    leagueRegistered: !!algorithm, ruleFamily: specialist ? 'league-specialist' : 'market-flow',
    confidence: /%/.test(prediction.confidence || '') ? 'Rule support; live accuracy uncalibrated' : prediction.confidence || 'Uncalibrated rule support',
    confidenceCalibrated: false, validation: 'unvalidated', modelScope: 'rules', mode: DEFAULT_MATCH_MODE,
  };
}


export function predictFrozenLeagueRules(input, independentRules) {
  if ((isEmiratesD10League(input?.competitionName) || isWNCLLeague(input?.competitionName)) && !checkPreMatchDataQuality(input).valid) return null;
  const frozen = normalizeFrozenMatchInput(input);
  if (!frozen) return null;
  const base = predictFrozenLeagueBase(frozen);
  if (!base) return null;
  const settings = independentRules || LEAGUE_PREMATCH_ADJUSTMENTS[base.algorithmLeague];
  const result = applyRuleAdjustments(extractRuleAdjustmentFeatures(frozen, base.winnerIdx), settings?.rules || []);
  const changed = result.index !== base.winnerIdx;
  return {
    ...base, winnerIdx: result.index, winner: frozen.teamNames[result.index],
    ruleFamily: changed ? 'league-prematch-adjustment' : base.ruleFamily,
    reason: changed ? describeAdjustment(result.rule) : base.reason,
    confidence: changed ? 'Pre-match league rule; live accuracy uncalibrated' : base.confidence,
    inputTiming: 'frozen-pre-match-fields',
    validation: isWNCLLeague(base.algorithmLeague) ? 'unvalidated-wncl-baseline' : isEmiratesD10League(base.algorithmLeague) ? 'unvalidated-d10-baseline' : 'retrospective-rule-tuning',
    ruleAdjusted: changed,
    adjustmentTrainingSamples: settings?.samples || 0,
    adjustmentRuleSupport: result.rule?.support || null,
  };
}

// Filled with independent, versioned profiles after offline league training.
export function predictNormalLeagueMatch(input) {
  const algorithm = getLeagueMatchAlgorithm(input?.competitionName);
  const baseline = predictFrozenLeagueRules(input, algorithm ? { rules: algorithm.profile.baselineAdjustments, samples: algorithm.profile.trainingSamples } : undefined);
  if (!baseline) return null;
  if (!algorithm) return baseline;
  const frozen = normalizeFrozenMatchInput(input);
  return algorithm.predict(frozen, baseline);
}

export function predictLeagueTrainingFit(input) {
  if (!checkPreMatchDataQuality(input).valid) return null;
  const algorithm = getLeagueMatchAlgorithm(input?.competitionName);
  return algorithm?.profile.predictTrainingFit(input) || null;
}
