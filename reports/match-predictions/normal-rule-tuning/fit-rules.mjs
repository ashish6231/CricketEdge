import { PREMATCH_FEATURE_THRESHOLDS, PREMATCH_ACTIONS, BASE_PREMATCH_FEATURES, BASE_PREMATCH_ACTIONS, matchesAdjustment } from '../../../server/utils/preMatchRuleAdjustments.mjs';
export const SEARCH_LIMITS = Object.freeze({minimumLeagueSamples: 6, minimumRuleSupport: 4, minimumCorrections: 2, maximumRegressions: 0, maximumRules: 2, maximumConditions: 2,temporalSelectionFractions:[.67,.8]});
function candidateLibrary(features,actions){
 const atoms = Object.entries(PREMATCH_FEATURE_THRESHOLDS).filter(([feature])=>features.includes(feature)).flatMap(([feature, thresholds]) => thresholds.flatMap(threshold => ['<=', '>='].map(op => ({feature, threshold, op}))));
 const conditions = atoms.map(atom => [atom]);
 for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
  if (atoms[i].feature !== atoms[j].feature) conditions.push([atoms[i], atoms[j]]);
 }
 return {conditions,actions};
}
const libraries=[{family:'base-flow',...candidateLibrary(BASE_PREMATCH_FEATURES,BASE_PREMATCH_ACTIONS)},{family:'flow-pressure',...candidateLibrary(Object.keys(PREMATCH_FEATURE_THRESHOLDS),PREMATCH_ACTIONS)}];
export const CANDIDATE_COUNT = libraries[1].conditions.length * libraries[1].actions.length;
// These narrow, league-local guards require two earlier zero-regression cases
// before they can affect a later fixture. Runtime inference still sees only
// frozen numbers; team names and match IDs are never conditions.
const SEQUENTIAL_GUARDS = Object.freeze({
 'One Day Internationals': Object.freeze({family:'odi-extreme-flow-guard',selection:'two-earlier-zero-regression-odi-cases',minimumSamples:4,
  conditions:[{feature:'total',threshold:.9,op:'>='},{feature:'total',threshold:.975,op:'<='}],action:'backFade'}),
 'Tamil Nadu Premier League': Object.freeze({family:'tnpl-low-volume-back-leader-guard',selection:'two-earlier-zero-regression-tnpl-cases',minimumSamples:4,
  conditions:[{feature:'lay',threshold:.1,op:'>='},{feature:'volume',threshold:3,op:'<='}],action:'back'}),
});
function fitSequentialGuard(samples,guard){
 if(!guard||samples.length<guard.minimumSamples)return [];
 const covered=samples.filter(r=>matchesAdjustment(r,guard));
 const corrected=covered.filter(r=>r.picks.base!==r.y&&r.picks[guard.action]===r.y).length;
 const regressed=covered.filter(r=>r.picks.base===r.y&&r.picks[guard.action]!==r.y).length;
 return corrected>=2&&regressed===0?[{conditions:guard.conditions,action:guard.action,corrected,support:covered.length}]:[];
}
function fitCandidateRules(samples,library){
 if(samples.length<SEARCH_LIMITS.minimumLeagueSamples)return [];
 const rules=[];
 for(let step=0;step<SEARCH_LIMITS.maximumRules;step++){
  let best=null;
  for(const tests of library.conditions){
   const covered=samples.filter(r=>matchesAdjustment(r,{conditions:tests})&&!rules.some(rule=>matchesAdjustment(r,rule)));
   if(covered.length<SEARCH_LIMITS.minimumRuleSupport)continue;
   for(const action of library.actions){
    const corrected=covered.filter(r=>r.picks.base!==r.y&&r.picks[action]===r.y).length;
    const regressed=covered.filter(r=>r.picks.base===r.y&&r.picks[action]!==r.y).length;
    if(corrected<SEARCH_LIMITS.minimumCorrections||regressed>SEARCH_LIMITS.maximumRegressions)continue;
    const candidate={conditions:tests,action,corrected,support:covered.length};
    if(!best||corrected>best.corrected||corrected===best.corrected&&(tests.length<best.conditions.length||tests.length===best.conditions.length&&covered.length>best.support))best=candidate;
   }
  }
  if(!best)break;rules.push(best);
 }
 return rules;
}
const predict=(r,rules)=>{for(const rule of rules)if(matchesAdjustment(r,rule))return r.picks[rule.action];return r.picks.base;};
export function selectLeagueRules(input){
 const samples=[...input].sort((a,b)=>a.date-b.date);
 const guard=SEQUENTIAL_GUARDS[samples[0]?.league];
 if(guard){
  const rules=fitSequentialGuard(samples,guard);
  if(rules.length){
   const validation=SEARCH_LIMITS.temporalSelectionFractions.map(fraction=>{
    const cutoff=samples[Math.floor(samples.length*fraction)].date;
    const train=samples.filter(r=>r.date<cutoff),test=samples.filter(r=>r.date>=cutoff),earlierRules=fitSequentialGuard(train,guard);
    const baseCorrect=test.filter(r=>r.picks.base===r.y).length,correct=test.filter(r=>predict(r,earlierRules)===r.y).length;
    return {fraction,trainingSamples:train.length,testSamples:test.length,baseCorrect,correct,delta:correct-baseCorrect};
   });
   if(validation.every(v=>v.delta>=0))return {rules,family:guard.family,selection:guard.selection,validation};
  }
 }
 if(samples.length<SEARCH_LIMITS.minimumLeagueSamples)return {rules:[],family:'frozen-base',selection:'insufficient-data'};
 const folds=SEARCH_LIMITS.temporalSelectionFractions.map(fraction=>{
  const cutoff=samples[Math.floor(samples.length*fraction)].date;
  const train=samples.filter(r=>r.date<cutoff),test=samples.filter(r=>r.date>=cutoff);
  return {fraction,train,test,baseCorrect:test.filter(r=>r.picks.base===r.y).length};
 });
 const options=libraries.map(library=>{
  const rules=fitCandidateRules(samples,library);
  const validation=folds.map(fold=>{
   const earlierRules=fitCandidateRules(fold.train,library),correct=fold.test.filter(r=>predict(r,earlierRules)===r.y).length;
   return {fraction:fold.fraction,trainingSamples:fold.train.length,testSamples:fold.test.length,baseCorrect:fold.baseCorrect,correct,delta:correct-fold.baseCorrect};
  });
  return {rules,family:library.family,validation,validationGain:validation.reduce((n,v)=>n+v.delta,0),trainingCorrect:samples.filter(r=>predict(r,rules)===r.y).length};
 }).filter(option=>option.validation.every(v=>v.delta>=0)).sort((a,b)=>b.validationGain-a.validationGain||b.trainingCorrect-a.trainingCorrect);
 const best=options[0];
 return best?{rules:best.rules,family:best.family,selection:'two-temporal-development-splits',validation:best.validation}:{rules:[],family:'frozen-base',selection:'candidate-temporal-regression'};
}
export const fitLeagueRules=samples=>selectLeagueRules(samples).rules;
