import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { predictTossWinner } from '../../server/utils/tossPredictor.js';
import { extract, fit, mean, day, candidates, dateFolds, evaluate, summarize, selectModel, factorRules, directionProbability } from './model.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const sourcePath = path.join(root, 'server/data/toss_dataset.json');
const sourceBytes = fs.readFileSync(sourcePath);
const source = JSON.parse(sourceBytes);
const ledgerBytes = fs.readFileSync(path.join(root, 'server/data/verified_toss_results.json'));
const ledger = new Map(JSON.parse(ledgerBytes).matches.map(row => [String(row.matchId), row]));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const norm = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const same = (a,b) => norm(a) === norm(b);
const records = [], excluded = [], pending = [], seen = new Set();
const quality = { inputRecords: source.records.length, duplicates: [], lateTradeRows: [], missingTradeTimes: 0,
  capturedBeforeStart: 0, explicitTradesComplete: 0, stakeSummaryMismatches: [], winnerLabelConflicts: [], missingIndependentSource: [],
  snapshotBeforeTossProven: 0, sourceOnlyForecasts: 0 };

for (const record of source.records) {
  const id = String(record.matchId);
  if (seen.has(id)) { quality.duplicates.push(id); continue; }
  seen.add(id);
  const f = extract(record.snapshot);
  if (!f) { excluded.push({ id, reason: 'Invalid, missing or zero-volume per-odds ledger' }); continue; }
  // The verification ledger already resolved source aliases ("Women"/"W",
  // "Saint Lucia"/"St. Lucia", sponsors). Do not exclude valid outcomes just
  // because a published display name differs from the canonical market name.
  const evidence = ledger.get(id) || record.resultVerification;
  const sourceWinner = evidence?.actualWinner || evidence?.publishedWinner;
  const independent = evidence?.verification === 'verified' && !!evidence?.sourceUrl && same(sourceWinner, record.actualWinner);
  if (evidence?.verification === 'verified' && !same(sourceWinner, record.actualWinner)) quality.winnerLabelConflicts.push(id);
  const start = Number(evidence?.sourceStartTime || record.startTime);
  if (!Number.isFinite(start)) { excluded.push({id, reason:'Missing fixture start time'}); continue; }
  const index = f.names.findIndex(name => same(name, record.actualWinner));
  if (record.status !== 'verified' || index < 0) {
    pending.push({ id, matchName:record.matchName, date:day(start), teamNames:f.names, stats:f.stats, pl:f.pl, winner:record.actualWinner || null, status:record.status });
    continue;
  }
  if (!independent) quality.missingIndependentSource.push(id);
  if (Date.parse(record.capturedAt) < start) quality.capturedBeforeStart++;
  if (record.snapshot.tradesComplete === true) quality.explicitTradesComplete++;
  for (const t of f.tradeTimes) {
    if (t == null) quality.missingTradeTimes++;
    else if (t > start) quality.lateTradeRows.push({id, deltaSeconds:(t-start)/1000});
  }
  for (let i = 0; i < 2; i++) {
    const declared = record.snapshot.advancedMetrics?.[`team${i+1}`];
    const stat = f.stats[i];
    if (!declared || Math.abs(stat.tBack - declared.back) > 0.03 || Math.abs(stat.tLay - declared.lay) > 0.03) quality.stakeSummaryMismatches.push({id, team:f.names[i]});
  }
  const current = predictTossWinner(record.snapshot, record.competitionName);
  records.push({ id, date:day(start), startTime:start, matchName:record.matchName, league:record.competitionName,
    actualWinner:record.actualWinner, y:index === 0 ? 1 : 0, independent, sourceUrl:independent ? evidence.sourceUrl : null,
    capturedAt:record.capturedAt, sourceCheckedAt:evidence?.checkedAt || null,
    savedPick:f.names.findIndex(name => same(name, record.predictedWinner)), currentPick:f.names.findIndex(name => same(name, current?.winnerName)), f });
}
records.sort((a,b) => a.date.localeCompare(b.date) || a.startTime-b.startTime || a.id.localeCompare(b.id));
const primary = records.filter(r => r.independent);
if (primary.length < 60) throw new Error(`Too few independent labels: ${primary.length}`);

