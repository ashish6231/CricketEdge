import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {predictTossWinner, PREDICTOR_VERSION} from '../../server/utils/tossPredictor.js';

const out=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(out,'../..');
const file=path.join(root,'server/data/toss_dataset.json');
const buffer=fs.readFileSync(file);
const records=JSON.parse(buffer).records;
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const verdict=(p,a)=>!p?'Unscored':norm(p)===norm(a)?'Correct':'Wrong';
const date=t=>new Date(t).toLocaleString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
function rule(reason){
  if(!reason)return 'No saved prediction';
  // Saved records contain an explanation, not a persisted pattern ID. These labels
  // summarize the selected explanation; they do not reconstruct historical code.
  const special=[
    [/^Dublin Guardians 0% coin toss resistance fade/,'ETPL Dublin resistance fade'],
    [/^Edinburgh Castle Rockers undefeated 100% Toss Fortress/,'ETPL Edinburgh fortress'],
    [/^Edinburgh Castle Rockers Fortress breached/,'ETPL Edinburgh deficit fade'],
    [/^Glasgow Cosmic toss liability choke/,'ETPL Glasgow liability choke'],
    [/^Rotterdam Dockers bookmaker deficit choke/,'ETPL Rotterdam deficit choke'],
    [/^Critical Public Overload/,'Default overload trap fade'],
    [/^Smart Money Inflow \(/,'Default smart money inflow'],
  ];
  for(const [pattern,label] of special)if(pattern.test(reason))return label;
  const general=[
    [/^(.+?) on /,''],
    [/^(.+?) to /,''],
  ];
  for(const [pattern] of general){const m=reason.match(pattern);if(m)return m[1];}
  throw new Error(`Unclassified saved explanation: ${reason}`);
}
const rows=records.map(r=>{
  if(r.status!=='verified'||r.resultVerification?.verification!=='verified'||!r.resultVerification?.sourceUrl)throw new Error('Toss is not independently verified: '+r.matchId);
  if(![r.team1,r.team2].some(t=>norm(t)===norm(r.actualWinner)))throw new Error('Winner not in fixture: '+r.matchId);
  const selected=(r.matchedRules||[]).filter(m=>m.selected);
  if(r.predictedWinner && (selected.length!==1||norm(selected[0].winner)!==norm(r.predictedWinner)))throw new Error('Stored selected rule does not match stored prediction: '+r.matchId);
  const reason=selected[0]?.reason||r.predictionReason||null;
  const current=predictTossWinner(r.snapshot,r.competitionName);
  return {matchId:String(r.matchId),league:r.competitionName,date:date(r.resultVerification.sourceStartTime||r.startTime),startTime:r.resultVerification.sourceStartTime||r.startTime,matchName:r.matchName,actualWinner:r.actualWinner,sourceUrl:r.resultVerification.sourceUrl,savedPrediction:r.predictedWinner||null,savedVersion:r.predictorVersion,savedReason:reason,savedRule:rule(reason),savedVerdict:verdict(r.predictedWinner,r.actualWinner),currentPrediction:current?.winnerName||null,currentVersion:PREDICTOR_VERSION,currentPattern:current?.pattern||null,currentRule:current?.algoName?.replace(/^[^A-Za-z]+/,'')||'No prediction',currentReason:current?.reason||null,currentVerdict:verdict(current?.winnerName,r.actualWinner)};
}).sort((a,b)=>a.league.localeCompare(b.league)||a.startTime-b.startTime||a.matchId.localeCompare(b.matchId));
function score(group,key){
  const correct=group.filter(r=>r[key]==='Correct').length;
  const wrong=group.filter(r=>r[key]==='Wrong').length;
  return {total:group.length,correct,wrong,unscored:group.length-correct-wrong,scored:correct+wrong,accuracy:correct+wrong?+(100*correct/(correct+wrong)).toFixed(1):null};
}
function groups(key){return [...new Set(rows.map(r=>r[key]))].sort().map(name=>{const g=rows.filter(r=>r[key]===name);return {name,...score(g,'savedVerdict'),current:score(g,'currentVerdict'),leagues:[...new Set(g.map(r=>r.league))].sort()};});}
const leagueVersions=[...new Set(rows.map(r=>`${r.league}\t${r.savedVersion}`))].sort().map(k=>{const [league,version]=k.split('\t');return {league,version,...score(rows.filter(r=>r.league===league&&r.savedVersion===version),'savedVerdict')};});
const currentPatterns=[...new Set(rows.map(r=>r.currentPattern||'No prediction'))].sort().map(pattern=>{const g=rows.filter(r=>(r.currentPattern||'No prediction')===pattern);return {pattern,name:g[0].currentRule,...score(g,'currentVerdict')};});
const report={generatedAt:new Date().toISOString(),sourceFile:'server/data/toss_dataset.json',sourceSha256:crypto.createHash('sha256').update(buffer).digest('hex'),totals:score(rows,'savedVerdict'),currentTotals:score(rows,'currentVerdict'),versions:groups('savedVersion'),leagues:groups('league'),rules:groups('savedRule'),leagueVersions,currentPatterns,rows,methods:[
  'All retained toss winners independently confirmed from explicit Cricbuzz toss results.',
  'Saved scores compare the original stored prediction with the corrected actual toss winner, without rewriting the prediction.',
  'Saved version identifies the engine recorded when the prediction was captured. Version groups cover different historical matches; they are not a controlled comparison on identical fixtures.',
  'Saved rule labels summarize the selected saved explanation because records do not persist historical pattern IDs.',
  `Current ${PREDICTOR_VERSION} replay is a fresh call on each saved snapshot; its pattern IDs come directly from the current predictor. Tuned v10 scores are in-sample historical fit, not independent validation.`,
  'One saved record has no prediction and is excluded from saved accuracy. Wrong predictions remain in the sample.',
  'Snapshots were captured after match end, so agreement does not establish prospective toss prediction performance.'
]};
for(const list of [report.versions,report.leagues,report.rules,report.leagueVersions]){
  if(list.reduce((n,g)=>n+g.total,0)!==rows.length||list.reduce((n,g)=>n+g.correct,0)!==report.totals.correct||list.reduce((n,g)=>n+g.wrong,0)!==report.totals.wrong)throw new Error('Group totals do not reconcile');
}
if(report.totals.correct!==86||report.totals.wrong!==27||report.totals.unscored!==1)throw new Error('Unexpected retained audit total');
if(!buffer.equals(fs.readFileSync(file)))throw new Error('Dataset changed during audit');
fs.writeFileSync(path.join(out,'toss-algorithm-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({totals:report.totals,currentTotals:report.currentTotals,versions:report.versions,rules:report.rules,currentPatterns:report.currentPatterns},null,2));
