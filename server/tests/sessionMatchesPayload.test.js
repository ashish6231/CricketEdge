const test = require('node:test');
const assert = require('node:assert/strict');

const dataCache = require('../services/dataCache');
const {
  getSessionMatchesPayload,
  normalizeSessionStatus,
  summarizeSessionData,
} = require('../services/matchPayloadService');

test('normalizeSessionStatus lets an ended status override stale inPlay=true', () => {
  assert.deepEqual(normalizeSessionStatus({ status: 'ended', inPlay: true }), {
    status: 'ended',
    inPlay: false,
  });
  assert.deepEqual(normalizeSessionStatus({ status: 'in-play', inPlay: false }), {
    status: 'in-play',
    inPlay: true,
  });
  assert.deepEqual(normalizeSessionStatus({ status: 'upcoming' }), {
    status: 'upcoming',
    inPlay: false,
  });
});

test('summarizeSessionData counts unique markets and sums matched trade money', () => {
  const result = summarizeSessionData({
    odds: [
      { marketName: '10 Overs Line' },
      { marketName: '20 Overs Line' },
    ],
    markets: [
      { marketName: '20  Overs Line' },
      { marketName: 'Total Runs Line', totalMatched: 999 },
    ],
    trades: [
      { team: '10 Overs Line', size: 25 },
      { marketName: '20 Overs Line', size: '75.5' },
      { market: '10 Overs Line', size: 0 },
    ],
  });

  assert.equal(result.sessionCount, 3);
  assert.equal(result.totalMatched, 100.5);
  assert.equal(result.sessionDataReady, true);
});

test('getSessionMatchesPayload enriches cached cards without upstream requests', async () => {
  const originalGetMatches = dataCache.getSessionMatches;
  const originalGetTrades = dataCache.getSessionTrades;

  dataCache.getSessionMatches = () => [
    { matchId: 'ended', status: 'ended', inPlay: true, startTime: 100 },
    { matchId: 'live', status: 'in-play', inPlay: true, startTime: 200 },
    { matchId: 'next', status: 'upcoming', inPlay: false, startTime: 300 },
  ];
  dataCache.getSessionTrades = async (matchId) => ({
    odds: [{ marketName: `${matchId} market` }],
    trades: matchId === 'ended' ? [{ team: `${matchId} market`, size: 42 }] : [],
  });

  try {
    const payload = await getSessionMatchesPayload();
    assert.deepEqual(payload.matches.map(match => match.matchId), ['live', 'next', 'ended']);
    assert.deepEqual(payload.matches.map(match => match.status), ['in-play', 'upcoming', 'ended']);
    assert.equal(payload.matches[0].sessionCount, 1);
    assert.equal(payload.matches[2].totalMatched, 42);
    assert.equal(payload.matches[2].inPlay, false);
  } finally {
    dataCache.getSessionMatches = originalGetMatches;
    dataCache.getSessionTrades = originalGetTrades;
  }
});
