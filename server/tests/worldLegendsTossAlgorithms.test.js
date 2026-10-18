const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {predictTossWinner,getLeagueTossPrediction}=require('../utils/tossPredictor');
const {WORLD_LEGENDS_TOSS_VERSION,isWorldLegendsTossLeague}=require('../utils/worldLegendsTossAlgorithm');
const league='World Championship of Legends T20';
const snap=()=>({teamNames:['Alpha','Beta'],preMatchTotalBets:{team1:300,team2:100}});

test('Legends toss uses only higher toss activity with no back/lay requirement',()=>{
  const result=predictTossWinner(snap(),league);
  assert.equal(result.winnerName,'Alpha');
  assert.equal(result.predictorVersion,WORLD_LEGENDS_TOSS_VERSION);
  assert.equal(result.activeSignals,1);
  assert.equal(result.algorithmEvidence.activity.team1,300);
  assert.equal(result.trainingSamples,0);
  assert.equal(result.confidence.calibrated,false);
  assert.equal(result.risk.calibrated,false);
  assert.equal(predictTossWinner({...snap(),preMatchTotalBets:{team1:0,team2:20}},league).winnerName,'Beta');
});

test('only explicit Legends metadata selects the rule, including object arguments',()=>{
  for(const name of [league,'World Championship of Legends 2026','WCL','WCL T20 2026']) {
    assert.equal(isWorldLegendsTossLeague(name),true);
    for(const comp of [name,{competitionName:name},{seriesName:name}]) assert.equal(predictTossWinner(snap(),comp).predictorVersion,WORLD_LEGENDS_TOSS_VERSION);
  }
  const withFlow={...snap(),preMatchVolume:{team1:{back:10,lay:1},team2:{back:5,lay:1}}};
  for(const name of ['Legends League Cricket','Champions League','Womens T20 Spring Challenge','']) assert.equal(isWorldLegendsTossLeague(name),false);
  assert.equal(predictTossWinner({...snap(),competitionName:league}).predictorVersion,WORLD_LEGENDS_TOSS_VERSION);
  assert.notEqual(predictTossWinner({...withFlow,competitionName:league},'Caribbean Premier League')?.predictorVersion,WORLD_LEGENDS_TOSS_VERSION);
});

test('back/lay reversals, conflicting support, P/L and actual results never override higher activity',()=>{
  const baseline=predictTossWinner(snap(),league);
  for(const volume of [{team1:{back:300,lay:100},team2:{back:1,lay:0}},
    {team1:{back:300,lay:0},team2:{back:1,lay:0}}, {team1:{back:0,lay:1},team2:{back:999999,lay:0}}]) {
    assert.deepEqual(predictTossWinner({...snap(),preMatchVolume:volume,
      preMatchPnl:{team1:-999999,team2:999999},actualWinner:'Beta',inPlayTotalBets:{team1:0,team2:999999}},league),baseline);
  }
  const reversed=predictTossWinner({...snap(),teamNames:['Beta','Alpha'],preMatchTotalBets:{team1:100,team2:300}},league);
  assert.equal(reversed.winnerName,baseline.winnerName);
  assert.equal(reversed.winnerIdx,1);
});

test('missing, invalid or equal toss activity abstains without the generic waterfall',()=>{
  for(const activity of [undefined,{team1:300,team2:300},{team1:0,team2:0},{team1:10},{team1:10,team2:''},{team1:null,team2:10},{team1:-1,team2:10},{team1:Infinity,team2:10},{team1:NaN,team2:10}]) {
    const input={...snap(),preMatchTotalBets:activity,preMatchVolume:{team1:{back:100,lay:1},team2:{back:1,lay:0}}};
    assert.equal(getLeagueTossPrediction(input,league).abstain,true);
    assert.equal(predictTossWinner(input,league),null);
  }
  for(const names of [['Only'],['Same','Same']]) assert.equal(predictTossWinner({...snap(),teamNames:names},league),null);
});

test('archived toss replay follows higher activity even when older fitted rules reversed it',()=>{
  const {rows}=JSON.parse(fs.readFileSync(path.join(__dirname,'../../reports/legends-toss-analysis/inputs.json'),'utf8'));
  let correct=0,wrong=0;
  for(const row of rows.filter(r=>r.status==='verified')) {
    const before=JSON.stringify(row.snapshot);
    const result=predictTossWinner(row.snapshot,row.competitionName);
    if(result.winnerName===row.actualWinner)correct++;else wrong++;
    assert.equal(JSON.stringify(row.snapshot),before);
  }
  assert.equal(correct,5);
  assert.equal(wrong,2);
});

test('frontend/backend and match/toss use the same activity comparison but independent snapshots',async()=>{
  const frontend=await import('../../frontend/src/utils/tossPredictor.js');
  const {predictNormalLeagueMatch}=require('../utils/normalLeagueMatchPredictor.mjs');
  const toss=snap();
  assert.deepEqual(frontend.predictTossWinner(toss,league),predictTossWinner(toss,league));
  const match={...snap(),competitionName:league,preMatchTotalBets:{team1:50,team2:1000}};
  assert.equal(predictNormalLeagueMatch(match).winner,'Beta');
  assert.equal(predictTossWinner(toss,league).winnerName,'Alpha');
});
