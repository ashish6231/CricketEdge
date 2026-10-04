const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const { createStore } = require('../services/matchDatasetStore');
const { captureEndedMatches } = require('../services/matchCapture');

function tmpDatasetPath() {
  return path.join(os.tmpdir(), `match_dataset_${Date.now()}_${Math.random().toString(16).slice(2)}.json`);
}

function validSnapshot() {
  return { teamNames: ['Team A', 'Team B'], preMatchVolume: { team1: { back: 100, lay: 10 }, team2: { back: 30, lay: 5 } }, preMatchPnl: { team1: -80, team2: 80 } };
}

test('match dataset store: initializes empty dataset when file is missing', async () => {
  const filePath = tmpDatasetPath();
  const store = createStore({ filePath });
  const data = await store.load();
  assert.equal(data.version, 1);
  assert.deepEqual(data.records, []);
  await fsp.unlink(filePath).catch(() => {});
});

test('match dataset store: upsert creates pending record once', async () => {
  const filePath = tmpDatasetPath();
  const store = createStore({ filePath });

  const first = await store.upsertPendingCapture({
    matchId: '1001',
    matchName: 'Team A v Team B',
    team1: 'Team A',
    team2: 'Team B',
    competitionName: 'T20 Matches',
    snapshot: validSnapshot(),
    predictedWinner: 'Team A',
  });
  assert.equal(first.created, true);

  const second = await store.upsertPendingCapture({
    matchId: '1001',
    matchName: 'Team A v Team B',
    team1: 'Team A',
    team2: 'Team B',
    competitionName: 'T20 Matches',
    snapshot: validSnapshot(),
    predictedWinner: 'Team A',
  });
  assert.equal(second.created, false);
  assert.equal(second.updated, false);

  await fsp.unlink(filePath).catch(() => {});
});

test('match dataset store: confirm sets verified winner and rejects wrong team', async () => {
  const filePath = tmpDatasetPath();
  const store = createStore({ filePath });

  await store.upsertPendingCapture({
    matchId: '2001',
    team1: 'Team A',
    team2: 'Team B',
    competitionName: 'T20 Matches',
    snapshot: validSnapshot(),
  });

  await assert.rejects(
    () => store.confirmActualWinner({ matchId: '2001', actualWinner: 'Team Z', admin: { email: 'admin@test.com', userId: 1 } }),
    /actualWinner must be team1 or team2/,
  );

  const res = await store.confirmActualWinner({ matchId: '2001', actualWinner: 'Team A', admin: { email: 'admin@test.com', userId: 1 } });
  assert.equal(res.record.status, 'verified');
  assert.equal(res.record.actualWinner, 'Team A');

  await fsp.unlink(filePath).catch(() => {});
});

test('match capture: captures ended cricket matches with volume', async () => {
  const filePath = tmpDatasetPath();
  const store = createStore({ filePath });

  const fakeScraper = {
    getAllCricketMatches: async () => ({
      matches: [
        { matchId: '9001', status: 'ended', totalMatched: 10000, matchName: 'Alpha v Beta', competitionName: 'T20 Matches' },
        { matchId: '9003', status: 'completed', totalMatched: 9000, matchName: 'Alpha v Beta', competitionName: 'T20 Matches' },
        { matchId: '9002', status: 'in-play', totalMatched: 5000, matchName: 'Gamma v Delta' },
      ],
    }),
    getCricketSnapshot: async () => ({
      teamNames: ['Alpha', 'Beta'],
      preMatchVolume: { team1: { back: 500, lay: 100 }, team2: { back: 100, lay: 50 } },
      preMatchPnl: { team1: -450, team2: 450 },
    }),
  };

  const summary = await captureEndedMatches({
    scraper: fakeScraper,
    store,
    predictMatchWinner: () => ({ winner: 'Alpha', tier: 'CPL_SPECIAL', confidence: 'High' }),
    fetchCrexOverview: async () => [],
  });

  assert.equal(summary.scanned, 2);
  assert.equal(summary.captured, 2);

  const data = await store.load();
  assert.equal(data.records.length, 2);
  assert.equal(data.records[0].matchId, '9001');
  assert.equal(data.records[0].predictedWinner, 'Alpha');

  await fsp.unlink(filePath).catch(() => {});
});

test('match dataset store: independently verified result enriches a prior automatic result', async () => {
  const filePath = tmpDatasetPath();
  const store = createStore({ filePath });
  const base = { matchId: '3001', team1: 'Team A', team2: 'Team B', competitionName: 'T20 Matches',
    snapshot: validSnapshot(), predictedWinner: 'Team A', actualWinner: 'Team B' };
  await store.upsertPendingCapture(base);
  const evidence = { verification: 'verified', source: 'CREX', sourceUrl: 'https://crex.com/result', checkedAt: '2026-10-04T00:00:00.000Z' };
  const enriched = await store.upsertPendingCapture({ ...base, resultVerification: evidence, resultText: 'Team B won' });
  assert.equal(enriched.updated, true);
  assert.deepEqual(enriched.record.resultVerification, evidence);
  assert.equal(enriched.record.resultText, 'Team B won');
  await fsp.unlink(filePath).catch(() => {});
});
