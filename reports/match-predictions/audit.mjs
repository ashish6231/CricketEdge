import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { predictMatchStart } from '../../frontend/src/utils/matchStartPredictor.js';
import { predictMatchWinner as predictLive } from '../../frontend/src/utils/matchWinnerPredictor.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { predictMatchWinner } = require('../../server/utils/matchWinnerPredictor.js');
const { getDefaultAlgorithmPrediction } = require('../../server/utils/leagueAlgorithms.js');
const sourceNames = ['match_dataset.json', 'toss_dataset.json', 'ended_matches_cache.json'];
const sourceBuffers = sourceNames.map(name => fs.readFileSync(path.join(root, 'server/data', name)));
const [matchData, tossData, cache] = sourceBuffers.map(buffer => JSON.parse(buffer));
const sources = sourceNames.map((name, i) => ({
  file: `server/data/${name}`, sha256: crypto.createHash('sha256').update(sourceBuffers[i]).digest('hex'),
  updatedAt: i === 0 ? matchData.updatedAt : i === 1 ? tossData.updatedAt : null,
  count: i === 0 ? matchData.records.length : i === 1 ? tossData.records.length : Object.keys(cache).length,
}));

// Only explicit aliases are normalized; no fuzzy team matching affects scoring.
const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const teamAlias = value => {
  const n = norm(value);
  return ['antiguabarbudafalco', 'antiguabarbudafalc', 'antiguabarbudafalcons'].includes(n) ? 'antiguabarbudafalcons' : n;
};
const sameTeam = (a, b) => Boolean(a && b && teamAlias(a) === teamAlias(b));
const canonicalLeague = name => name === 'ACC Mens Premier Cup' ? "ACC Men's Premier Cup" : name || 'League unavailable';
const fixture = r => String(r.matchId).startsWith('test-');
const validActual = r => r.status === 'verified' && [r.team1, r.team2].some(t => sameTeam(t, r.actualWinner));
const dateString = value => {
  if (!value) return null;
  const d = new Date(typeof value === 'number' ? value : String(value));
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Kolkata',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
};
const evaluate = (winner, actual, eligible) => !eligible ? 'Unscored' : !winner ? 'No prediction' : sameTeam(winner, actual) ? 'Correct' : 'Wrong';
const safeRun = (fn, snap) => {
  try { return { prediction: fn(snap), error: null }; }
  catch (e) { return { prediction: null, error: e.message }; }
};
const silentBackend = snap => {
  const log = console.log;
  console.log = () => {};
  try { return safeRun(predictMatchWinner, snap); }
  finally { console.log = log; }
};
const scoreRows = (rows, field) => {
  const scored = rows.filter(r => !r.fixture && r.actualVerified && r[field]);
  const correct = scored.filter(r => sameTeam(r[field], r.actualWinner)).length;
  return {correct, scored: scored.length, wrong: scored.length - correct, accuracy: scored.length ? +(100 * correct / scored.length).toFixed(1) : null};
};

const tossById = new Map(tossData.records.map(r => [String(r.matchId), r]));
const matchesById = new Map(matchData.records.map(r => [String(r.matchId), r]));
const teamLeagues = new Map();
for (const r of [...matchData.records, ...tossData.records].filter(r => !fixture(r))) {
  for (const team of [r.team1, r.team2]) {
    const key = teamAlias(team);
    if (!key || !r.competitionName) continue;
    if (!teamLeagues.has(key)) teamLeagues.set(key, new Set());
    teamLeagues.get(key).add(canonicalLeague(r.competitionName));
  }
}

