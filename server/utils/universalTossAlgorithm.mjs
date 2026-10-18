import { getCurrentProviderTotals, getExplicitPreMatchProviderTotals } from './providerTotals.mjs';
import { getBookiePlFromMatchedTrades, getMarketExposureFromTrades } from './bookiePl.mjs';

export const UNIVERSAL_TOSS_VERSION = 'toss-v13-current-lower-combined-risk-first';
export const SOUTH_AFRICA_T20_TOSS_VERSION = 'toss-south-africa-t20-risk-first-higher-provider-fallback-v2';

export function isSouthAfricaT20TossLeague(name = '') {
  const key = String(name).toLowerCase().replace(/[^a-z0-9]/g,'').replace(/20\d{2}$/, '');
  return ['southafricat20challenge','southafricat20','southafricant20challenge'].includes(key);
}

const finite = value => value == null || !['number','string'].includes(typeof value) || String(value).trim() === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const validNames = names => Array.isArray(names) && names.length === 2
  && names.every(name => typeof name === 'string' && name.trim())
  && names[0].trim().toLowerCase() !== names[1].trim().toLowerCase();
const validPair = values => Array.isArray(values) && values.length === 2 && values.every(value => value != null && value >= 0 && Number.isFinite(value));

function fallbackRule(snapshot, competition = '') {
  const explicit = typeof competition === 'object' && competition !== null
    ? competition.competitionName || competition.seriesName || '' : competition;
  const higher = isSouthAfricaT20TossLeague(explicit || snapshot?.competitionName || snapshot?.seriesName || '');
  return {mode:'fallback',selection:higher ? 'higher' : 'lower',requirePositivePl:!higher,signalCount:higher ? 1 : 2,
    predictorVersion:higher ? SOUTH_AFRICA_T20_TOSS_VERSION : UNIVERSAL_TOSS_VERSION};
}

/** Select from the active rule. A missing value must never be treated as zero. */
export function selectTossWinner({teamNames, providerTotals, pl, riskTotals, mode = 'fallback', selection = 'lower', requirePositivePl = true} = {}) {
  if (!validNames(teamNames)) return null;
  if (mode === 'risk') {
    if (!validPair(riskTotals) || riskTotals.some(value => value === 0) || riskTotals[0] === riskTotals[1]) return null;
    const winnerIdx = riskTotals[0] < riskTotals[1] ? 0 : 1;
    return {winner:teamNames[winnerIdx],winnerIdx,riskTotals};
  }
  if (!Array.isArray(providerTotals) || providerTotals.length !== 2) return null;
  const totals = providerTotals.map(finite);
  if (!validPair(totals) || totals[0] === totals[1]) return null;
  const winnerIdx = selection === 'higher' ? (totals[0] > totals[1] ? 0 : 1) : (totals[0] < totals[1] ? 0 : 1);
  const pnl = [finite(pl?.[0]),finite(pl?.[1])];
  if (requirePositivePl && !(pnl[winnerIdx] > 0)) return null;
  return {winner:teamNames[winnerIdx],winnerIdx,providerTotals:totals,pl:pnl};
}

export function getTossRuleInputs(snapshot, competition = '') {
  const teamNames = snapshot?.teamNames;
  const providerTotals = getCurrentProviderTotals(snapshot) || getExplicitPreMatchProviderTotals(snapshot);
  const displayedPl = getBookiePlFromMatchedTrades(snapshot,teamNames?.[0],teamNames?.[1]);
  const pl = [finite(displayedPl.pl1),finite(displayedPl.pl2)];
  // These are exactly the Back risk / Lay risk values displayed on TossDetail.
  const exposure = getMarketExposureFromTrades(snapshot,teamNames?.[0],teamNames?.[1]);
  const risk = {
    back:[finite(exposure.team1.backExposure),finite(exposure.team2.backExposure)],
    lay:[finite(exposure.team1.layExposure),finite(exposure.team2.layExposure)],
  };
  risk.total = [0,1].map(index => risk.back[index] != null && risk.lay[index] != null
    ? finite(risk.back[index] + risk.lay[index]) : null);
  risk.zeroTeams = [0,1].filter(index => risk.back[index] === 0 && risk.lay[index] === 0);
  risk.available = validPair(risk.back) && validPair(risk.lay) && validPair(risk.total);
  const fallback = fallbackRule(snapshot,competition);
  const rule = risk.zeroTeams.length ? fallback : {
    mode:'risk',selection:'lower-risk',requirePositivePl:false,signalCount:1,predictorVersion:UNIVERSAL_TOSS_VERSION,
  };
  const available = !snapshot?.error && validNames(teamNames) && (rule.mode === 'risk' ? risk.available
    : validPair(providerTotals) && (!rule.requirePositivePl || pl.some(value => value != null)));
  return {teamNames,providerTotals,pl,risk,riskTotals:risk.total,period:'current',rule,fallbackRule:fallback,
    mode:rule.mode,selection:rule.selection,requirePositivePl:rule.requirePositivePl,available};
}

