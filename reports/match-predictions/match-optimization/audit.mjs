import {activeDataHashes} from '../active-data-hashes.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..');
const {predictMatchWinner,PREDICTOR_VERSION,HISTORICAL_FIT_VERSION}=require('../../../server/utils/matchWinnerPredictor.js');
const {getLeagueMatchAlgorithm}=require('../../../server/utils/normalLeagueMatchPredictor.mjs');
const expected=activeDataHashes(root,JSON.parse(fs.readFileSync(path.join(dir,'input-hashes.json')))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const [file,value] of Object.entries(expected))if(hash(fs.readFileSync(path.join(root,file)))!==value)throw new Error('Saved input changed: '+file);
const records=JSON.parse(fs.readFileSync(path.join(root,'server/data/match_dataset.json'))).records;
const baselineReport=JSON.parse(fs.readFileSync(path.join(dir,'baseline-results.json'))),before=new Map(baselineReport.rows.map(r=>[r.matchId,r]));
const validation=JSON.parse(fs.readFileSync(path.join(dir,'training-validation.json')));
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const equal=(a,b)=>{const alias=s=>['antiguabarbudafalco','antiguabarbudafalc','antiguabarbudafalcons'].includes(norm(s))?'antiguabarbudafalcons':norm(s);return !!a&&!!b&&alias(a)===alias(b);};
const league=s=>s==='ACC Mens Premier Cup'?"ACC Men's Premier Cup":s;
const rows=records.map(r=>{
 if(r.resultVerification?.verification!=='verified')throw new Error('Unverified result '+r.matchId);
 const noResult=r.actualWinner==='No Result',snap={...structuredClone(r.snapshot),competitionName:r.competitionName};
 const original=JSON.stringify(snap),predictions={};
 const old=before.get(String(r.matchId));
 predictions.baseline={winner:old?.currentPrediction||null,verdict:noResult?'No Result':old?.currentVerdict||'Unscored',reason:old?.currentReason||null};
 for(const [id,mode] of [['rules','rules'],['historicalFit','historical-fit']]){
  const p=predictMatchWinner(snap,{mode});
  if(JSON.stringify(snap)!==original)throw new Error('Predictor mutates snapshot');
  const verdict=noResult?'No Result':!p?'Unscored':equal(p.winner,r.actualWinner)?'Correct':'Wrong';
  predictions[id]={winner:p?.winner||null,verdict,reason:p?.reason||null,algorithmId:p?.algorithmId||null,algorithmLeague:p?.algorithmLeague||null,ruleFamily:p?.ruleFamily||null,inputTiming:p?.inputTiming||null,ruleAdjusted:p?.ruleAdjusted||false,trainingSamples:p?.trainingSamples||null,leafSamples:p?.leafSamples||null,outsideTrainingRange:p?.outsideTrainingRange??null};
 }
 return {matchId:String(r.matchId),league:league(r.competitionName),matchName:r.matchName,startTime:r.resultVerification.sourceStartTime||r.startTime,date:new Date(r.resultVerification.sourceStartTime||r.startTime).toLocaleString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}),actualWinner:r.actualWinner,sourceUrl:r.resultVerification.sourceUrl,savedPrediction:r.predictedWinner||null,predictions};
}).sort((a,b)=>a.league.localeCompare(b.league)||a.startTime-b.startTime||a.matchId.localeCompare(b.matchId));
function score(group,id){const n=verdict=>group.filter(r=>r.predictions[id].verdict===verdict).length,correct=n('Correct'),wrong=n('Wrong');return {total:group.length,correct,wrong,scored:correct+wrong,unscored:n('Unscored'),noResult:n('No Result'),accuracy:correct+wrong?+(100*correct/(correct+wrong)).toFixed(1):null};}
const ids=['baseline','rules','historicalFit'],scores=Object.fromEntries(ids.map(id=>[id,score(rows,id)]));
const common=rows.filter(r=>ids.every(id=>['Correct','Wrong'].includes(r.predictions[id].verdict)));
const commonScores=Object.fromEntries(ids.map(id=>[id,score(common,id)]));
const leagues=[...new Set(rows.map(r=>r.league))].sort().map(league=>{const group=rows.filter(r=>r.league===league);return {league,algorithmId:getLeagueMatchAlgorithm(league)?.algorithmId||null,parameters:getLeagueMatchAlgorithm(league)?.parameters||null,total:group.length,scores:Object.fromEntries(ids.map(id=>[id,score(group,id)]))};});
const holdoutIds=new Set(validation.holdout.forecasts.map(r=>r.id));
const ruleDevelopmentRows=rows.filter(r=>holdoutIds.has(r.matchId));
const ruleDevelopmentReplay={...score(ruleDevelopmentRows,'rules'),independent:false,note:'Post-hoc rule changes were informed by known failures; this is a development replay, not an untouched test.'};
const defaultChanges={fixed:common.filter(r=>r.predictions.baseline.verdict==='Wrong'&&r.predictions.rules.verdict==='Correct').length,regressed:common.filter(r=>r.predictions.baseline.verdict==='Correct'&&r.predictions.rules.verdict==='Wrong').length};
const report={defaultChanges,ruleDevelopmentReplay,generatedAt:new Date().toISOString(),versions:{rules:PREDICTOR_VERSION,historicalFit:HISTORICAL_FIT_VERSION},scores,commonScored:common.length,commonScores,leagues,rows,validation:validation.holdout,unscored:rows.filter(r=>r.predictions.historicalFit.verdict==='Unscored'),methods:[...validation.methods,'Normal rules use 35 independently configurable league entries in a shared frontend/backend registry; common market-rule profiles are shared where no specialist exists. Explicit competition metadata takes priority over inferred nationality.', 'The live/default rules remain separate from historical-fit mode because the tree holdout score did not beat the baseline.','Default rules now abstain on zero-flow snapshots, avoid unconditional T20 public-overload fades and no longer freeze incomplete responses in an unbounded ID cache.','Normal default rules now receive only normalized frozen pre-match fields; later derived/live fields are excluded. All stored snapshots were captured after match end, so this is still a retrospective replay rather than proven prospective validation.',`${records.length} active match records remain after authorized input-quality cleanup; missing/zero-flow records are archived and excluded, not counted as successful forecasts.`,'Runtime inference never reads actual winners, IDs, dates or team identity in historical-fit mode. Original saved predictions, snapshots and independently verified labels are unchanged.'],dataHashes:expected};
for(const id of ids)for(const k of ['correct','wrong','unscored','noResult'])if(leagues.reduce((n,l)=>n+l.scores[id][k],0)!==scores[id][k])throw new Error('League totals fail');
for(const [file,value] of Object.entries(expected))if(hash(fs.readFileSync(path.join(root,file)))!==value)throw new Error('Saved input changed: '+file);
fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({scores,commonScores,commonScored:common.length,validation:validation.holdout.tree,baselineHoldout:validation.holdout.baseline},null,2));
