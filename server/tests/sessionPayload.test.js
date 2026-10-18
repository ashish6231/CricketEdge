const test = require('node:test');
const assert = require('node:assert/strict');

const { compactSessionPayload } = require('../utils/sessionPayload');

test('compactSessionPayload preserves money and bet counts per market/side/price bucket', () => {
  const payload = {
    matchId: '1',
    odds: [{ marketName: '10 Overs Line' }],
    trades: [
      { team: '10 Overs Line', type: 'back', price: 80, size: 10, updatedAt: 1_000_000_000_000 },
      { team: '10 Overs Line', type: 'back', price: 80, size: 15, updatedAt: 1_000_000_010_000 },
      { team: '10 Overs Line', type: 'lay', price: 80, size: 20, updatedAt: 1_000_000_020_000 },
      { team: '10 Overs Line', type: 'back', price: 80, size: 5, updatedAt: 1_000_000_400_000 },
    ],
  };

  const compacted = compactSessionPayload(payload);
  assert.equal(compacted.rawTradeCount, 4);
  assert.equal(compacted.trades.length, 3);
  assert.equal(compacted.trades.reduce((sum, trade) => sum + trade.size, 0), 50);
  assert.equal(compacted.trades.reduce((sum, trade) => sum + trade.tradeCount, 0), 4);
  assert.equal(compacted.odds, payload.odds);
});

test('compactSessionPayload does not mutate the provider response', () => {
  const payload = {
    trades: [
      { team: 'Runs Line', type: 'back', price: 100, size: 2, updatedAt: 1_000_000_000_000 },
      { team: 'Runs Line', type: 'back', price: 100, size: 3, updatedAt: 1_000_000_001_000 },
    ],
  };
  const before = JSON.stringify(payload);

  compactSessionPayload(payload);

  assert.equal(JSON.stringify(payload), before);
});

test('compaction preserves every run settlement and opposing sides across markets', async () => {
  const {computeSessionMetrics,calcSessionPlAtScore}=await import('../../frontend/src/utils/sessionMetrics.js');
  const market='1st Innings 10 Overs Line';
  const trades=Array.from({length:120},(_,index)=>({
    team:index%5===0 ? '2nd Innings 10 Overs Line' : market,
    type:index%3===0?'lay':'back',price:40.5+(index%17),size:(index+1)/10,
    updatedAt:1_000_000_000_000+(index%3)*1000,
  }));
  const compacted=compactSessionPayload({trades});
  assert.ok(compacted.trades.length<trades.length);
  for (const name of [market,'2nd Innings 10 Overs Line']) {
    const before=computeSessionMetrics({marketName:name},trades);
    const after=computeSessionMetrics({marketName:name},compacted.trades);
    assert.equal(after.tradeCount,before.tradeCount);
    assert.ok(Math.abs(after.totalVol-before.totalVol)<1e-8);
    for (let score=0;score<=100;score++) {
      assert.equal(calcSessionPlAtScore(after.lines,score),calcSessionPlAtScore(before.lines,score),`${name}: ${score}`);
    }
  }
});

test('malformed rows survive compaction and prevent certification of a partial ledger', async () => {
  const {computeSessionMetrics}=await import('../../frontend/src/utils/sessionMetrics.js');
  const marketName='1st Innings 6 Overs Line';
  const valid={team:marketName,type:'back',price:50.5,size:10};
  for (const change of [{price:null},{price:' '},{size:' '},{size:-2},{type:'unknown'},{tradeCount:1.5}]) {
    const payload=compactSessionPayload({trades:[valid,valid,{...valid,...change}]});
    const metrics=computeSessionMetrics({marketName},payload.trades);
    assert.equal(metrics.invalidTradeCount,1);
    assert.equal(metrics.ledgerStatus,'invalid');
    assert.deepEqual(metrics.plRowsFull,[]);
  }
});

test('malformed unassigned rows cannot crash compaction', () => {
  const payload={trades:[null,{team:'6 Overs Line',type:'yes',price:50.5,size:10}]};
  assert.equal(compactSessionPayload(payload).trades.length,2);
});