const rows = matchData.records.map(r => {
  const snap = {...(r.snapshot || {}), matchId: String(r.matchId), competitionName: r.competitionName || r.snapshot?.competitionName || ''};
  const current = silentBackend(snap);
  const start = safeRun(predictMatchStart, snap);
  const live = safeRun(predictLive, snap);
  const strict = silentBackend({
    matchId: `${r.matchId}-audit-pre-fields`, teamNames: snap.teamNames, competitionName: snap.competitionName,
    preMatchVolume: snap.preMatchVolume, preMatchPnl: snap.preMatchPnl, preMatchTotalBets: snap.preMatchTotalBets,
  });
  const toss = tossById.get(String(r.matchId));
  const eligible = !fixture(r) && validActual(r);
  const flags = [];
  if (fixture(r)) flags.push('Test fixture; excluded from performance');
  if (r.status === 'abandoned' || r.actualWinner === 'No Result') flags.push('No result; excluded from performance');
  if (r.status === 'verified' && !r.confirmedByEmail) flags.push('Winner marked verified; confirmation source absent');
  if (r.actualWinner && !['No Result', r.team1, r.team2].includes(r.actualWinner)) flags.push('Winner name normalized by explicit Antigua alias');
  if (!snap.preMatchVolume || !snap.preMatchPnl) flags.push('Pre-match input fields missing');
  const compared = Boolean(current.prediction?.winner && start.prediction?.winnerName);
  if (compared && !sameTeam(current.prediction.winner, start.prediction.winnerName)) flags.push('Server and page match-start predictions disagree');
  if (current.prediction?.winner && strict.prediction?.winner && !sameTeam(current.prediction.winner, strict.prediction.winner)) flags.push('Replay changes when non-pre-match fields are omitted');
  for (const e of [current.error, start.error, live.error, strict.error]) if(e) flags.push(`Algorithm error: ${e}`);
  return {
    matchId: String(r.matchId), league: canonicalLeague(r.competitionName), leagueSource: 'Saved competition name',
    originalLeague: r.competitionName, matchName: r.matchName, team1:r.team1, team2:r.team2,
    startTime: r.startTime, date: dateString(r.startTime), source:'Match record', fixture:fixture(r),
    sources: ['match_dataset', ...(toss ? ['toss_dataset'] : []), ...(cache[String(r.matchId)] ? ['ended_cache'] : [])],
    status: r.status, actualWinner: r.actualWinner || null, actualVerified: eligible,
    winnerSource: r.confirmedByEmail?.startsWith('crex-auto') ? r.confirmedByEmail : r.confirmedByEmail ? 'Manual confirmation' : r.status === 'verified' ? 'Marked verified; source absent' : null,
    savedPrediction: r.predictedWinner || null, savedTier:r.predictionTier, savedReason:r.predictionConfidence || null,
    currentPrediction: current.prediction?.winner || null, currentTier:current.prediction?.tier ?? null,
    currentReason:current.prediction?.reason || current.prediction?.confidence || null,
    pageStartPrediction:start.prediction?.winnerName || null, pageStartReason:start.prediction?.reason || null,
    livePrediction:live.prediction?.winnerName || null, liveReason:live.prediction?.reason || null,
    preFieldsPrediction:strict.prediction?.winner || null,
    savedVerdict:evaluate(r.predictedWinner, r.actualWinner, eligible),
    currentVerdict:evaluate(current.prediction?.winner, r.actualWinner, eligible),
    changed: r.predictedWinner && current.prediction?.winner ? !sameTeam(r.predictedWinner,current.prediction.winner) : null,
    capturedAt:r.capturedAt, snapshotTime:snap.serverTime || null,
    tossSavedPrediction:toss?.predictedWinner || null, tossActualWinner:toss?.actualWinner || null,
    flags,
  };
});

