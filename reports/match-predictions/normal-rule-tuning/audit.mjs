import {activeDataHashes} from '../active-data-hashes.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..');
const read=file=>JSON.parse(fs.readFileSync(path.join(dir,file)));
const tuning=read('tuning-results.json'),before=read('before.json'),current=read('../match-optimization/results.json');
const expected=activeDataHashes(root,read('../match-optimization/input-hashes.json'));
for(const [file,hash] of Object.entries(expected))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')!==hash)throw new Error('Saved input changed '+file);
const oldById=new Map(before.rows.map(r=>[r.matchId,r]));
const replayById=new Map(tuning.replay.rows.map(r=>[r.matchId,r]));
const rows=current.rows.map(r=>{
 const old=oldById.get(r.matchId),replay=replayById.get(r.matchId);
 if(!old)throw new Error('Unexpected record '+r.matchId);
 if(r.actualWinner!==old.actualWinner||r.savedPrediction!==old.savedPrediction)throw new Error('Changed outcome/original pick');
 if(replay && (r.predictions.rules.verdict==='Correct')!==replay.correct)throw new Error('Runtime/tuner mismatch '+r.matchId);
 return {...r,before:old.predictions.rules,after:r.predictions.rules,frozenBaseCorrect:replay?replay.baseIndex===replay.actualIndex:null,predictions:undefined};
});
const score=rs=>{const correct=rs.filter(r=>r.verdict==='Correct').length,wrong=rs.filter(r=>r.verdict==='Wrong').length;return {correct,wrong,scored:correct+wrong,unscored:rs.filter(r=>r.verdict==='Unscored').length,noResult:rs.filter(r=>r.verdict==='No Result').length,accuracy:correct+wrong?+(100*correct/(correct+wrong)).toFixed(1):null};};
const leagues=current.leagues.map(l=>{
 const group=rows.filter(r=>r.league===l.league),settings=tuning.settings[l.league];
 const beforeScore=score(group.map(r=>r.before)),afterScore=score(group.map(r=>r.after));
 return {league:l.league,algorithmId:l.algorithmId,total:group.length,before:beforeScore,after:afterScore,delta:afterScore.correct-beforeScore.correct,samples:settings.samples,rules:settings.rules,tuningStatus:settings.rules.length?'Supported adjustment':settings.samples<6?'Limited data: frozen base retained':'Frozen base retained'};
});
const report={generatedAt:current.generatedAt,predictorVersion:current.versions.rules,scores:{before:score(rows.map(r=>r.before)),after:score(rows.map(r=>r.after)),frozenBase:tuning.replay.frozenBase},changes:{fixed:rows.filter(r=>r.before.verdict==='Wrong'&&r.after.verdict==='Correct').length,regressed:rows.filter(r=>r.before.verdict==='Correct'&&r.after.verdict==='Wrong').length,improvedLeagues:leagues.filter(l=>l.delta>0).length,regressedLeagues:leagues.filter(l=>l.delta<0).length},searchLimits:tuning.searchLimits,candidateCount:tuning.candidateCount,chronological:{...tuning.chronological,rows:undefined},walkForward:{...tuning.walkForward,rows:undefined},methods:tuning.methods,leagues,rows};
for(const id of ['before','after'])for(const metric of ['correct','wrong','unscored','noResult'])if(leagues.reduce((n,l)=>n+l[id][metric],0)!==report.scores[id][metric])throw new Error('League totals do not reconcile');
fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({scores:report.scores,changes:report.changes,leagues:leagues.length,rows:rows.length,updatedLeagues:tuning.updatedLeagues},null,2));
