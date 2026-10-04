const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {predictMatchWinner} = require('../utils/matchWinnerPredictor');
const {normalizeFrozenMatchInput,predictFrozenLeagueBase} = require('../utils/normalLeagueMatchPredictor.mjs');
const {LEAGUE_PREMATCH_ADJUSTMENTS} = require('../utils/leaguePreMatchAdjustments.mjs');
const rows = JSON.parse(fs.readFileSync(require.resolve('../data/match_dataset.json'))).records;
const v7Baseline = JSON.parse(fs.readFileSync(require.resolve('../../reports/match-predictions/failure-audit/v7-baseline.json'))).rows;
const input = r => ({...structuredClone(r.snapshot),competitionName:r.competitionName});
function anonymize(value,names) {
 if(typeof value==='string')return names.reduce((s,n,i)=>s.replaceAll(n,`Anonymous ${i}`),value);
 if(Array.isArray(value))return value.map(v=>anonymize(v,names));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[anonymize(k,names),anonymize(v,names)]));
 return value;
}

test('normal predictions ignore final results, live signals, IDs and team identity for every saved snapshot',()=>{
 for(const r of rows){const snap=input(r),before=predictMatchWinner(snap),changed=anonymize(snap,snap.teamNames);
  changed.matchId='unseen-fixture';changed.actualWinner='Fabricated';changed.startTime=1;changed.score={winner:'Fabricated'};
  changed.deepMetrics={simplePL:{team1_win:1e20,team2_win:-1e20},derivedPL:{team1_win:-1e20,team2_win:1e20}};
  changed.marketSignals={bookieFavouriteOutcome:'Anonymous 1',riskTeam:'Anonymous 0'};
  changed.advancedMetricsV2={team1:{lay:1e20,back:1},team2:{lay:1,back:1e20}};
  changed.netSupport={strongerTeam:'Anonymous 1',valA:1,valB:1e20};
  changed.threeMinVolume={team1:{back:1e20,lay:1},team2:{back:1,lay:1e20}};
  changed.threeMinPnl={team1:-1e20,team2:1e20};changed.teams={};changed.smartMoney={};
  assert.equal(predictMatchWinner(changed)?.winnerIdx,before?.winnerIdx,`Forbidden input: ${r.matchId}`);
 }
});

test('swapping frozen team positions preserves the predicted winner',()=>{
 for(const r of rows){const snap=input(r),a=predictMatchWinner(snap),other=structuredClone(snap);
  other.teamNames=[snap.teamNames[1],snap.teamNames[0]];
  for(const key of ['preMatchVolume','preMatchPnl','preMatchTotalBets'])if(snap[key])other[key]={team1:snap[key].team2,team2:snap[key].team1};
  assert.equal(predictMatchWinner(other)?.winner,a?.winner,`Position bias: ${r.matchId}`);
 }
});

test('frozen input normalization excludes extra fields and recomputes total from back plus lay',()=>{
 const raw={teamNames:['A','B'],preMatchVolume:{team1:{back:100,lay:50,total:1e15},team2:{back:10,lay:0,total:1e20}},preMatchPnl:{team1:NaN,team2:Infinity},actualWinner:'B',threeMinPnl:{team1:1e20,team2:-1e20}};
 const before=JSON.stringify(raw),snap=normalizeFrozenMatchInput(raw);
 assert.deepEqual(Object.keys(snap).sort(),['competitionName','preMatchPnl','preMatchTotalBets','preMatchVolume','teamNames']);
 assert.equal(snap.preMatchVolume.team1.total,150);assert.equal(snap.preMatchVolume.team2.total,10);
 assert.ok(Number.isFinite(snap.preMatchPnl.team1));assert.equal(JSON.stringify(raw),before);
 assert.equal(predictMatchWinner({...raw,preMatchVolume:{team1:{back:NaN,lay:-5},team2:{back:Infinity,lay:0}}}),null);
});

test('symmetric nonzero data abstains and zero-back ties do not pick the first team',()=>{
 const snap={teamNames:['A','B'],preMatchVolume:{team1:{back:0,lay:100},team2:{back:0,lay:100}}};
 assert.equal(predictMatchWinner(snap),null);
 const a={...snap,preMatchVolume:{team1:{back:0,lay:100},team2:{back:0,lay:110}}};
 assert.equal(predictFrozenLeagueBase(a).winner,'B');
});

test('league adjustment limits prevent single-record rules and inference does not consult stored labels',()=>{
 const allowed=new Set(['back','lay','total','activity','pnl','ownLay','oppLay','volume','activitySurplus','pnlPressure','netFlow','layFraction','otherLayFraction']);
 for(const settings of Object.values(LEAGUE_PREMATCH_ADJUSTMENTS)){
  assert.ok(settings.rules.length<=2);
  const sequentialGuard=String(settings.selection).startsWith('two-earlier-zero-regression-');
  if(settings.rules.length)assert.ok(settings.samples>=6||sequentialGuard&&settings.samples>=5);
  for(const rule of settings.rules){assert.ok(rule.support>=4||sequentialGuard&&rule.support>=3);assert.ok(rule.corrected>=2);assert.ok(rule.conditions.length<=2);
   for(const condition of rule.conditions){assert.ok(allowed.has(condition.feature));assert.ok(Number.isFinite(condition.threshold));}
  }
 }
});

test('TNPL sequential guard corrects the repeated low-volume misses without changing prior correct rows',()=>{
 const leagueRows=rows.filter(row=>row.competitionName==='Tamil Nadu Premier League'&&row.status==='verified'&&row.actualWinner!=='No Result');
 const base=leagueRows.map(row=>predictFrozenLeagueBase(input(row))?.winner===row.actualWinner);
 const active=leagueRows.map(row=>predictMatchWinner(input(row))?.winner===row.actualWinner);
 assert.equal(base.filter(Boolean).length,5);
 assert.equal(active.filter(Boolean).length,8);
 assert.ok(base.every((correct,index)=>!correct||active[index]));
});

test('v8 preserves every correct v7 match while correcting the validated TNPL cluster',()=>{
 const byId=new Map(rows.map(row=>[String(row.matchId),row])),corrections=[];
 for(const previous of v7Baseline){
  const row=byId.get(previous.matchId),current=predictMatchWinner(input(row));
  const correct=current?.winner===row.actualWinner;
  if(previous.correct)assert.ok(correct,`v7 regression: ${previous.matchId}`);
  else if(correct)corrections.push(previous.matchId);
 }
 assert.deepEqual(corrections.sort(),['35948552','35955958','35988179']);
});

test('mens ODI extreme-flow guard would select West Indies without using team identity',()=>{
 const record=rows.find(row=>String(row.matchId)==='36137653');
 const snap=input(record),prediction=predictMatchWinner(snap);
 assert.equal(prediction.winner,'West Indies');
 assert.equal(prediction.ruleFamily,'league-prematch-adjustment');
 assert.match(prediction.reason,/total-flow share >= 0\.9 and total-flow share <= 0\.975/);
 const anonymous=anonymize(snap,snap.teamNames);
 assert.equal(predictMatchWinner(anonymous).winnerIdx,prediction.winnerIdx);
});