function fixedScores(rows) {
  return factorRules.map(([id, name, rule]) => ({ id, name, ...directionSummary(evaluate(rows, f => directionProbability(rule(f)))) }));
}

function directionSummary(predictions) {
  const {brier,logLoss,...score}=summarize(predictions);
  // The 0.6/0.4 encoding represents a direction only, not a calibrated
  // probability. Do not report probability losses for hand-written rules.
  return score;
}

function replay(rows, trackCandidates = true) {
  const folds = dateFolds(rows), predictions = [], foldReports = [];
  const candidatePredictions = Object.fromEntries(candidates.map(c => [c.id, []]));
  const candidateFolds = Object.fromEntries(candidates.map(c => [c.id, []]));
  const detailed = [];
  for (const [index, { train, test }] of folds.entries()) {
    const selected = selectModel(train), model = fit(selected.spec, train);
    const testPredictions = evaluate(test, model.predict);
    predictions.push(...testPredictions.map(r => ({...r, fold:index+1, selectedModel:selected.spec.id})));
    const report = { fold:index+1, trainN:train.length, testN:test.length, trainThrough:train.at(-1).date,
      testFrom:test[0].date, testThrough:test.at(-1).date, selected:selected.spec.id,
      train:summarize(evaluate(train, model.predict)), test:summarize(testPredictions), inner:selected.scores };
    foldReports.push(report);
    if (trackCandidates) for (const spec of candidates) {
      const m = fit(spec, train), p = evaluate(test, m.predict);
      candidatePredictions[spec.id].push(...p);
      candidateFolds[spec.id].push({ fold:index+1, train:summarize(evaluate(train,m.predict)), test:summarize(p) });
    }
    detailed.push({ train, test, selected:selected.spec, model });
  }
  return { folds:foldReports, summary:summarize(predictions), predictions, detailed,
    candidates:trackCandidates ? candidates.map(c => ({id:c.id, ...summarize(candidatePredictions[c.id]), folds:candidateFolds[c.id]})) : [] };
}

console.log(`Frozen sample: ${primary.length} source-verified; ${records.length} status-verified; ${pending.length} pending.`);
const primaryReplay = replay(primary);
const sensitivityReplay = replay(records);
const outerIds = new Set(primaryReplay.predictions.map(p => p.id));
const outerRows = primary.filter(r => outerIds.has(r.id));

// Group-block bootstrap intervals: resample whole IST days to retain clustering.
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t=Math.imul(seed ^ seed>>>15,1|seed); t=t+Math.imul(t ^ t>>>7,61|t)^t; return ((t ^ t>>>14)>>>0)/4294967296; }; }
const random = rng(20261011);
function bootstrapByDate(preds, replicates = 2000) {
  const dates = [...new Set(preds.map(p => p.date))];
  const groups = dates.map(d => preds.filter(p => p.date === d));
  const acc = [], bs = [];
  for (let iteration=0; iteration<replicates; iteration++) {
    const sample = groups.flatMap(() => groups[Math.floor(random()*groups.length)]);
    const score = summarize(sample);
    if (score.accuracy != null) acc.push(score.accuracy);
    bs.push(score.brier);
  }
  const interval = xs => { xs.sort((a,b)=>a-b); return xs.length ? [xs[Math.floor(.025*xs.length)],xs[Math.floor(.975*xs.length)]] : null; };
  return { accuracy95:interval(acc), brier95:interval(bs), replicates, unit:'IST date' };
}

const primaryFactors = fixedScores(primary);
const directions = primary.map(r => factorRules.map(([,,rule]) => Math.sign(rule(r.f))));
const eligible = factorRules.map((_,j) => directions.filter(ds => ds[j] !== 0).length);
const observedMax = Math.max(...primaryFactors.map(s => s.accuracy || 0));
const dates = [...new Set(primary.map(r=>r.date))];
let extreme = 0;
for (let iteration=0; iteration<5000; iteration++) {
  const flips = Object.fromEntries(dates.map(d=>[d,random()<.5 ? -1:1]));
  const wins = factorRules.map(()=>0);
  primary.forEach((r,i) => {
    const sign = (r.y ? 1:-1)*flips[r.date];
    directions[i].forEach((prediction,j) => { if (prediction !== 0 && prediction === sign) wins[j]++; });
  });
  if (Math.max(...wins.map((n,j)=>n/eligible[j])) >= observedMax-1e-12) extreme++;
}
const familyTest = { tests:factorRules.length, observedMaxAccuracy:observedMax, iterations:5000,
  adjustedMonteCarloP:(extreme+1)/5001, unit:'Random sign reversal of all labels within an IST date',
  limitation:'Exploratory conditional test; prior searches across this same data are not fully counted.' };

