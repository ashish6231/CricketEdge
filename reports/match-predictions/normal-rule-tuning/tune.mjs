import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {predictNormalLeagueMatch as oldPredict} from './baseline/normalLeagueMatchPredictor.mjs';
import {normalizeFrozenMatchInput,predictFrozenLeagueBase,LEAGUE_MATCH_ALGORITHMS} from '../../../server/utils/normalLeagueMatchPredictor.mjs';
import {extractRuleAdjustmentFeatures,applyRuleAdjustments} from '../../../server/utils/preMatchRuleAdjustments.mjs';
import {fitLeagueRules,selectLeagueRules,SEARCH_LIMITS,CANDIDATE_COUNT} from './fit-rules.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..');
const bytes=fs.readFileSync(path.join(root,'server/data/match_dataset.json')),records=JSON.parse(bytes).records;
const sha=crypto.createHash('sha256').update(bytes).digest('hex');
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const samples=records.filter(r=>r.status==='verified'&&r.actualWinner!=='No Result'&&r.resultVerification?.verification==='verified').flatMap(r=>{
 if(r.resultVerification?.verification!=='verified')throw new Error('Unverified label '+r.matchId);
 const raw={...r.snapshot,competitionName:r.competitionName},snap=normalizeFrozenMatchInput(raw),p=predictFrozenLeagueBase(raw);
 if(!p)return [];
 const y=snap.teamNames.findIndex(n=>norm(n)===norm(r.actualWinner));
 if(y<0)throw new Error('Actual winner outside fixture '+r.matchId);
 const before=oldPredict(raw),oldIndex=snap.teamNames.indexOf(before.winner);
 return [{id:String(r.matchId),date:r.resultVerification.source==='CREX'?r.startTime:r.resultVerification.sourceStartTime||r.startTime,league:p.algorithmLeague,y,oldIndex,...extractRuleAdjustmentFeatures(snap,p.winnerIdx)}];
}).sort((a,b)=>a.date-b.date||a.id.localeCompare(b.id));
function fit(rows){return Object.fromEntries(LEAGUE_MATCH_ALGORITHMS.map(({league})=>{const group=rows.filter(r=>r.league===league);return [league,{samples:group.length,...selectLeagueRules(group)}];}));}
const pick=(r,settings)=>applyRuleAdjustments(r,settings[r.league]?.rules||[]).index;
const score=rows=>{const correct=rows.filter(r=>r.correct).length;return {scored:rows.length,correct,wrong:rows.length-correct,accuracy:rows.length?+(100*correct/rows.length).toFixed(1):null};};
const compare=(rows,settings)=>rows.map(r=>({matchId:r.id,league:r.league,date:r.date,actualIndex:r.y,beforeIndex:r.oldIndex,baseIndex:r.picks.base,predictedIndex:pick(r,settings),correct:pick(r,settings)===r.y}));
// Keep every match at the cutoff timestamp in the later group.
const cutoff=samples[Math.floor(samples.length*.8)].date;
const train=samples.filter(r=>r.date<cutoff),later=samples.filter(r=>r.date>=cutoff);
const historicalSettings=fit(train),validationRows=compare(later,historicalSettings);
// Prequential replay: each forecast's rule search sees strictly earlier labels.
const walkRows=samples.map(r=>{const prior=samples.filter(p=>p.league===r.league&&p.date<r.date),rules=fitLeagueRules(prior),index=applyRuleAdjustments(r,rules).index;return {matchId:r.id,league:r.league,date:r.date,trainingSamples:prior.length,eligible:prior.length>=SEARCH_LIMITS.minimumLeagueSamples,predictedIndex:index,actualIndex:r.y,baseIndex:r.picks.base,beforeIndex:r.oldIndex,correct:index===r.y};});
const settings=fit(samples),replayRows=compare(samples,settings);
const baseScore=rows=>score(rows.map(r=>({...r,correct:r.baseIndex===r.actualIndex}))),oldScore=rows=>score(rows.map(r=>({...r,correct:r.beforeIndex===r.actualIndex})));
const verifiedWinnerCount=records.filter(r=>r.status==='verified'&&r.actualWinner!=='No Result'&&r.resultVerification?.verification==='verified').length;
const report={generatedAt:new Date().toISOString(),datasetSha256:sha,searchLimits:SEARCH_LIMITS,candidateCount:CANDIDATE_COUNT,total:records.length,verifiedWinners:verifiedWinnerCount,usable:samples.length,noResult:records.filter(r=>r.actualWinner==='No Result').length,zeroInput:verifiedWinnerCount-samples.length,updatedLeagues:Object.entries(settings).filter(([,s])=>s.rules.length).map(([league])=>league),replay:{before:oldScore(replayRows),frozenBase:baseScore(replayRows),after:score(replayRows),rows:replayRows},chronological:{trainingCount:train.length,testCount:later.length,cutoff,before:oldScore(validationRows),frozenBase:baseScore(validationRows),after:score(validationRows),rows:validationRows},walkForward:{before:oldScore(walkRows),frozenBase:baseScore(walkRows),after:score(walkRows),eligibleOnly:{frozenBase:baseScore(walkRows.filter(r=>r.eligible)),after:score(walkRows.filter(r=>r.eligible))},rows:walkRows},settings,methods:['Normal rules use frozen preMatchVolume, preMatchPnl and preMatchTotalBets only. Derived live fields are removed before legacy specialist rules are called.','Each league has independent settings. At most two extra rules, each with at most two fixed-grid conditions, are selected. General rules need at least four historical cases and two corrections without a training regression; leagues with fewer than six usable cases otherwise retain the frozen base. Two documented sequential guards require two earlier zero-regression misses: the men’s ODI 90-97.5% extreme-flow fade and the TNPL low-volume back-leader rule. Each corrected the next chronological covered case.','Two libraries (basic flow and expanded pressure/activity) are selected using 67% and 80% internal time splits; the selected library may not underperform the frozen base on either development split. Some small-league folds have too little earlier training data for fitted rules; their equality with baseline is not validation evidence.','The chronological and expanding-time replays fit only strictly earlier labels. Equal timestamps are kept out of each others training sets. No ID, date, result, or team identity is used as a prediction feature.','The fixed-grid expanded library contains 54,080 candidate condition/action combinations; this broad search can overfit despite support limits. Internal split scores select the library and are development scores, not untouched tests. The final settings are subsequently fitted to all usable records. Their replay is an in-sample development score, not an independent accuracy estimate.','All records have already been examined during development and the rule search is broad. These temporal replays are retrospective diagnostics, not pristine unseen tests or proof of future improvement.','Saved snapshots were collected after match end; frozen field names do not independently prove when forecasts were issued. New prospective predictions are required to validate real live accuracy.']};
fs.writeFileSync(path.join(dir,'tuning-results.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(root,'server/utils/leaguePreMatchAdjustments.mjs'),'// Generated by normal-rule-tuning/tune.mjs. In-sample rule tuning; not calibrated accuracy.\nexport const LEAGUE_PREMATCH_ADJUSTMENTS = '+JSON.stringify(settings,null,2)+';\n');
console.log(JSON.stringify({updatedLeagues:report.updatedLeagues,usable:samples.length,replay:{before:report.replay.before,frozenBase:report.replay.frozenBase,after:report.replay.after},chronological:{before:report.chronological.before,after:report.chronological.after,trainingCount:train.length,testCount:later.length},walkForward:{before:report.walkForward.before,after:report.walkForward.after,eligibleOnly:report.walkForward.eligibleOnly}},null,2));
