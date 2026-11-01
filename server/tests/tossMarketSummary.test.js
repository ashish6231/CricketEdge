const test=require('node:test');
const assert=require('node:assert/strict');
const {getTossMarketSummary}=require('../utils/tossMarketSummary.mjs');
const snapshot=()=>({teamNames:['New Zealand','India'],serverTime:1793517000000,
  advancedMetrics:{team1:{back:100,lay:20},team2:{back:60,lay:40}},
  advancedMetricsV2:{team1:{totalBet:999999},team2:{totalBet:888888}},
  teams:{'New Zealand':{trades:[{type:'back',price:2,size:100,updatedAt:10},{type:'lay',price:2,size:20,updatedAt:11}]},
    India:{trades:[{type:'back',price:2,size:60,updatedAt:10},{type:'lay',price:2,size:40,updatedAt:11}]}},
  runners:[{runnerName:'India',back:1.99,backSize:3000000},{runnerName:'New Zealand',back:1.98,backSize:2000000}]});

test('toss summaries contain named live odds, liquidity, matched stakes and signed net exposure',()=>{
  const result=getTossMarketSummary(snapshot());
  assert.deepEqual(result.team1,{name:'New Zealand',money:120,odds:1.98,liquidity:2000000,netExposure:80});
  assert.deepEqual(result.team2,{name:'India',money:100,odds:1.99,liquidity:3000000,netExposure:20});
  assert.equal(result.totalMatched,220);
  assert.equal(result.available,true);
});

test('changed snapshots update cards without using pre-match totals or V2 liability as money',()=>{
  const data=snapshot();data.advancedMetrics.team1.back=200;
  data.runners[1].back=2.04;data.runners[1].backSize=1234;
  data.teams['New Zealand'].trades[0].size=200;
  data.preMatchTotalBets={team1:999999,team2:999999};
  const next=getTossMarketSummary(data);
  assert.equal(next.team1.money,220);assert.equal(next.totalMatched,320);
  assert.equal(next.team1.odds,2.04);assert.equal(next.team1.liquidity,1234);assert.equal(next.team1.netExposure,180);
});

test('missing values stay unknown instead of becoming zero money and invented equal support',()=>{
  const result=getTossMarketSummary(null,{matchName:'Alpha v Beta'});
  assert.equal(result.totalMatched,null);assert.equal(result.available,false);
  for(const team of [result.team1,result.team2]) {
    for(const key of ['money','odds','liquidity','netExposure'])assert.equal(team[key],null);
    assert.equal('percent' in team,false);
  }
});

test('real zero money is preserved and recent matched odds remain usable without a live book',()=>{
  const data=snapshot();delete data.runners;data.advancedMetrics.team1={back:0,lay:0};
  data.teams['New Zealand'].trades=[];
  data.teams.India.trades.push({type:'back',price:2.02,size:1,updatedAt:12});
  const result=getTossMarketSummary(data,{totalMatched:0});
  assert.equal(result.team1.money,0);assert.equal(result.team1.netExposure,0);
  assert.equal(result.team2.odds,2.02);assert.equal(result.team2.liquidity,null);
  assert.equal(result.totalMatched,100);
});