// Label-randomized controls rerun the complete nested selection, not just a
// single already-selected model. Group reversals preserve same-day structure.
const controls=[];
for (let i=0;i<99;i++) {
  const flips=Object.fromEntries(dates.map(d=>[d,random()<.5]));
  const randomized=primary.map(r=>({...r,y:flips[r.date]?1-r.y:r.y}));
  controls.push(replay(randomized,false).summary);
  if ((i+1)%25===0) console.log(`Completed ${i+1}/99 randomized nested controls.`);
}
const controlTest={ iterations:controls.length, observedBrier:primaryReplay.summary.brier,
  nullMeanBrier:mean(controls.map(c=>c.brier)), pBetterBrier:(1+controls.filter(c=>c.brier<=primaryReplay.summary.brier+1e-12).length)/(controls.length+1) };

// Fixed diagnostic model: no picking an ablation winner after test inspection.
const diagnosticSpec = candidates.find(c=>c.id==='logistic-context-0.1');
const ablationGroups = { full:[], without_stakes:[0,1,5,6,7], without_liability:[2], without_odds:[3,4], without_concentration:[8], without_interactions:[5,6,7] };
const ablations = Object.entries(ablationGroups).map(([name, columns]) => {
  const transformed = primary.map(r=>({...r,f:{...r.f,featureGroups:{...r.f.featureGroups,context:r.f.featureGroups.context.map((v,j)=>columns.includes(j)?0:v)}}}));
  const preds=dateFolds(transformed).flatMap(({train,test})=>evaluate(test,fit(diagnosticSpec,train).predict));
  return {name,...summarize(preds)};
});

const learningCurve = [];
for (const fraction of [.5,.75,1]) {
  const tests=[],trains=[];
  for(const {train,test} of dateFolds(primary)) {
    const dates=[...new Set(train.map(r=>r.date))];
    const cutoff=dates[Math.floor(dates.length*(1-fraction))];
    const subset=train.filter(r=>r.date>=cutoff);
    const m=fit(diagnosticSpec,subset);
    trains.push(summarize(evaluate(subset,m.predict)));tests.push(...evaluate(test,m.predict));
  }
  learningCurve.push({fraction,trainingMeanAccuracy:mean(trains.map(s=>s.accuracy)),trainingMeanBrier:mean(trains.map(s=>s.brier)),test:summarize(tests)});
}

const deepSpec={id:'unrestricted-diagnostic-tree',type:'tree',depth:8,minLeaf:1};
const deepFolds=dateFolds(primary).map(({train,test})=>{const m=fit(deepSpec,train);return {train:summarize(evaluate(train,m.predict)),test:summarize(evaluate(test,m.predict))};});
const frozenDefault = directionSummary(primary.map(r=>({id:r.id,date:r.date,league:r.league,y:r.y,p:r.currentPick<0 ? .5:r.currentPick===0 ? .6:.4})));
const savedDefault = directionSummary(primary.map(r=>({id:r.id,date:r.date,league:r.league,y:r.y,p:r.savedPick<0 ? .5:r.savedPick===0 ? .6:.4})));

const leagueResults=[...new Set(outerRows.map(r=>r.league))].sort().map(league=>({league,n:outerRows.filter(r=>r.league===league).length,
  factors:fixedScores(outerRows.filter(r=>r.league===league)),nested:summarize(primaryReplay.predictions.filter(r=>r.league===league))}));

