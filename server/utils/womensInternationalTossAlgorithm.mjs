import { getProviderTotalMatchPrediction, isWomensMatch, resolveInternationalMatchLeague } from './providerTotalMatchPredictor.mjs';

export const WOMENS_INTERNATIONAL_TOSS_VERSION = 'toss-womens-international-lower-provider-total-v1';

export function isWomensInternationalToss(snapshot, competition = '') {
  const name = typeof competition === 'object' && competition !== null
    ? competition.competitionName || competition.seriesName || '' : competition;
  const label = String(name || snapshot?.competitionName || snapshot?.seriesName || '');
  const international = resolveInternationalMatchLeague(label)
    || /\binternational\b|\basia cup\b|\basian games\b/i.test(label);
  return Boolean(international && isWomensMatch({...snapshot,competitionName:label}));
}

// Use only this toss market's frozen totals. A match market's totals, current
// live totals and the generic toss waterfall cannot supply or reverse the pick.
export function getWomensInternationalTossPrediction(snapshot) {
  const metadata = {
    tier: 'WOMENS_INTERNATIONAL_TOSS_LOWER_PREMATCH_PROVIDER_TOTAL',
    algoName: "Women's International Lower Provider Total Toss Algorithm",
    predictorVersion: WOMENS_INTERNATIONAL_TOSS_VERSION,
    validation: 'unvalidated-single-provider-total-rule', trainingSamples: 0,
    validationNote: 'Single frozen pre-match provider-total rule; future toss accuracy is unvalidated.',
  };
  const result = getProviderTotalMatchPrediction(snapshot,{selection:'lower',scope:'womens-international-toss'});
  if (!result) return {...metadata,winner:null,abstain:true,
    reason:'Distinct teams and unequal, nonnegative pre-match provider totals are required for both teams.'};
  const confidence = {label:'Single provider-total rule; future accuracy unvalidated',color:'text-yellow-500',pct:'Uncalibrated',calibrated:false};
  return {...result,...metadata,winnerName:result.winner,
    pattern:'WOMENS_INTERNATIONAL_LOWER_PROVIDER_TOTAL',verdictTag:'LOWER PRE-MATCH PROVIDER TOTAL',
    confidence,
    algorithmEvidence:{providerTotal:result.providerTotalEvidence,signalCount:1,inputSource:'toss-pre-match'},
    signals:[{label:'Pre-match provider total',sublabel:'Lower toss provider total selects the winner',active:true,
      v1:result.providerTotalEvidence.team1.toFixed(2),v2:result.providerTotalEvidence.team2.toFixed(2),winnerWins:true}],
    activeSignals:1,
    risk:{tier:'unvalidated',label:'Risk unvalidated',shortLabel:'Unvalidated',wrongPct:'Uncalibrated',calibrated:false,note:metadata.validationNote},
    metrics:{t1:snapshot.teamNames[0],t2:snapshot.teamNames[1]},
    matchedRules:[{reason:result.reason,winner:result.winner,priority:100,selected:true}],
  };
}
