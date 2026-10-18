import { getExplicitPreMatchProviderTotals } from './providerTotals.mjs';
import { defineLeagueProfile } from './leagueProfileRuntime.mjs';

// Only provider-frozen pre-match values may decide this rule. Current totals,
// live activity, odds, P/L and fitted league adjustments cannot change the pick.
export function getProviderTotalMatchPrediction(snapshot, {selection = 'higher', scope = 'international'} = {}) {
  const names = snapshot?.teamNames;
  if (!snapshot || snapshot.error || !Array.isArray(names) || names.length !== 2
    || names.some(name => typeof name !== 'string' || !name.trim())
    || names[0].trim().toLowerCase() === names[1].trim().toLowerCase()) return null;
  const totals = getExplicitPreMatchProviderTotals(snapshot);
  if (!totals || totals.some(value => value == null) || totals[0] === totals[1]) return null;
  const winnerIdx = selection === 'lower' ? (totals[0] < totals[1] ? 0 : 1) : (totals[0] > totals[1] ? 0 : 1);
  return {
    winner: names[winnerIdx], winnerIdx,
    tier: `${scope.toUpperCase()}_MATCH_${selection.toUpperCase()}_PREMATCH_PROVIDER_TOTAL`,
    ruleFamily: `${scope}-${selection}-prematch-provider-total`,
    reason: `${names[winnerIdx]} has the ${selection} pre-match provider total (${totals[winnerIdx].toFixed(2)} vs ${totals[1-winnerIdx].toFixed(2)}).`,
    providerTotalEvidence: {team1:totals[0],team2:totals[1],winnerIdx,signalCount:1,selection},
    confidence: 'Single provider-total rule; future accuracy unvalidated',
    confidenceCalibrated: false, inputTiming: 'provider-frozen-pre-match-total',
  };
}


const internationalCategories = new Map([
  ['International Twenty20 Matches', ['T20I', 'International T20 Matches', 'Mens International Twenty20 Matches']],
  ['Womens International Twenty20 Matches', ['WT20I', 'Womens T20I', 'Womens International T20 Matches']],
  ['One Day Internationals', ['ODI', 'One Day International Matches', 'Mens One Day Internationals']],
  ['Womens One Day Internationals', ['WODI', 'Womens ODI', 'Womens One Day International Matches']],
  ['Test Matches', ['Test', 'Tests', 'International Test Matches', 'Womens Test Matches', 'Womens International Test Matches']],
  ['Unofficial International Matches', []],
].flatMap(([league,aliases]) => [league,...aliases].map(name => [name.toLowerCase().replace(/[^a-z0-9]/g,''),league])));

/** Route explicit international competition labels, never team nationality. */
export function resolveInternationalMatchLeague(name) {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/20\d{2}$/, '');
  const category = internationalCategories.get(key);
  if (category) return category;
  if (!key.startsWith('icc')) return null;
  const women = key.includes('women');
  if (/t20|twenty20/.test(key)) return women ? 'Womens International Twenty20 Matches' : 'International Twenty20 Matches';
  if (/worldtestchampionship/.test(key)) return 'Test Matches';
  if (/cricketworldcup|womensworldcup|mensworldcup|oneday/.test(key)) return women ? 'Womens One Day Internationals' : 'One Day Internationals';
  return null;
}

/** Explicit women's categories and established women's competition aliases. */
export function isWomensCompetition(name) {
  const label = String(name || '').toLowerCase().replace(/[’']/g,'');
  const alias = label.trim().replace(/[\s-]*20\d{2}$/, '');
  return /women/.test(label) || /^(?:wncl|wbbl|wcpl|wpl|wt20i|wodi)$/.test(alias);
}

export function isWomensMatch(snapshot) {
  if (isWomensCompetition(snapshot?.competitionName)) return true;
  const names = snapshot?.teamNames;
  return Array.isArray(names) && names.length >= 2 && names.slice(0,2)
    .every(name => /\bwomens?\b|(?:^|[\s-])w$/i.test(String(name || '').replace(/[’']/g,'')));
}

export function createProviderTotalMatchProfile(league, algorithmId, {selection = 'higher', scope = 'international'} = {}) {
  const profile = defineLeagueProfile({
    league, algorithmId,
    profileVersion: `${league.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${selection}-prematch-provider-total-${selection === 'lower' ? 'v3' : 'v2'}`,
    strategy: `${selection}-prematch-provider-total`,
    parameters: {}, baselineAdjustments: [], model: null, trainingTree: null,
    trainingSamples: 0, ranges: null, validationStatus: 'unvalidated-single-provider-total-rule',
  });
  return Object.freeze({...profile,predict(snapshot) {
    const result = getProviderTotalMatchPrediction(snapshot,{selection,scope});
    return result ? {...result,algorithmId:profile.algorithmId,algorithmLeague:profile.league,
      profileVersion:profile.profileVersion,algorithmStrategy:profile.strategy,
      trainingSamples:0,validation:profile.validationStatus} : null;
  }});
}

export function createInternationalProviderTotalProfile(league, algorithmId) {
  return isWomensCompetition(league) ? createWomensProviderTotalProfile(league,algorithmId)
    : createProviderTotalMatchProfile(league,algorithmId);
}

export function createWomensProviderTotalProfile(league, algorithmId) {
  return createProviderTotalMatchProfile(league,algorithmId,{selection:'lower',scope:'womens'});
}

export function createMensProviderTotalProfile(league, algorithmId) {
  return createProviderTotalMatchProfile(league,algorithmId,{selection:'higher',scope:'mens'});
}