// Verify symmetry on every model family and all available inputs.
let maxSwapError=0;
for(const spec of candidates) {
  const m=fit(spec,primaryReplay.detailed[0].train);
  for(const r of records) {
    const f=r.f, swapped={...f,featureGroups:Object.fromEntries(Object.entries(f.featureGroups).map(([k,x])=>[k,x.map(v=>-v)])),treeX:f.treeMirrored,treeMirrored:f.treeX};
    maxSwapError=Math.max(maxSwapError,Math.abs(m.predict(f)+m.predict(swapped)-1));
  }
}
if(maxSwapError>1e-9) throw new Error(`Swap symmetry failed: ${maxSwapError}`);
const finalSelection=selectModel(primary);
const finalFit=fit(finalSelection.spec,primary);
function fourWayDescription(rows) {
  const definitions = [
    ['back_leader_lower_lay', f=>f.backDelta*f.layDelta<0],
    ['back_leader_higher_lay', f=>f.backDelta*f.layDelta>0],
    ['lay_tie', f=>f.layDelta===0],
  ];
  return definitions.map(([name,condition])=>{
    const group=rows.filter(r=>condition(r.f));
    return {name,description:'Pre-result grouping relative to the team with higher Back stakes',
      backLeader:directionSummary(evaluate(group,f=>directionProbability(f.backDelta))),
      combinedFlowLeader:directionSummary(evaluate(group,f=>directionProbability(f.effective))),
      liabilityLeader:directionSummary(evaluate(group,f=>directionProbability(f.liabilityDelta)))};
  });
}
const report={
  generatedAt:new Date().toISOString(),protocolVersion:1,sourceSha256:sha(sourceBytes),resultLedgerSha256:sha(ledgerBytes),
  modelSha256:sha(fs.readFileSync(path.join(directory,'model.mjs'))),protocolSha256:sha(fs.readFileSync(path.join(directory,'PROTOCOL.md'))),
  primaryN:primary.length,sensitivityN:records.length,dateRange:[primary[0].date,primary.at(-1).date],quality,excluded,pending,
  limitations:[
    'All existing historical outcomes were previously inspected: these replays are not pristine holdouts.',
    'Snapshots were captured after match end. Pre-toss feature availability and forecast-issued time are unproven.',
    'Rows are retained price-level observations, not necessarily individual customer bets or independent traders.',
    'Historical source verification was reconstructed later; label availability at each historical fold date is not claimed.',
    'P/L and liability are algebraic transforms of the same four Back/Lay ledgers; association does not establish a cause of coin-toss outcomes.',
    '10–11 October observed winners still pending in storage are not supplied as ground truth or inferred from P/L.',
  ],
  primaryFactors,allStatusFactors:fixedScores(records),outerFactors:fixedScores(outerRows),familyTest,
  fourWayGroups:fourWayDescription(primary),
  nested:{summary:primaryReplay.summary,uncertainty:bootstrapByDate(primaryReplay.predictions),folds:primaryReplay.folds,predictions:primaryReplay.predictions},
  candidateReplays:primaryReplay.candidates,sensitivity:{summary:sensitivityReplay.summary,folds:sensitivityReplay.folds},
  labelRandomization:controlTest,ablations,learningCurve,deepTreeOverfitDiagnostic:deepFolds,leagueResults,
  existingEngine:{currentReplay:frozenDefault,storedPickReplay:savedDefault,interpretation:'Contaminated historical agreement; engine previously tuned on these labels. Stored picks were captured after match end.'},
  finalResearchCandidate:{id:finalSelection.spec.id,parameters:finalFit.parameters,selection:finalSelection.scores,promoted:false},
  checks:{maxSwapError,uniqueMatchIds:true,dateSeparatedFolds:true,winnerExcludedFromFeatureExtraction:true},
  rows:records.map(r=>({id:r.id,date:r.date,matchName:r.matchName,league:r.league,actualWinner:r.actualWinner,sourceVerified:r.independent,sourceUrl:r.sourceUrl,
    teamNames:r.f.names,stats:r.f.stats,pl:r.f.pl,features:r.f.featureGroups,backLayEffective:r.f.effective,liabilityDelta:r.f.liabilityDelta})),
};
fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(directory,'frozen-inputs.json'),JSON.stringify({sourceSha256:sha(sourceBytes),rows:records},null,2)+'\n');
console.log(JSON.stringify({primaryN:report.primaryN,sensitivityN:report.sensitivityN,
  nested:report.nested.summary,familyTest,controlTest,fourWayGroups:report.fourWayGroups,
  final:report.finalResearchCandidate.id,checks:report.checks,
  reportFile:'reports/toss-validation/results.json'},null,2));
