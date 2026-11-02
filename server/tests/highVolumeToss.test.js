const test=require('node:test');
const assert=require('node:assert/strict');
const {predictTossWinner,getLeagueTossPrediction}=require('../utils/tossPredictor');
const {getLeagueTossPrediction:dispatch}=require('../utils/tossLeagueAlgorithms');
const {getTossRuleInputs}=require('../utils/universalTossAlgorithm.mjs');
const {getSimpleBookiePl}=require('../utils/bookiePl.mjs');
const fixture=()=>({teamNames:['Alpha','Beta'],teams:{
  Alpha:{trades:[{type:'back',size:100,price:3},{type:'lay',size:20,price:4}]},
  Beta:{trades:[{type:'back',size:30,price:5},{type:'lay',size:10,price:2}]},
}});

test('matched volume never reverses the league exposure pick at, below or above one million',()=>{
  for(const league of ['WBBL','T20I','One Day Internationals','Global T20 Canada','South Africa T20 Challenge','IPL']) {
    const expected=predictTossWinner(fixture(),league).winnerName;
    for(const totalMatched of [0,999999.99,1000000,1000000.01,5000000,1000000000,null,undefined]) {
      for(const fn of [predictTossWinner,getLeagueTossPrediction,dispatch]) {
        const result=fn({...fixture(),totalMatched},league);
        assert.equal(result.winnerName,expected,`${league}: ${totalMatched}`);
        assert.equal(result.volumeOverride,undefined);
        assert.doesNotMatch(result.reason,/reversal|volume/i);
      }
    }
  }
});

test('large matched stakes and toss-list metadata do not affect the winner',()=>{
  const snap={...fixture(),advancedMetrics:{team1:{back:600000,lay:100000},team2:{back:300000,lay:100001}}};
  assert.equal(predictTossWinner(snap,'WBBL').winnerName,'Alpha');
  assert.equal(predictTossWinner(snap,{competitionName:'WBBL',totalMatched:5000000}).winnerName,'Alpha');
});

test('high volume still cannot bypass incomplete or tied exposure',()=>{
  for(const mutate of [s=>s.teams.Alpha.trades[0].size=0,s=>delete s.teams.Beta.trades,
    s=>s.teams.Alpha.trades[0].price=1,s=>s.teams.Beta.trades=structuredClone(s.teams.Alpha.trades)]) {
    const snap={...fixture(),totalMatched:5000000};mutate(snap);
    assert.equal(predictTossWinner(snap,'WBBL'),null);
  }
});

test('removing volume reversal preserves the match-page P/L formula and frontend/backend parity',async()=>{
  const snap={...fixture(),totalMatched:5000000,competitionName:'WBBL'};
  const pl=getSimpleBookiePl(snap,'Alpha','Beta');
  assert.deepEqual(getTossRuleInputs(snap).pl,[pl.pl1,pl.pl2]);
  assert.deepEqual([pl.pl1,pl.pl2],[-180,-110]);
  const frontend=await import('../../frontend/src/utils/tossPredictor.js');
  assert.deepEqual(frontend.predictTossWinner(snap),predictTossWinner(snap));
  assert.equal(predictTossWinner(snap).winnerName,'Alpha');
  assert.equal(predictTossWinner({...snap,teamNames:['Beta','Alpha']}).winnerName,'Alpha');
});
