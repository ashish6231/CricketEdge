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
