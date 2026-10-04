import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {extractMatchFeatures,normalizeLeague,FEATURE_NAMES,predictLeagueMatch} from '../../../server/utils/matchLeagueModel.js';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..');
const input=fs.readFileSync(path.join(root,'server/data/match_dataset.json'));
const sha=crypto.createHash('sha256').update(input).digest('hex');
const records=JSON.parse(input).records;
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const eligible=records.filter(r=>r.status==='verified'&&r.actualWinner&&r.actualWinner!=='No Result');
const samples=eligible.flatMap(r=>{
 if(r.resultVerification?.verification!=='verified')throw new Error('Unverified label '+r.matchId);
 const snap={...r.snapshot,competitionName:r.competitionName},f=extractMatchFeatures(snap);
 if(!f)return [];
 const winner=f.teams.findIndex(t=>norm(snap.teamNames[t.index])===norm(r.actualWinner));
 if(winner<0)throw new Error('Winner outside fixture '+r.matchId);
 return [{id:String(r.matchId),league:normalizeLeague(r.competitionName),name:r.competitionName,date:r.resultVerification.source==='CREX'?r.startTime:r.resultVerification.sourceStartTime||r.startTime,snapshot:snap,x:f.values,y:winner,actual:r.actualWinner}];
}).sort((a,b)=>a.date-b.date||a.id.localeCompare(b.id));
const impurity=(ones,n)=>n?2*ones*(n-ones)/n:0;
function tree(rows,depth=0){
 const ones=rows.reduce((s,r)=>s+r.y,0);
 const leaf={side:ones>rows.length/2?1:0,samples:rows.length};
 if(ones===0||ones===rows.length||depth>=64)return leaf;
 let best=null;
 for(let feature=0;feature<FEATURE_NAMES.length;feature++){
  const sorted=[...rows].sort((a,b)=>a.x[feature]-b.x[feature]);let leftOnes=0;
  for(let i=0;i<sorted.length-1;i++){
   leftOnes+=sorted[i].y;
   if(sorted[i].x[feature]===sorted[i+1].x[feature])continue;
   const n=i+1,loss=impurity(leftOnes,n)+impurity(ones-leftOnes,sorted.length-n);
   if(!best||loss<best.loss-1e-12){const low=sorted[i].x[feature],high=sorted[i+1].x[feature];let threshold=low+(high-low)/2;if(threshold>=high)threshold=low;best={feature,threshold,loss};}
  }
 }
 if(!best)return leaf;
 const left=rows.filter(r=>r.x[best.feature]<=best.threshold),right=rows.filter(r=>r.x[best.feature]>best.threshold);
 if(!left.length||!right.length)throw new Error('Empty tree branch');
 return {feature:best.feature,threshold:best.threshold,left:tree(left,depth+1),right:tree(right,depth+1)};
}
function fit(rows){
 const leagues={};
 for(const key of [...new Set(rows.map(r=>r.league))].sort()){
  const group=rows.filter(r=>r.league===key);
  leagues[key]={name:group[0].name,samples:group.length,ranges:FEATURE_NAMES.map((_,i)=>[Math.min(...group.map(r=>r.x[i])),Math.max(...group.map(r=>r.x[i]))]),tree:tree(group)};
 }
 return {schemaVersion:1,datasetSha256:sha,features:FEATURE_NAMES,samples:rows.length,trainingLabelUse:'independently-verified-results; training only',validation:'in-sample-historical-fit; not future accuracy',leagues,globalTree:tree(rows)};
}
function evaluate(rows,model){let correct=0,wrong=0;const forecasts=rows.map(r=>{const p=predictLeagueMatch(r.snapshot,model),hit=norm(p?.winner)===norm(r.actual);hit?correct++:wrong++;return {id:r.id,league:r.name,actual:r.actual,predicted:p?.winner||null,correct:hit,modelScope:p?.modelScope};});return {total:rows.length,correct,wrong,accuracy:+(100*correct/rows.length).toFixed(1),forecasts};}
// One fixed, chronological holdout. No hyperparameter search or tuning against it.
const split=Math.floor(samples.length*0.8),train=samples.slice(0,split),test=samples.slice(split);
const validationModel=fit(train),validation=evaluate(test,validationModel);
const baseline=JSON.parse(fs.readFileSync(path.join(dir,'baseline-results.json')));
const baselineRows=new Map(baseline.rows.map(r=>[r.matchId,r]));
const baselineHits=test.filter(r=>norm(baselineRows.get(r.id)?.currentPrediction)===norm(r.actual)).length;
const model=fit(samples),training=evaluate(samples,model);
const report={generatedAt:new Date().toISOString(),datasetSha256:sha,eligible:eligible.length,usable:samples.length,unscored:eligible.length-samples.length,noResult:records.length-eligible.length,leagueCount:Object.keys(model.leagues).length,training:{...training,forecasts:undefined},holdout:{trainingCount:train.length,testCount:test.length,startTime:test[0]?.date,tree:{...validation,forecasts:undefined},baseline:{correct:baselineHits,wrong:test.length-baselineHits,accuracy:+(100*baselineHits/test.length).toFixed(1)},forecasts:validation.forecasts},methods:['Only preMatchVolume, preMatchPnl and preMatchTotalBets numeric fields are used. Live fields, IDs, dates and team identities are excluded from model features.','Training labels are independently verified actual winners; they are never read by runtime inference.',`The separate fixed 80/20 chronological split trains on the first ${train.length} usable records and evaluates the last ${test.length}. No holdout labels participate in that model fit or a parameter search.`,'The final historical-fit model trains on all usable records, including the holdout. Its replay accuracy is therefore explicitly in-sample and does not replace the holdout result.','Leaves may contain a single training record; full-fit trees have substantial overfitting risk, particularly in leagues with little data.','A zero-flow snapshot or perfectly symmetric market inputs produce no forecast; No Result records are excluded from winner scoring.']};
fs.writeFileSync(path.join(dir,'training-validation.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(root,'server/utils/matchLeagueModels.js'),'// Generated by match-optimization/train.mjs. Historical-fit model; uncalibrated.\nexport default '+JSON.stringify(model,null,2)+'\n');
console.log(JSON.stringify({...report,holdout:{...report.holdout,forecasts:undefined}},null,2));