for (const r of tossData.records) {
  if(matchesById.has(String(r.matchId))) continue;
  rows.push({
    matchId:String(r.matchId), league:canonicalLeague(r.competitionName), leagueSource:'Saved competition name',
    originalLeague:r.competitionName, matchName:r.matchName, team1:r.team1, team2:r.team2, startTime:r.startTime,
    date:dateString(r.startTime), source:'Toss record only', sources:['toss_dataset', ...(cache[String(r.matchId)] ? ['ended_cache'] : [])],
    fixture:false, status:'No match record', actualWinner:null, actualVerified:false, winnerSource:null,
    savedPrediction:null, currentPrediction:null, pageStartPrediction:null, livePrediction:null,
    savedVerdict:'Unscored', currentVerdict:'Unscored', changed:null,
    tossSavedPrediction:r.predictedWinner || null, tossActualWinner:r.actualWinner || null,
    flags:['Only toss data saved; match winner and match prediction unavailable'],
  });
}
const covered = new Set(rows.map(r=>r.matchId));
for(const [id, r] of Object.entries(cache)) {
  if(covered.has(id)) continue;
  const team1 = r.matchLoad?.team1?.name || r.runners?.[0]?.name || null;
  const team2 = r.matchLoad?.team2?.name || r.runners?.[1]?.name || null;
  const a = teamLeagues.get(teamAlias(team1)) || new Set();
  const b = teamLeagues.get(teamAlias(team2)) || new Set();
  const shared = [...a].filter(x=>b.has(x));
  const league = shared.length === 1 ? shared[0] : 'League unavailable';
  rows.push({
    matchId:id, league, leagueSource:shared.length === 1 ? 'Inferred: both teams share one saved league' : 'Not saved in cache',
    originalLeague:null, matchName:team1 && team2 ? `${team1} v ${team2}` : `Match ${id}`,
    team1,team2,startTime:null,date:null,source:'Ended cache only',sources:['ended_cache'],fixture:false,
    status:'Cache only',actualWinner:null,actualVerified:false,winnerSource:null,
    savedPrediction:null,currentPrediction:null,pageStartPrediction:null,livePrediction:null,
    savedVerdict:'Unscored',currentVerdict:'Unscored',changed:null,
    tossSavedPrediction:null,tossActualWinner:null,
    flags:['Cache contains end-market odds and load, not a result or pre-match prediction', ...(shared.length === 1 ? ['League inferred from saved team memberships'] : ['League/date unavailable in saved cache'])],
  });
}
rows.sort((a,b)=>a.league.localeCompare(b.league) || (new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime()) || a.matchId.localeCompare(b.matchId));

const verifiedLedger = JSON.parse(fs.readFileSync(path.join(out,'verified-results.json'),'utf8'));
const independentlyChecked = new Map(verifiedLedger.matches.map(r=>[String(r.matchId),r]));
for (const r of rows.filter(r=>!r.fixture)) {
  const v = independentlyChecked.get(r.matchId);
  if (!v) throw new Error(`Missing independent audit row: ${r.matchId}`);
  r.resultVerification = v;
  r.savedDate = r.date;
  r.date = v.sourceStartTime ? dateString(v.sourceStartTime) : r.date;
  r.resultTime = v.sourceStartTime || r.startTime || null;
  r.legacyActualWinner = v.savedWinner;
  r.actualVerified = v.verification==='verified' && v.outcome==='winner';
  r.actualWinner = r.actualVerified ? v.actualWinner : v.verification==='verified' && v.outcome==='no_result' ? 'No Result' : null;
  r.status = r.actualVerified ? 'verified' : v.verification==='verified' && v.outcome==='no_result' ? 'abandoned' : 'pending';
  r.winnerSource = v.source || null;
  r.savedVerdict = evaluate(r.savedPrediction,r.actualWinner,r.actualVerified);
  r.currentVerdict = evaluate(r.currentPrediction,r.actualWinner,r.actualVerified);
  r.flags = r.flags.filter(f=>!f.startsWith('Winner marked verified') && !f.startsWith('Winner name normalized') && !f.startsWith('Only toss data saved'));
  if (r.source==='Toss record only') r.flags.push('Only toss prediction saved; match result independently checked');
  if (v.verification!=='verified') r.flags.push(`Official result unresolved: ${v.verification}`);
}
rows.sort((a,b)=>a.league.localeCompare(b.league) || (a.resultTime || Number.MAX_SAFE_INTEGER)-(b.resultTime || Number.MAX_SAFE_INTEGER) || a.matchId.localeCompare(b.matchId));

