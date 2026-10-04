const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {predictMatchWinner} = require('../utils/matchWinnerPredictor');
const {extractMatchFeatures,predictLeagueMatch,FEATURE_NAMES} = require('../utils/matchLeagueModel.js');
const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/match_dataset.json'))).records;
const eligible=rows.filter(r=>r.status==='verified'&&r.actualWinner!=='No Result');
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const input=r=>({...structuredClone(r.snapshot),competitionName:r.competitionName});

function anonymous(value,names){
  if(typeof value==='string')return names.reduce((s,n,i)=>s.replaceAll(n,`Anonymous ${i}`),value);
  if(Array.isArray(value))return value.map(v=>anonymous(v,names));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[anonymous(k,names),anonymous(v,names)]));
  return value;
}

test('historical-fit replay covers every usable verified match; zero-input records remain abstentions',()=>{
 let correct=0,unscored=0;
 for(const r of eligible){const snap=input(r),p=predictMatchWinner(snap,{mode:'historical-fit'});
  if(!p){assert.equal(extractMatchFeatures(snap),null);unscored++;continue;}
  assert.equal(norm(p.winner),norm(r.actualWinner),`Historical training fit mismatch: ${r.matchId}`);correct++;
  assert.equal(p.validation,'in-sample');assert.equal(p.confidenceCalibrated,false);
 }
 assert.equal(correct,eligible.length);assert.equal(unscored,0);assert.equal(correct+unscored,eligible.length);
});

test('historical-fit trees are invariant to fixture IDs, team identity and derived live fields',()=>{
 for(const r of eligible){const snap=input(r),p=predictLeagueMatch(snap);
  const altered=anonymous(snap,snap.teamNames);altered.matchId='arbitrary-unseen-ID';altered.actualWinner='Fabricated';altered.score={winner:'Fabricated'};altered.marketSignals={prediction:{prediction:'Fabricated'}};altered.advancedMetricsV2={team1:{back:1e15,lay:1e15},team2:{back:1e15,lay:1e15}};altered.teams={};altered.threeMinVolume={team1:{back:1e15},team2:{back:0}};
  const q=predictLeagueMatch(altered);
  assert.equal(q?.winnerIdx,p?.winnerIdx,`Forbidden input dependence: ${r.matchId}`);
  assert.equal(q?.reason,p?.reason);
 }
});

test('historical-fit forecasts are symmetric when team positions and frozen metrics are swapped',()=>{
 for(const r of eligible){const snap=input(r),p=predictLeagueMatch(snap),swapped=structuredClone(snap);swapped.teamNames=[snap.teamNames[1],snap.teamNames[0]];
  for(const key of ['preMatchVolume','preMatchPnl','preMatchTotalBets'])if(snap[key])swapped[key]={team1:snap[key].team2,team2:snap[key].team1};
  const q=predictLeagueMatch(swapped);assert.equal(q?.winner,p?.winner,`Team position bias: ${r.matchId}`);
 }
});

test('no predictor mutates the caller snapshot or caches an incomplete response by ID',()=>{
 const first={matchId:'same-id',teamNames:['Alpha','Beta'],preMatchVolume:{team1:{back:0,lay:0},team2:{back:0,lay:0}},competitionName:'Unseen League'};
 assert.equal(predictMatchWinner(first),null);
 const complete={...first,preMatchVolume:{team1:{back:200,lay:50},team2:{back:10,lay:1}}};
 const before=JSON.stringify(complete);assert.equal(predictMatchWinner(complete)?.winner,'Alpha');assert.equal(JSON.stringify(complete),before);
 const changed={...complete,preMatchVolume:{team1:complete.preMatchVolume.team2,team2:complete.preMatchVolume.team1}};
 assert.equal(predictMatchWinner(changed)?.winner,'Beta');
});

test('zero frozen flow does not fall back to in-play volumes, final P/L or supplied actual result',()=>{
 const snap={teamNames:['Alpha','Beta'],competitionName:'Caribbean Premier League',preMatchVolume:{team1:{back:0,lay:0},team2:{back:0,lay:0}},advancedMetricsV2:{team1:{back:10000,lay:1000},team2:{back:10,lay:0}},deepMetrics:{simplePL:{team1_win:99999,team2_win:-99999}},actualWinner:'Alpha'};
 assert.equal(predictMatchWinner(snap),null);assert.equal(predictMatchWinner(snap,{mode:'historical-fit'}),null);
});

test('perfectly symmetric frozen metrics abstain rather than choosing a team by position',()=>{
 assert.equal(predictLeagueMatch({teamNames:['Alpha','Beta'],preMatchVolume:{team1:{back:100,lay:50},team2:{back:100,lay:50}},preMatchPnl:{team1:0,team2:0}}),null);
});

test('a T20 public back blowout alone does not unconditionally fade the favourite',()=>{
 const snap={teamNames:['Alpha','Beta'],competitionName:'International Twenty20 Matches',preMatchVolume:{team1:{back:12000,lay:400},team2:{back:100,lay:50}},preMatchPnl:{team1:-11000,team2:11500}};
 assert.equal(predictMatchWinner(snap)?.winner,'Alpha');
});

test('unrecognized mode is rejected and fitted trees are explicitly selected',()=>{
 const snap=input(eligible.find(r=>extractMatchFeatures(input(r))));
 assert.throws(()=>predictMatchWinner(snap,{mode:'perfect'}),/Unknown match prediction mode/);
 assert.equal(predictMatchWinner(snap).modelScope,'rules');
 assert.equal(predictMatchWinner(snap,{mode:'historical-fit'}).validation,'in-sample');
 assert.ok(FEATURE_NAMES.every(name=>!/(matchId|teamName|winner|date|score)/i.test(name)));
});


test('payload metadata clears a stale AI forecast when frozen inputs are empty',()=>{
 const {attachMatchMeta}=require('../services/matchPayloadService');
 const snap={teamNames:['Alpha','Beta'],preMatchVolume:{team1:{back:0,lay:0},team2:{back:0,lay:0}},aiPrediction:{winner:'Alpha',confidence:'99%'}};
 const result=attachMatchMeta(snap,{competitionName:'International Twenty20 Matches',status:'ended'});
 assert.equal(result.aiPrediction,undefined);
 assert.equal(snap.aiPrediction.winner,'Alpha');
});
