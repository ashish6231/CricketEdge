const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createWomensSpringStore } = require('../services/womensSpringStore');
const { captureWomensSpring } = require('../services/womensSpringCapture');
const { startWomensSpringWorker } = require('../services/womensSpringWorker');
const { loadMatchDataset } = require('../services/adminMatchDataset');
const { springTeamKey } = require('../utils/womensSpringMatchPredictor.mjs');

const START = Date.parse('2026-10-18T00:00:00Z');
const URL = 'https://crex.com/series/t20-spring-challenge-2026-2LB/matches';
const fixture = { recordId: 'crex:2LB:one', crexMatchId: 'one', competitionName: 'T20 Spring Challenge 2026',
  matchName: 'Sydney Thunder Women v Melbourne Stars Women', team1: 'Sydney Thunder Women', team2: 'Melbourne Stars Women',
  startTime: START, status: 'upcoming', sourceProvider: 'CREX', sourceUrl: URL };
const raw = () => ({ teamNames: ['Sydney Thunder W', 'Melbourne Stars W'],
  preMatchVolume: { team1: { back: 200, lay: 600 }, team2: { back: 100, lay: 250 } },
  preMatchPnl: { team1: 190, team2: -230 }, preMatchTotalBets: { team1: 398, team2: 745 },
  deepMetrics: { totals: { totalBetTeam1: 100, totalBetTeam2: 500 } },
  marketSignals: { prediction: { pattern: 'The Market Trap', prediction: 'Sydney Thunder W' } },
  syntheticSupport: { strongerTeam: 'Sydney Thunder W', supportRatio: 2.08 } });
const archiveStore = { load: async () => ({ records: [] }) };
async function storeFor(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spring-capture-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return createWomensSpringStore({ filePath: path.join(dir, 'spring.json') });
}
const options = store => ({ store, archiveStore, now: () => new Date(START - 60000),
  seriesUrls: [URL], fetchSeries: async () => [fixture], scraper: { getCricketMatches: () => [] } });

test('all fixtures survive absent snapshots, completed results are verified without invented forecasts', async t => {
  const store = await storeFor(t);
  const result = await captureWomensSpring({ ...options(store), fetchSeries: async () => [fixture,
    { ...fixture, recordId: 'crex:2LB:two', startTime: START - 86400000, status: 'completed', reportedWinner: fixture.team1, resultText: 'SYT-W Won by 7 wickets' },
    { ...fixture, recordId: 'crex:2LB:three', startTime: START - 172800000, status: 'completed', resultText: 'Match Abandoned' }],
  });
  assert.equal(result.total, 3);
  assert.equal(result.verifiedResults, 2);
  assert.equal(result.noResult, 1);
  assert.equal(result.preMatchPredictions, 0);
  assert.equal(result.accuracy, null);
  const saved = await store.load();
  assert.equal(saved.records.length, 3);
  assert.ok(saved.records.every(record => !record.markets.match));
  const view = await loadMatchDataset({ store: archiveStore,
    trackedStores: [{ source: 'womens_spring_dataset', store, normalizeTeam: springTeamKey }] });
  assert.equal(view.records.length, 3);
  assert.ok(view.records.every(row => row.currentPrediction === null && row.forecastIssuedBeforeStart === false));
  assert.equal(view.records.find(row => row.recordId === 'crex:2LB:two').actualWinner, fixture.team1);
});

test('pre-start activity prediction stays immutable when provider totals and live activity change', async t => {
  const store = await storeFor(t);
  const match = { matchId: 'market-one', competitionName: "Women's T20 Spring Challenge", team1: 'Sydney Thunder W', team2: 'Melbourne Stars W', startTime: START, status: 'upcoming' };
  const scraper = { getCricketMatches: () => [match], getCricketSnapshot: async () => raw() };
  let result = await captureWomensSpring({ ...options(store), scraper });
  assert.equal(result.preMatchPredictions, 1);
  let saved = (await store.load()).records[0];
  const first = structuredClone(saved.markets.match);
  assert.equal(first.prediction.winner, fixture.team1);
  assert.equal(first.prediction.tier, 'WOMENS_MATCH_LOWER_PREMATCH_PROVIDER_TOTAL');
  assert.deepEqual(first.snapshot.preMatchProviderTotals, { team1: 398, team2: 745 });
  assert.ok(Date.parse(first.prediction.capturedAt) < START);
  result = await captureWomensSpring({ ...options(store), now: () => new Date(START + 60000),
    scraper: { getCricketMatches: () => [{ ...match, status: 'completed' }], getCricketSnapshot: async () => ({ ...raw(), preMatchPnl: { team1: -9000, team2: 9000 }, inPlayTotalBets: {team1:9000,team2:10}, deepMetrics: {totals:{totalBetTeam1:9000,totalBetTeam2:10}} }) },
    fetchSeries: async () => [{ ...fixture, status: 'completed', reportedWinner: fixture.team1, resultText: 'SYT-W Won by 7 wickets' }] });
  saved = (await store.load()).records[0];
  assert.deepEqual(saved.markets.match.prediction, first.prediction);
  assert.deepEqual(saved.markets.match.snapshot, first.snapshot);
  assert.equal(result.correct, 1);
});

test('historical imports preserve timing, admin deduplicates aliases and merges verified outcomes', async t => {
  const store = await storeFor(t);
  const past = { ...fixture, startTime: START - 86400000, status: 'completed', reportedWinner: fixture.team1, resultText: 'SYT-W Won by 7 wickets' };
  const row = { matchId: 'archived-one', competitionName: "Women's T20 Spring Challenge", team1: 'Sydney Thunder W', team2: 'Melbourne Stars W',
    matchName: 'Sydney Thunder W v Melbourne Stars W', startTime: past.startTime, capturedAt: new Date(START).toISOString(),
    inputTiming: 'provider-frozen-fields-captured-after-start', status: 'pending', snapshot: raw(), predictedWinner: 'Melbourne Stars W' };
  const legacy = { load: async () => ({ records: [row] }) };
  await captureWomensSpring({ ...options(store), archiveStore: legacy, fetchSeries: async () => [past] });
  const saved = (await store.load()).records[0];
  assert.equal(saved.markets.match.prediction, null);
  assert.equal(saved.markets.match.inputTiming, row.inputTiming);
  const view = await loadMatchDataset({ store: legacy, trackedStores: [{ source: 'womens_spring_dataset', store, normalizeTeam: springTeamKey }] });
  assert.equal(view.records.length, 1);
  assert.equal(view.records[0].actualWinner, 'Sydney Thunder W');
  assert.equal(view.records[0].forecastIssuedBeforeStart, false);
  assert.equal(view.records[0].sourceSnapshots.length, 2);
});

test('source outages preserve saved fixtures and results', async t => {
  const store = await storeFor(t);
  await captureWomensSpring(options(store));
  const result = await captureWomensSpring({ ...options(store), fetchSeries: async () => { throw Error('Series down'); },
    scraper: { getCricketMatches: () => ({ error: 'HTTP 401' }) } });
  assert.equal(result.total, 1);
  assert.equal(result.sync.errors.length, 2);
});

test('Spring worker prevents overlapping polls and stops cleanly', async () => {
  let calls = 0, release;
  const worker = startWomensSpringWorker({ intervalMs: 1000, capture: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  assert.equal(calls, 1);
  worker.stop();
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.throws(() => startWomensSpringWorker({ intervalMs: 0 }), /Invalid/);
});
