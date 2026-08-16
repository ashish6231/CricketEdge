const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const { createStore } = require('../services/tossDatasetStore');
const { captureEndedTosses } = require('../services/tossCapture');
const { startTossCaptureWorker } = require('../services/tossCaptureWorker');

function tempStore() {
  return createStore({
    filePath: path.join(os.tmpdir(), `toss_cap_${Date.now()}_${Math.random().toString(16).slice(2)}.json`),
  });
}

test('captures only ended matches with volume', async () => {
  const store = tempStore();
  const calls = [];
  const scraper = {
    async getAllTossMatches() {
      return [
        { matchId: '1', matchName: 'A v B', status: 'ended', totalMatched: 100, competitionName: 'X', startTime: '2026-08-01T00:00:00.000Z' },
        { matchId: '2', matchName: 'C v D', status: 'in-play', totalMatched: 100 },
        { matchId: '3', matchName: 'E v F', status: 'ended', totalMatched: 0 },
      ];
    },
    async getTossSnapshot(matchId) {
      calls.push(matchId);
      return {
        teamNames: ['Team A', 'Team B'],
        marketId: 'mk1',
      };
    },
  };
  const summary = await captureEndedTosses({
    scraper,
    store,
    predictTossWinner: () => ({
      winnerName: 'Team A',
      reason: 'Higher Lay Trades',
      risk: { tier: 'medium' },
      matchedRules: [{ reason: 'Higher Lay Trades' }],
    }),
  });
  assert.equal(summary.scanned, 1);
  assert.equal(summary.captured, 1);
  assert.equal(summary.skipped, 0);
  assert.equal(summary.failed, 0);
  assert.deepEqual(calls, ['1']);
  const listed = await store.listRecords({ status: 'pending', page: 1, limit: 20 });
  assert.equal(listed.records[0].team1, 'Team A');
  assert.equal(listed.records[0].predictedWinner, 'Team A');
});

test('skips already captured matchIds', async () => {
  const store = tempStore();
  await store.upsertPendingCapture({
    matchId: '1',
    marketId: null,
    matchName: 'A v B',
    competitionName: null,
    team1: 'Team A',
    team2: 'Team B',
    startTime: null,
    endedAt: null,
    capturedAt: new Date().toISOString(),
    snapshot: { teamNames: ['Team A', 'Team B'] },
    predictedWinner: 'Team A',
    predictionReason: 'x',
    predictionRisk: {},
    matchedRules: [],
    predictorVersion: 'production',
    actualWinner: null,
    status: 'pending',
    confirmedAt: null,
    confirmedByEmail: null,
    confirmedById: null,
    lastCaptureError: null,
  });
  let snapCalls = 0;
  const summary = await captureEndedTosses({
    store,
    scraper: {
      async getAllTossMatches() {
        return [{ matchId: '1', matchName: 'A v B', status: 'ended', totalMatched: 10 }];
      },
      async getTossSnapshot() {
        snapCalls += 1;
        return { teamNames: ['Team A', 'Team B'] };
      },
    },
    predictTossWinner: () => ({ winnerName: 'Team A', reason: 'x', risk: {}, matchedRules: [] }),
  });
  assert.equal(summary.skipped, 1);
  assert.equal(summary.captured, 0);
  assert.equal(snapCalls, 0);
});

test('counts snapshot failures', async () => {
  const store = tempStore();
  const summary = await captureEndedTosses({
    store,
    scraper: {
      async getAllTossMatches() {
        return [{ matchId: '9', matchName: 'X v Y', status: 'ended', totalMatched: 5 }];
      },
      async getTossSnapshot() {
        return { error: 'No toss data' };
      },
    },
    predictTossWinner: () => ({ winnerName: 'X', reason: 'x', risk: {}, matchedRules: [] }),
  });
  assert.equal(summary.failed, 1);
});

test('worker overlap guard skips concurrent ticks', async () => {
  let runs = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const worker = startTossCaptureWorker({
    intervalMs: 20,
    captureEndedTosses: async () => {
      runs += 1;
      if (runs === 1) await gate;
      return { scanned: 0, captured: 0, skipped: 0, failed: 0 };
    },
  });
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(runs, 1);
  release();
  await new Promise((r) => setTimeout(r, 50));
  worker.stop();
  assert.ok(runs >= 2);
});