const tossRows = tossData.records.map(r=>({
  matchId:String(r.matchId),league:canonicalLeague(r.competitionName),matchName:r.matchName,date:dateString(r.resultVerification?.sourceStartTime || r.startTime),
  resultTime:r.resultVerification?.sourceStartTime || r.startTime, resultVerification:r.resultVerification,
  team1:r.team1,team2:r.team2,status:r.status,actualWinner:r.actualWinner || null,
  actualVerified:validActual(r),fixture:fixture(r),savedPrediction:r.predictedWinner || null,
  savedReason:r.predictionReason || null,version:r.predictorVersion || null,
  savedVerdict:evaluate(r.predictedWinner,r.actualWinner,validActual(r)),
})).sort((a,b)=>a.league.localeCompare(b.league) || (a.resultTime || 0)-(b.resultTime || 0) || a.matchId.localeCompare(b.matchId));
const real = rows.filter(r=>!r.fixture);
const savedMatches = real.filter(r=>r.source==='Match record');
const leagues = [...new Set(real.map(r=>r.league))].sort().map(league=>{
  const group = real.filter(r=>r.league===league);
  const matches = group.filter(r=>r.source==='Match record');
  return {league,total:group.length,matchRecords:matches.length,verified:matches.filter(r=>r.actualVerified).length,
    pending:matches.filter(r=>r.status==='pending').length,noResult:matches.filter(r=>r.status==='abandoned').length,
    extraRecords:group.length-matches.length,saved:scoreRows(matches,'savedPrediction'),current:scoreRows(matches,'currentPrediction'),
    pageStart:scoreRows(matches,'pageStartPrediction'),live:scoreRows(matches,'livePrediction'),
    changed:matches.filter(r=>r.changed).length,inferred:group.filter(r=>r.leagueSource.startsWith('Inferred')).length,
    independentlyVerified:group.filter(r=>r.resultVerification.verification==='verified').length,
    unresolved:group.filter(r=>r.resultVerification.verification!=='verified').length,
    allNoResult:group.filter(r=>r.status==='abandoned').length,
  };
});
const compare = savedMatches.filter(r=>r.currentPrediction && r.pageStartPrediction);
const preCompare = savedMatches.filter(r=>r.currentPrediction && r.preFieldsPrediction);
const totals = {
  uniqueRecords:rows.length,realMatches:real.length,testFixtures:rows.filter(r=>r.fixture).length,
  savedMatchRecords:savedMatches.length,rawMatchRecords:matchData.records.length,
  namedLeagues:leagues.filter(r=>r.league!=='League unavailable').length,unknownLeague:real.filter(r=>r.league==='League unavailable').length,
  verified:savedMatches.filter(r=>r.actualVerified).length,pending:savedMatches.filter(r=>r.status==='pending').length,
  noResult:savedMatches.filter(r=>r.status==='abandoned').length,tossOnly:real.filter(r=>r.source==='Toss record only').length,
  cacheOnly:real.filter(r=>r.source==='Ended cache only').length,
  saved:scoreRows(savedMatches,'savedPrediction'),current:scoreRows(savedMatches,'currentPrediction'),
  pageStart:scoreRows(savedMatches,'pageStartPrediction'),live:scoreRows(savedMatches,'livePrediction'),
  changed:savedMatches.filter(r=>r.changed).length,pageCompared:compare.length,
  pageDisagreements:compare.filter(r=>!sameTeam(r.currentPrediction,r.pageStartPrediction)).length,
  preCompared:preCompare.length,preFieldDifferences:preCompare.filter(r=>!sameTeam(r.currentPrediction,r.preFieldsPrediction)).length,
  confirmationSourceMissing:savedMatches.filter(r=>r.actualVerified && r.winnerSource==='Marked verified; source absent').length,
  tossRecords:tossRows.length,tossVerified:tossRows.filter(r=>r.actualVerified).length,tossSaved:scoreRows(tossRows,'savedPrediction'),
  independentlyVerified:verifiedLedger.matches.filter(r=>r.verification==='verified').length,
  independentlyUnresolved:verifiedLedger.matches.filter(r=>r.verification!=='verified').length,
  publishedWinners:verifiedLedger.matches.filter(r=>r.verification==='verified' && r.outcome==='winner').length,
  allNoResult:verifiedLedger.matches.filter(r=>r.verification==='verified' && r.outcome==='no_result').length,
  missingDates:verifiedLedger.matches.filter(r=>r.verification==='missing_date').length,
};
const checks = {
  uniqueIds:new Set(rows.map(r=>r.matchId)).size===rows.length,
  fullCoverage:new Set([...matchesById.keys(),...tossById.keys(),...Object.keys(cache)]).size===rows.length,
  summaryMatches:leagues.reduce((sum,r)=>sum+r.total,0)===real.length,
  statusReconciliation:totals.verified+totals.pending+totals.noResult===totals.savedMatchRecords,
  sourceFilesUnchanged:sourceNames.every((name,i)=>sourceBuffers[i].equals(fs.readFileSync(path.join(root,'server/data',name)))),
  predictionErrors:rows.flatMap(r=>r.flags.filter(f=>f.startsWith('Algorithm error')).map(error=>({matchId:r.matchId,error}))),
  zeroVolumeFallback:getDefaultAlgorithmPrediction(0,0,0,0,0,0,'Team A','Team B'),
};
if(!checks.uniqueIds || !checks.fullCoverage || !checks.summaryMatches || !checks.statusReconciliation || !checks.sourceFilesUnchanged || checks.predictionErrors.length) throw new Error(`Report validation failed: ${JSON.stringify(checks)}`);
const findings = [
  {title:'Historical replay, not a proven pre-match success rate',detail:'The capture worker saves predictions after a match ends. The record has no separate forecast-issued timestamp or match predictor version. Results below measure agreement with saved winners on historical snapshots, not prospective forecasting accuracy.',file:'server/services/matchCapture.js:147'},
  {title:'Server and page predictions differ',detail:`${totals.pageDisagreements} of ${totals.pageCompared} real saved matches produce different winners in the current server algorithm and frontend match-start algorithm. The page displays both mechanisms.`,file:'frontend/src/pages/MatchDetail.jsx:896'},
  {title:'Some league rules read fields outside the frozen pre-match inputs',detail:`${totals.preFieldDifferences} of ${totals.preCompared} replays change when fields other than preMatchVolume, preMatchPnl, and preMatchTotalBets are omitted. European rules read threeMinVolume; Punjab reads advancedMetricsV2, netSupport, and threeMinPnl; ACC and CPL read deepMetrics.`,file:'server/utils/leagueAlgorithms.js:455'},
  {title:'ETPL accuracy test fails',detail:'Existing server league tests: 38 passed, 1 failed. Match 36057946, Dublin Guardians v Glasgow Cosmic: current prediction Dublin Guardians; saved actual winner Glasgow Cosmic. Frontend match-start/gated-fade tests: 21 passed.',file:'server/tests/etplAlgorithms.test.js:111'},
  {title:'Zero-volume default can invent a pick',detail:'getDefaultAlgorithmPrediction(0,0,0,0,0,0,"Team A","Team B") returns Team A with "75% Sure (Good Buy)" because 0 >= 0 * 1.4. Missing data should not establish confidence.',file:'server/utils/leagueAlgorithms.js:1030'},
  {title:'Duplicate Kerala function hides an earlier implementation',detail:'getKeralaPrediction is declared twice. JavaScript uses the later declaration, whose final return is null, rather than the earlier safe-PnL fallback.',file:'server/utils/leagueAlgorithms.js:417'},
  {title:'Actual winners independently checked',detail:`${totals.independentlyVerified} results were matched to Cricbuzz or official scorecards, including ${totals.allNoResult} no-results. ${totals.independentlyUnresolved} remain unresolved, including ${totals.missingDates} records without saved dates. Previously saved labels are preserved in a backup; unconfirmed labels are excluded from accuracy.`,file:'server/data/verified_match_results.json'},
  {title:'Toss winners independently checked',detail:`${totals.tossRecords} retained toss records have explicit Cricbuzz toss results. Match outcomes were not used as toss outcomes. Original toss predictions remain unchanged, including wrong predictions.`,file:'server/data/verified_toss_results.json'},
];
const report = {generatedAt:new Date().toISOString(),timezone:'Asia/Kolkata',sources,totals,leagues,findings,checks,rows,tossRows,
  methods:[
    'Scope: every unique match in the three saved files, independently checked against Cricbuzz and approved official fallback sources.',
    'Deduplicate by matchId. ACC Mens Premier Cup and ACC Men\'s Premier Cup are grouped under ACC Men\'s Premier Cup.',
    'Actual match winners come only from independently matched public result statements; toss winners and ending odds never become match winners.',
    'Cache-only league assignment is inferred only when both teams share exactly one saved league; otherwise league remains unavailable.',
    'Stored predictions are preserved. Current server/page/live predictions are fresh replays on saved match snapshots, each labeled separately.',
    'After user-requested cleanup, incomplete or unverified records and orphan cache entries are removed from active data. Original files and reports are archived in the cleanup backup. Confirmed no-result records are retained separately from scored winners.',
    'Accuracy denominator: real verified matches with a valid winner and a prediction from that algorithm. Fixtures, pending results, and no-results excluded.',
    verifiedLedger.matchingRule,
    'Tables use the published fixture start in IST when available; the original saved date is retained separately. Undated cache records remain undated and unresolved.',
    'Frontend live predictor intentionally uses late trades; its historical agreement rate is not a pre-match performance estimate.',
    'The pre-fields replay is a diagnostic, not a replacement algorithm or a validated forecasting result.',
  ],
};
fs.writeFileSync(path.join(out,'results.json'),`${JSON.stringify(report,null,2)}\n`);
const lines = ['# Match predictions by league','',`Generated: ${dateString(Date.now())} IST. Sources: saved predictions, Cricbuzz, and official scorecards.`,
  '',`${totals.realMatches} real unique matches across ${totals.namedLeagues} named leagues; ${totals.testFixtures} test fixture retained separately.`,
  `${totals.savedMatchRecords} saved match records: ${totals.verified} verified winners, ${totals.pending} pending, ${totals.noResult} no-result. ${totals.tossOnly} toss-only and ${totals.cacheOnly} cache-only records.`,
  `${totals.independentlyVerified} independently confirmed results across the entire inventory; ${totals.independentlyUnresolved} unresolved, including ${totals.missingDates} without dates.`,
  `Stored predictions: ${totals.saved.correct}/${totals.saved.scored} (${totals.saved.accuracy}%). Current server replay: ${totals.current.correct}/${totals.current.scored} (${totals.current.accuracy}%). These are historical agreement rates.`,
  '', '## Algorithm findings','',...findings.map(f=>`- **${f.title}:** ${f.detail} (${f.file})`),'','## Method','',...report.methods.map(s=>`- ${s}`),'','## Full match list by league',''];
