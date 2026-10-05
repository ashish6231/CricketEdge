const test = require('node:test');
const assert = require('node:assert/strict');

const { fingerprintMatchBundle } = require('../utils/matchBundleFingerprint');

function sampleBundle() {
  return {
    matchId: '123',
    updatedAt: '2026-10-05T10:00:00.000Z',
    cricket: {
      serverTime: '2026-10-05T10:00:00.000Z',
      updatedAt: '2026-10-05T10:00:00.000Z',
      runners: [{ name: 'India', price: 1.8 }],
      teams: {
        India: { trades: [{ price: 1.8, size: 500, updatedAt: 1234 }] },
      },
    },
    toss: null,
    session: null,
    crex: { score1: '125/3', runningBall: '14.2' },
  };
}

test('poll-only root timestamps do not trigger another bundle broadcast', () => {
  const first = sampleBundle();
  const second = sampleBundle();

  second.updatedAt = '2026-10-05T10:00:05.000Z';
  second.cricket.serverTime = '2026-10-05T10:00:05.000Z';
  second.cricket.updatedAt = '2026-10-05T10:00:05.000Z';

  assert.equal(fingerprintMatchBundle(first), fingerprintMatchBundle(second));
});

test('score, odds, and nested trade changes trigger another bundle broadcast', () => {
  const base = sampleBundle();

  const scoreChanged = structuredClone(base);
  scoreChanged.crex.score1 = '129/3';
  assert.notEqual(fingerprintMatchBundle(base), fingerprintMatchBundle(scoreChanged));

  const oddsChanged = structuredClone(base);
  oddsChanged.cricket.runners[0].price = 1.72;
  assert.notEqual(fingerprintMatchBundle(base), fingerprintMatchBundle(oddsChanged));

  const tradeChanged = structuredClone(base);
  tradeChanged.cricket.teams.India.trades.push({ price: 1.72, size: 300, updatedAt: 5678 });
  assert.notEqual(fingerprintMatchBundle(base), fingerprintMatchBundle(tradeChanged));
});