/** Risk has first priority for every league. Only a confirmed all-zero side enables the prior rule. */
export function getUniversalTossPrediction(snapshot, competition = '') {
  const inputs = getTossRuleInputs(snapshot,competition);
  const primary = inputs.mode === 'risk';
  const higher = !primary && inputs.rule.selection === 'higher';
  const zeroNames = inputs.risk.zeroTeams.map(index => inputs.teamNames?.[index]).filter(Boolean).join(' and ');
  const fallbackNote = primary ? '' : `Fallback: ${zeroNames} has zero back risk and lay risk. `;
  const metadata = {
    predictorVersion:inputs.rule.predictorVersion,
    tier:primary ? 'UNIVERSAL_TOSS_LOWER_COMBINED_RISK' : higher ? 'SOUTH_AFRICA_T20_TOSS_HIGHER_PROVIDER_TOTAL' : 'UNIVERSAL_TOSS_POSITIVE_PL_LOWER_PROVIDER_TOTAL',
    algoName:primary ? 'Lower Back + Lay Risk Toss Algorithm' : higher ? 'South Africa T20 Higher Provider Total Toss Algorithm' : 'Positive P/L & Lower Provider Total Toss Algorithm',
    ruleFamily:primary ? 'lower-combined-back-lay-risk' : higher ? 'south-africa-t20-higher-provider-total' : 'positive-pl-and-lower-provider-total',
    validation:'unvalidated-risk-first-rule',trainingSamples:0,
    validationNote:'Lower combined back and lay risk has priority. A side with both risks zero enables the prior league rule. Future accuracy is unvalidated.',
    inputTiming:primary ? 'current-displayed-back-and-lay-risk' : higher ? 'current-displayed-provider-total' : 'current-displayed-pl-and-provider-total',
    usedFallback:!primary,
  };
  const pick = inputs.available ? selectTossWinner(inputs) : null;
  if (!pick) return {...metadata,winner:null,winnerName:null,abstain:true,
    reason:fallbackNote + (primary ? 'No pick: valid, unequal combined back and lay risk is required for both teams.'
      : higher ? 'No pick: unequal current provider totals are required for both teams.'
      : 'No pick: one team must have both positive current P/L and a strictly lower current provider total.')};
  const {winner,winnerIdx} = pick;
  const {providerTotals,pl,risk} = inputs;
  const reason = primary
    ? `${winner} has the lower combined risk (${risk.back[winnerIdx].toFixed(2)} back + ${risk.lay[winnerIdx].toFixed(2)} lay = ${risk.total[winnerIdx].toFixed(2)} vs ${risk.total[1-winnerIdx].toFixed(2)}).`
    : fallbackNote + (higher ? `${winner} has the higher current provider total (${providerTotals[winnerIdx].toFixed(2)} vs ${providerTotals[1-winnerIdx].toFixed(2)}).`
      : `${winner} has positive current P/L (+${pl[winnerIdx].toFixed(2)}) and the lower current provider total (${providerTotals[winnerIdx].toFixed(2)} vs ${providerTotals[1-winnerIdx].toFixed(2)}).`);
  const signed = value => value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
  const signals = primary ? [{label:'Combined back + lay risk',sublabel:'Lower combined risk selects the winner',active:true,
    v1:risk.total[0].toFixed(2),v2:risk.total[1].toFixed(2),winnerWins:true}]
    : [{label:'Current provider total',sublabel:`Predicted team must have the ${inputs.rule.selection} total`,active:true,
      v1:providerTotals[0].toFixed(2),v2:providerTotals[1].toFixed(2),winnerWins:true},
      ...(!higher ? [{label:'Current P/L',sublabel:'The same team must have P/L greater than zero',active:true,v1:signed(pl[0]),v2:signed(pl[1]),winnerWins:true}] : [])];
  return {...metadata,winner,winnerName:winner,winnerIdx,reason,
    pattern:primary ? 'LOWER_COMBINED_BACK_LAY_RISK' : higher ? 'SOUTH_AFRICA_T20_HIGHER_PROVIDER_TOTAL' : 'POSITIVE_PL_LOWER_PROVIDER_TOTAL',
    verdictTag:primary ? 'LOWER COMBINED RISK' : higher ? 'HIGHER PROVIDER TOTAL' : 'POSITIVE P/L + LOWER PROVIDER TOTAL',
    confidence:{label:'Rule support; future accuracy unvalidated',color:'text-yellow-500',pct:'Uncalibrated',calibrated:false},
    confidenceCalibrated:false,
    risk:{tier:'unvalidated',label:'Risk unvalidated',shortLabel:'Unvalidated',wrongPct:'Uncalibrated',calibrated:false,note:metadata.validationNote},
    algorithmEvidence:{risk,providerTotal:{team1:providerTotals?.[0] ?? null,team2:providerTotals?.[1] ?? null},
      pl:{team1:pl[0],team2:pl[1]},winnerIdx,signalCount:inputs.rule.signalCount,mode:inputs.mode,
      selection:inputs.rule.selection,requirePositivePl:inputs.rule.requirePositivePl,inputSource:'toss-current-display'},
    signals,activeSignals:signals.length,metrics:{t1:inputs.teamNames[0],t2:inputs.teamNames[1]},
    matchedRules:[{reason,winner,priority:100,selected:true}],
  };
}