for(const league of leagues) {
  lines.push(`### ${league.league}`,'',`${league.total} matches; ${league.verified} verified. Stored: ${league.saved.correct}/${league.saved.scored}; current replay: ${league.current.correct}/${league.current.scored}.`,'');
  for(const r of real.filter(r=>r.league===league.league)) {
    lines.push(`- **${r.date || 'Date not saved'} · ${r.matchName}** (ID ${r.matchId}). Actual match winner: **${r.actualWinner || 'Unconfirmed / unavailable'}**. Stored match prediction: **${r.savedPrediction || 'Unavailable'}** (${r.savedVerdict}); current server: **${r.currentPrediction || 'Unavailable'}** (${r.currentVerdict}); page match-start: **${r.pageStartPrediction || 'Unavailable'}**. Source: ${r.source}. ${r.leagueSource.startsWith('Inferred') ? 'League inferred. ' : ''}${r.tossSavedPrediction ? `Toss prediction (separate): ${r.tossSavedPrediction}; toss winner: ${r.tossActualWinner || 'Unconfirmed'}. ` : ''}${r.currentReason ? `Current rule: ${r.currentReason}.` : ''}`);
  }
  lines.push('');
}
lines.push('## Test fixture (excluded)','');
for(const r of rows.filter(r=>r.fixture)) lines.push(`- ${r.matchId}: ${r.matchName}; stored ${r.savedPrediction}; saved actual ${r.actualWinner}.`);
lines.push('','## Saved toss predictions (separate outcome)','');
for(const league of [...new Set(tossRows.map(r=>r.league))]) {
  lines.push(`### ${league}`,'');
  for(const r of tossRows.filter(r=>r.league===league)) lines.push(`- ${r.date || 'Date not saved'} · **${r.matchName}** (ID ${r.matchId}): predicted toss **${r.savedPrediction || 'Unavailable'}**; actual toss **${r.actualWinner || 'Unconfirmed'}**; ${r.savedVerdict}.`);
  lines.push('');
}
fs.writeFileSync(path.join(out,'league-wise-results.md'),`${lines.join('\n')}\n`);
console.log(JSON.stringify({totals,checks,leagues:leagues.filter(l=>l.verified)},null,2));
