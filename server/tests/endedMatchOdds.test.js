const test=require('node:test');
const assert=require('node:assert/strict');
const {savedBackOdds,hasCompleteCardOdds,repairCompletedCardOdds}=require('../utils/endedMatchOdds.mjs');
const entry=()=>({matchLoad:{team1:{name:'Alpha',money:123,percent:60,odds:null},team2:{name:'Beta',money:82,percent:40,odds:null},totalMatched:205},runners:[],totalMatched:205});

test('completed cards recover missing odds from saved Back history without changing money or shares',()=>{
  const old=entry();
  const snapshot={teams:{Alpha:{trades:[{type:'back',price:2.2,updatedAt:1700000000000},{type:'lay',price:9,updatedAt:1700000005000}]},
    Beta:{trades:[{type:'back',price:1.8,updatedAt:1700000000000}]}}};
  const repaired=repairCompletedCardOdds(old,snapshot);
  assert.equal(repaired.matchLoad.team1.odds,2.2);assert.equal(repaired.matchLoad.team2.odds,1.8);
  assert.equal(hasCompleteCardOdds(repaired),true);
  assert.equal(repaired.matchLoad.team1.money,123);assert.equal(repaired.matchLoad.team2.percent,40);
  assert.equal(old.matchLoad.team1.odds,null);
  assert.equal(repairCompletedCardOdds(repaired,snapshot),repaired);
});

test('latest valid Back prices use parsed dates and team identity, including reversed runners and Draw',()=>{
  const snap={teams:{Alpha:{trades:[{side:'B',price:'2.4',updatedAt:'2026-11-01T08:00:00Z'},
    {type:'back',price:1,updatedAt:'2026-11-01T09:00:00Z'},{type:'back',price:2.1,updatedAt:Date.parse('2026-11-01T08:30:00Z')/1000}]}},
    runners:[{runnerName:'Beta',back:3},{runnerName:'The Draw',back:4},{runnerName:'Alpha',back:7}]};
  assert.equal(savedBackOdds(snap,'Alpha'),2.1);
  assert.equal(savedBackOdds(snap,'Beta'),3);
  assert.equal(savedBackOdds(snap,'Missing'),null);
});

test('Lay-only history, settlement zeros and synthetic averages never become Back odds',()=>{
  const snap={teams:{Alpha:{trades:[{type:'lay',price:1.9},{type:'back',price:0},{type:'back',price:'bad'}]}},
    syntheticSupport:{teamA:{averageOdds:2}},runners:[{runnerName:'Alpha',back:0,lay:1.8}]};
  assert.equal(savedBackOdds(snap,'Alpha'),null);
  assert.equal(repairCompletedCardOdds(entry(),snap).matchLoad.team1.odds,null);
});

test('existing frozen prices survive and only the missing side is repaired from named quotes',()=>{
  const old=entry();old.matchLoad.team1.odds=1.01;
  const repaired=repairCompletedCardOdds(old,{odds:{Beta:{back:1000},Alpha:{back:5}}});
  assert.equal(repaired.matchLoad.team1.odds,1.01);
  assert.equal(repaired.matchLoad.team2.odds,1000);
  assert.equal(hasCompleteCardOdds(repaired),true);
});
