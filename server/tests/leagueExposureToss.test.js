const test = require('node:test');
const assert = require('node:assert/strict');
const {predictTossWinner,getLeagueTossPrediction} = require('../utils/tossPredictor');
const {getLeagueTossPrediction:dispatch} = require('../utils/tossLeagueAlgorithms');
const fixture = () => ({teamNames:['Alpha','Beta'],teams:{
  Alpha:{trades:[{type:'back',price:2,size:100},{type:'lay',price:3,size:20}]},
  Beta:{trades:[{type:'back',price:2,size:50},{type:'lay',price:2,size:10}]},
},deepMetrics:{totals:{team1:10,team2:999}}});

test('WBBL and all international categories select higher net exposure through every entry point', () => {
  const leagues = ['WBBL','WBBL 2026',"Women's Big Bash League",'Womens Big Bash League','Women’s Big Bash League 2026',
    'International Matches','International Twenty20 Matches','Womens International Twenty20 Matches',
    'T20I','WT20I','One Day Internationals','Womens One Day Internationals','ODI','WODI',
    'Test Matches','Womens Test Matches','Test','Unofficial International Matches',
    'ICC Mens T20 World Cup','ICC Womens Cricket World Cup 2026'];
  for (const league of leagues) {
    for (const competition of [league,{competitionName:league},{seriesName:league}]) {
      for (const fn of [predictTossWinner,getLeagueTossPrediction,dispatch]) {
        const result=fn(fixture(),competition);
        assert.equal(result.winnerName,'Alpha',league);
        assert.equal(result.algorithmEvidence.selection,'higher',league);
        assert.match(result.reason,/higher net exposure/);
      }
    }
    for (const field of ['competitionName','seriesName']) assert.equal(predictTossWinner({...fixture(),[field]:league}).winnerName,'Alpha',league);
  }
});

test('all other leagues including other womens leagues and South Africa select lower exposure', () => {
  for (const league of ['IPL','Big Bash League','BBL','WPL','The Hundred - Womens','WNCL',"Women's T20 Spring Challenge",'South Africa T20 Challenge','SA20','ILT20','International League T20','International Masters League T20','Unknown League','']) {
    const result=predictTossWinner(fixture(),league);
    assert.equal(result.winnerName,'Beta',league);
    assert.equal(result.algorithmEvidence.selection,'lower',league);
  }
  const snapshot={...fixture(),competitionName:'WBBL'};
  assert.equal(predictTossWinner(snapshot,'IPL').winnerName,'Beta');
  assert.equal(predictTossWinner({...fixture(),competitionName:'IPL'},'WBBL').winnerName,'Alpha');
});

test('higher exposure follows team order and ignores provider totals, P/L and result labels', () => {
  const snapshot=fixture();
  snapshot.actualWinner='Beta';
  snapshot.deepMetrics={totals:{team1:999999,team2:0},simplePL:{team1_win:-999999,team2_win:999999}};
  snapshot.preMatchTotalBets={team1:0,team2:999999};
  assert.equal(predictTossWinner(snapshot,'WBBL').winnerName,'Alpha');
  assert.equal(predictTossWinner({...snapshot,teamNames:['Beta','Alpha']},'WBBL').winnerName,'Alpha');
  for (const teams of [undefined,{Alpha:snapshot.teams.Alpha},
    {...snapshot.teams,Beta:{trades:[{type:'lay',price:1,size:10}]}},
    {Alpha:{trades:[]},Beta:{trades:[]}},
    {Alpha:snapshot.teams.Alpha,Beta:snapshot.teams.Alpha}]) {
    assert.equal(predictTossWinner({...snapshot,teams},'WBBL'),null);
  }
});

test('the WBBL screenshot with a zero lay exposure cannot produce a toss winner', () => {
  const snapshot={teamNames:['Adelaide Strikers W','Melbourne Stars W'],competitionName:'WBBL',teams:{
    'Adelaide Strikers W':{trades:[{type:'back',price:2,size:761.23},{type:'lay',price:2,size:14.85}]},
    'Melbourne Stars W':{trades:[{type:'back',price:2,size:666.01},{type:'lay',price:2,size:0}]},
  }};
  assert.equal(predictTossWinner(snapshot),null);
  const result=getLeagueTossPrediction(snapshot);
  assert.equal(result.winnerName,null);
  assert.equal(result.reason,"Prediction data is incomplete, can't predict.");
});

test('Global T20 compares signed net exposure instead of the combined totals from the reported match', () => {
  const snapshot={teamNames:['Brampton Blazers','Mississauga Skyhawks'],teams:{
    'Brampton Blazers':{trades:[{type:'back',price:2,size:59311.35},{type:'lay',price:2,size:2658149.95}]},
    'Mississauga Skyhawks':{trades:[{type:'back',price:2,size:2703616.48},{type:'lay',price:2,size:12774.31}]},
  }};
  for (const competitionName of ['Global T20 Canada','Global T20 League','Global T20','GT20','Global T20 Canada 2026']) {
    for (const fn of [predictTossWinner,getLeagueTossPrediction,dispatch]) {
      const result=fn({...snapshot,competitionName});
      assert.equal(result.winnerName,'Brampton Blazers',competitionName);
      assert.equal(result.algorithmEvidence.selection,'lower');
      assert.match(result.reason,/lower net exposure/);
      assert.ok(Math.abs(result.algorithmEvidence.risk.net[0]-(-2598838.60))<1e-8);
      assert.ok(Math.abs(result.algorithmEvidence.risk.net[1]-2690842.17)<1e-8);
      assert.equal(fn({...snapshot,teamNames:[...snapshot.teamNames].reverse()},competitionName).winnerName,'Brampton Blazers');
    }
  }
  assert.equal(predictTossWinner(snapshot,'WBBL').winnerName,'Mississauga Skyhawks');
  assert.equal(predictTossWinner(snapshot,'T20I').winnerName,'Mississauga Skyhawks');
});
