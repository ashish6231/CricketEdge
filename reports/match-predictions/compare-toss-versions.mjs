import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {predictTossWinner as v7} from './historical-predictors/v7-original/tossPredictor.js';
import {predictTossWinner as v8} from './historical-predictors/v8-original/tossPredictor.js';
import {predictTossWinner as latestV8} from './historical-predictors/v8-latest/tossPredictor.js';
import {predictTossWinner as v9} from './optimization/baseline-v9/tossPredictor.js';

const out=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(out,'../..');
const datasetFile=path.join(root,'server/data/toss_dataset.json');
const buffer=fs.readFileSync(datasetFile);
const records=JSON.parse(buffer).records;
const historical=JSON.parse(fs.readFileSync(path.join(out,'historical-predictors/provenance.json'),'utf8'));
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const verdict=(p,a)=>!p?'Unscored':norm(p)===norm(a)?'Correct':'Wrong';
const definitions=[
 {id:'v7',label:'v7 original — LayVol / StrongerTeam',predict:v7,source:historical.find(s=>s.name==='v7-original')},
 {id:'v8',label:'v8 original — Ratio-gated LayVol',predict:v8,source:historical.find(s=>s.name==='v8-original')},
 {id:'v8Latest',label:'v8 latest — Smart Flow Waterfall',predict:latestV8,source:historical.find(s=>s.name==='v8-latest')},
 {id:'v9',label:'v9 baseline — League-specific',predict:v9,source:{file:'reports/match-predictions/optimization/baseline-v9/tossPredictor.js',sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'optimization/baseline-v9/tossPredictor.js'))).digest('hex')}},
];
function score(rows,id){const c=rows.filter(r=>r.predictions[id].verdict==='Correct').length,w=rows.filter(r=>r.predictions[id].verdict==='Wrong').length;return {total:rows.length,correct:c,wrong:w,scored:c+w,unscored:rows.length-c-w,accuracy:c+w?+(100*c/(c+w)).toFixed(1):null};}
const rows=records.map(r=>{
 if(r.status!=='verified'||r.resultVerification?.verification!=='verified')throw new Error('Unverified toss: '+r.matchId);
 const predictions={};
 for(const d of definitions){
  // Give each version the same independent copy of inputs. Actual results are never passed in.
  const snap=structuredClone(r.snapshot);
  const before=JSON.stringify(snap);
  const p=d.predict(snap,r.competitionName);
  if(JSON.stringify(snap)!==before)throw new Error('Predictor mutated its inputs: '+d.id);
  const winner=p?.winnerName||null;
  if(winner && ![r.team1,r.team2].some(t=>norm(t)===norm(winner)))throw new Error('Prediction outside fixture: '+r.matchId+' '+d.id);
  predictions[d.id]={winner,verdict:verdict(winner,r.actualWinner),reason:p?.reason||null,pattern:p?.pattern||null};
 }
 return {matchId:String(r.matchId),league:r.competitionName,matchName:r.matchName,startTime:r.resultVerification.sourceStartTime||r.startTime,date:new Date(r.resultVerification.sourceStartTime||r.startTime).toLocaleString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}),actualWinner:r.actualWinner,sourceUrl:r.resultVerification.sourceUrl,savedPrediction:r.predictedWinner||null,savedVersion:r.predictorVersion,predictions};
}).sort((a,b)=>a.league.localeCompare(b.league)||a.startTime-b.startTime||a.matchId.localeCompare(b.matchId));
const common=rows.filter(r=>definitions.every(d=>r.predictions[d.id].winner));
const versions=definitions.map(({predict,...d})=>({...d,score:score(rows,d.id),commonScore:score(common,d.id),storedLabelSubset:{total:rows.filter(r=>r.savedVersion===({v7:'toss-v7-layvol-stronger',v8:'toss-v8-layvol-ratio-gate',v8Latest:'toss-v8-layvol-ratio-gate',v9:'toss-v9-league-specific-algorithms'}[d.id])).length,mismatchedPredictions:rows.filter(r=>r.savedVersion===({v7:'toss-v7-layvol-stronger',v8:'toss-v8-layvol-ratio-gate',v8Latest:'toss-v8-layvol-ratio-gate',v9:'toss-v9-league-specific-algorithms'}[d.id])&&norm(r.savedPrediction)!==norm(r.predictions[d.id].winner)).length}}));
const leagues=[...new Set(rows.map(r=>r.league))].sort().map(league=>{const group=rows.filter(r=>r.league===league);return {league,total:group.length,scores:Object.fromEntries(definitions.map(d=>[d.id,score(group,d.id)]))};});
const patterns=Object.fromEntries(definitions.map(d=>[d.id,[...new Set(rows.map(r=>r.predictions[d.id].pattern||'No prediction'))].sort().map(pattern=>{const g=rows.filter(r=>(r.predictions[d.id].pattern||'No prediction')===pattern);return {pattern,...score(g,d.id)};})]));
const changes=Object.fromEntries(['v7','v8','v8Latest'].map(id=>[id,{betterThanV9:rows.filter(r=>r.predictions[id].verdict==='Correct'&&r.predictions.v9.verdict==='Wrong').length,worseThanV9:rows.filter(r=>r.predictions[id].verdict==='Wrong'&&r.predictions.v9.verdict==='Correct').length,differentWinner:rows.filter(r=>norm(r.predictions[id].winner)!==norm(r.predictions.v9.winner)).length}]));
const report={generatedAt:new Date().toISOString(),total:rows.length,commonScored:common.length,versions,leagues,patterns,changes,rows,methods:[
 'All 114 retained verified toss records are attempted by every version; each sees the same stored snapshot and competition name.',
 'v7 and original v8 use the exact historical Git source, including the matching historical risk dependency. No prediction rules were reconstructed or tuned.',
 'The v8 version label was reused for different implementations. Original ratio-gated v8 and the latest pre-v9 Smart Flow v8 are therefore reported separately.',
 'Actual toss winners come from corrected independently verified Cricbuzz toss metadata and are used only after predicting.',
 'Saved version labels are historical metadata. Stored predictions do not consistently reproduce from code bearing that label; the earlier saved-label percentages were not all-match replays of the original code.',
 'Version accuracy excludes records where that version produces no prediction. Common-set accuracy compares only fixtures predicted by every engine.',
 'No app algorithm, saved forecast, snapshot or actual result was changed. This is a historical comparison on captured snapshots, not a prospective pre-toss test.'
]};
for(const d of definitions){const s=versions.find(v=>v.id===d.id).score;if(leagues.reduce((n,l)=>n+l.scores[d.id].correct,0)!==s.correct||leagues.reduce((n,l)=>n+l.scores[d.id].wrong,0)!==s.wrong||patterns[d.id].reduce((n,p)=>n+p.total,0)!==rows.length)throw new Error('Totals do not reconcile: '+d.id);}
if(!buffer.equals(fs.readFileSync(datasetFile)))throw new Error('Saved dataset changed');
fs.writeFileSync(path.join(out,'toss-version-comparison.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,commonScored:report.commonScored,versions:versions.map(v=>({id:v.id,label:v.label,score:v.score,storedLabelSubset:v.storedLabelSubset})),changes},null,2));
