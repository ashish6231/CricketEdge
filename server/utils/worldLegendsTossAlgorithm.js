import { isWorldLegendsLeague, getWorldLegendsActivityPrediction } from './worldLegendsActivity.mjs';

export const WORLD_LEGENDS_TOSS_VERSION = 'toss-world-legends-higher-activity-v4';
export const isWorldLegendsTossLeague = isWorldLegendsLeague;

export function getWorldLegendsTossPrediction(snapshot) {
  const metadata = {
    tier:'WORLD_LEGENDS_TOSS_HIGHER_ACTIVITY',
    algoName:'World Legends Higher Activity Toss Algorithm',
    predictorVersion:WORLD_LEGENDS_TOSS_VERSION,
    validation:'unvalidated-higher-activity-rule',trainingSamples:0,holdoutSamples:0,
    validationNote:'Single pre-match reported-activity rule; future toss accuracy is unvalidated.',
  };
  const result = getWorldLegendsActivityPrediction(snapshot);
  if (!result) return {...metadata,winner:null,abstain:true,reason:'Distinct teams and unequal, nonnegative pre-match reported activity are required for both teams.'};
  return {...metadata,...result,pattern:'WORLD_LEGENDS_HIGHER_ACTIVITY',verdictTag:'HIGHER PRE-MATCH ACTIVITY',
    confidence:{label:'Single activity rule; future accuracy unvalidated',color:'text-yellow-500',pct:'Uncalibrated',calibrated:false},
    evidence:{activity:result.reportedActivityEvidence,signalCount:1,inputSource:'toss-pre-match'}};
}
