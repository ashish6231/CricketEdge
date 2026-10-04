const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../services/matchDatasetStore');
const { loadMatchDataset, listMatchDataset } = require('../services/adminMatchDataset');
const { captureEndedMatches } = require('../services/matchCapture');

function snapshot(names = ['A', 'B']) {
  return { teamNames: names, preMatchVolume: { team1: { back: 100, lay: 20 }, team2: { back: 10, lay: 5 } }, preMatchPnl: { team1: -100, team2: 100 } };
}
function record(overrides = {}) {
  return { matchId: '1', team1: 'A', team2: 'B', matchName: 'A v B', competitionName: 'CPL',
    startTime: 1790000000000, snapshot: snapshot(), predictedWinner: 'A', actualWinner: 'B', status: 'verified', confirmedByEmail: 'admin@test.com', ...overrides };
}
const fakeStore = records => ({ load: async () => ({ version: 1, updatedAt: '2026-10-03T10:00:00Z', records }) });
const deps = records => ({ store: fakeStore(records), trackedStores: [] });

test('league aliases group together, totals cover all pages and original picks remain unchanged', async () => {
  const rows = [record(), record({ matchId: '2', competitionName: 'Caribbean Premier League', actualWinner: 'A' }), record({ matchId: '3', competitionName: 'T20 Matches' })];
  const before = structuredClone(rows);
  const data = await listMatchDataset({ league: 'CPL', page: 99, limit: 1 }, deps(rows));
  assert.equal(data.pagination.total, 2);
  assert.equal(data.pagination.page, 2);
  assert.equal(data.records.length, 1);
  assert.equal(data.summary.total, 2);
  assert.equal(data.summary.hits, 1);
  assert.equal(data.summary.misses, 1);
  assert.equal(data.records[0].predictedWinner, 'A');
  assert.match(data.records[0].currentAlgorithm.algorithmId, /caribbean/);
  assert.deepEqual(rows, before);
  const wncl = data.leagues.find(row => row.league === "Women's National Cricket League");
  assert.equal(wncl.total, 0);
  assert.equal(wncl.algorithmId, 'match-women-s-national-cricket-league-independent-v1');
});

test('saved predictions and current replays are compared independently; no results are unscored', async () => {
  const data = await loadMatchDataset({ ...deps([record(), record({ matchId: '2', status: 'abandoned', actualWinner: 'No Result' }), record({ matchId: '3', predictedWinner: null })]), predict: () => ({ winner: 'B' }) });
  const first = data.records.find(row => row.matchId === '1');
  assert.equal(first.comparison, 'miss');
  assert.equal(first.currentComparison, 'hit');
  assert.equal(first.predictedWinner, 'A');
  assert.equal(data.summary.misses, 1);
  assert.equal(data.summary.noResult, 1);
  assert.equal(data.summary.noPick, 1);
  assert.equal(data.summary.currentHits, 2);
  assert.equal(data.summary.currentMisses, 0);
  assert.equal(data.summary.currentAccuracy, 100);
});

test('pass/fail filtering uses the current normal replay independently of saved picks', async () => {
  const data = await listMatchDataset({ result: 'hit' }, {
    ...deps([record(), record({matchId:'2',actualWinner:'A'})]),predict:()=>({winner:'B'}),
  });
  assert.deepEqual(data.records.map(row=>row.matchId),['1']);
  assert.equal(data.records[0].comparison,'miss');
  assert.equal(data.summary.currentHits,1);assert.equal(data.summary.currentMisses,1);
});

test('forward accuracy scores issued pre-start forecasts and excludes retrospective inputs', async () => {
  const start = Date.parse('2026-10-03T12:00:00Z');
  const pre = { startTime: start, capturedAt: '2026-10-03T11:59:00Z', inputTiming: 'captured-before-start' };
  const data = await loadMatchDataset(deps([
    record({ ...pre, matchId: 'issued-hit', actualWinner: 'A' }),
    record({ ...pre, matchId: 'issued-miss', actualWinner: 'B' }),
    record({ ...pre, matchId: 'issued-pending', status: 'pending', actualWinner: null }),
    record({ ...pre, matchId: 'after-start', capturedAt: '2026-10-03T12:00:00Z' }),
    record({ ...pre, matchId: 'unknown-timing', inputTiming: null }),
    record({ ...pre, matchId: 'missing-capture', capturedAt: null }),
    record({ ...pre, matchId: 'unverified', confirmedByEmail: 'crex-auto' }),
  ]));
  assert.equal(data.summary.forwardForecasts, 4);
  assert.equal(data.summary.forwardHits, 1);
  assert.equal(data.summary.forwardMisses, 1);
  assert.equal(data.summary.forwardPending, 2);
  assert.equal(data.records.find(row => row.matchId === 'issued-hit').forecastIssuedBeforeStart, true);
  assert.equal(data.records.find(row => row.matchId === 'after-start').forecastIssuedBeforeStart, false);
  const league = data.leagues.find(row => row.league === 'Caribbean Premier League');
  assert.equal(league.forwardHits + league.forwardMisses, 2);
});

test('CREX auto labels without verification stay reported-only and cannot produce a pass/fail', async () => {
  const data = await loadMatchDataset(deps([record({confirmedByEmail:'crex-auto'})]));
  assert.equal(data.records[0].actualWinner,null);assert.equal(data.records[0].reportedWinner,'B');
  assert.equal(data.records[0].status,'pending');assert.equal(data.summary.verified,0);
  assert.equal(data.summary.hits+data.summary.misses+data.summary.currentHits+data.summary.currentMisses,0);
});

test('shared market identities keep the pre-match prediction, all snapshots, and one match count', async () => {
  const start = Date.parse('2026-10-03T12:00:00Z');
  const historical=record({matchId:'50',competitionName:'Emirates D10',startTime:start,
    capturedAt:'2026-10-03T15:00:00Z',actualWinner:'A',predictedWinner:'B'});
  const tracked={recordId:'crex:2NK:50',competitionName:'Emirates D10 League 2026',
    team1:'A',team2:'B',startTime:start,status:'completed',markets:{match:{marketMatchId:'50',snapshot:snapshot(),
      inputTiming:'captured-before-start',capturedAt:'2026-10-03T11:00:00Z',
      prediction:{winner:'A',capturedAt:'2026-10-03T11:00:00Z',algorithmId:'saved-d10'}}}};
  const data=await loadMatchDataset({...deps([historical]),trackedStores:[{source:'emirates_d10_dataset',store:fakeStore([tracked])}]});
  assert.equal(data.records.length,1);assert.equal(data.summary.total,1);
  assert.equal(data.records[0].predictedWinner,'A');assert.equal(data.records[0].actualWinner,'A');
  assert.equal(data.records[0].algorithmId,'saved-d10');assert.equal(data.records[0].sourceSnapshots.length,2);
  assert.equal(data.records[0].comparison,'hit');
  tracked.actualWinner='B';tracked.resultVerification={status:'verified',sourceUrl:'https://www.cricbuzz.com/live-cricket-scores/50'};
  const conflicting=await loadMatchDataset({...deps([historical]),trackedStores:[{source:'emirates_d10_dataset',store:fakeStore([tracked])}]});
  assert.equal(conflicting.records[0].actualWinner,null);assert.equal(conflicting.records[0].resultConflict,true);
  assert.equal(conflicting.summary.currentHits+conflicting.summary.currentMisses,0);
});

test('an upcoming tracked fixture cannot claim a verified outcome', async () => {
  const tracked={recordId:'crex:2NK:50',competitionName:'Emirates D10',team1:'A',team2:'B',status:'upcoming',
    actualWinner:'A',resultVerification:{status:'verified'},markets:{match:{marketMatchId:'50',snapshot:snapshot()}}};
  const data=await loadMatchDataset({...deps([]),trackedStores:[{source:'emirates_d10_dataset',store:fakeStore([tracked])}]});
  assert.equal(data.records[0].actualWinner,null);assert.equal(data.records[0].status,'pending');
});

test('invalid snapshots and mismatched participants are excluded from listing and export', async () => {
  const data = await loadMatchDataset(deps([record(), record({ matchId: '2', snapshot: {} }), record({ matchId: '3', team1: 'Wrong team' }), record({ matchId: '4', competitionName: '' })]));
  assert.equal(data.records.length, 1);
  assert.equal(data.quality.excluded, 3);
});

test('tracked match snapshots join the view without manufacturing saved forecasts or verified results', async () => {
  const row = { recordId: 'fixture:1', competitionName: 'Emirates D10 League 2026', team1: 'Emirates Blues', team2: 'Emirates Red',
    startTime: 1790000000000, status: 'completed', reportedWinner: 'Emirates Red', actualWinner: 'Emirates Red', resultVerification: { status: 'pending' },
    markets: { match: { marketMatchId: '50', snapshot: snapshot(['Emirates Blues D10', 'Emirates Red D10']), capturedAt: '2026-10-03T11:00:00Z', prediction: null } } };
  const data = await loadMatchDataset({ ...deps([]), trackedStores: [{ source: 'emirates_d10_dataset', store: fakeStore([row, { ...row, recordId: 'toss-only', markets: { toss: row.markets.match } }]) }] });
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].league, 'Emirates D10 League');
  assert.equal(data.records[0].predictedWinner, null);
  assert.equal(data.records[0].actualWinner, null);
  assert.ok(data.records[0].currentPrediction);
  assert.equal(data.records[0].reportedWinner, 'Emirates Red');
});

test('league, search, status and result filters combine before pagination', async () => {
  const data = await listMatchDataset({ league: 'CPL', search: '2', status: 'verified', result: 'hit' }, deps([
    record(), record({ matchId: '2', actualWinner: 'A' }), record({ matchId: '20', competitionName: 'T20 Matches', actualWinner: 'A' }),
  ]));
  assert.deepEqual(data.records.map(row => row.matchId), ['2']);
  assert.equal(data.pagination.total, 1);
  assert.equal(data.summary.total, 2);
});

test('store rejects failed, empty, zero-flow and misidentified data without writing it', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'match-quality-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = createStore({ filePath: path.join(dir, 'data.json') });
  for (const invalid of [record({ snapshot: {} }), record({ competitionName: '' }), record({ snapshot: { error: 'failed' } }), record({ team2: 'Wrong' }), record({ predictedWinner: 'C' }), record({ snapshot: { ...snapshot(), preMatchVolume: { team1: { back: 0, lay: 0 }, team2: { back: 0, lay: 0 } } } })]) {
    await assert.rejects(() => store.upsertPendingCapture(invalid), error => error.status === 400);
  }
  assert.equal((await store.load()).records.length, 0);
  await store.upsertPendingCapture(record({ actualWinner: null }));
  assert.equal((await store.load()).records.length, 1);
});

test('resolving a result preserves the saved input and original algorithm', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'match-immutable-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = createStore({ filePath: path.join(dir, 'data.json') });
  const first = record({ actualWinner: null, algorithmId: 'old-version' });
  await store.upsertPendingCapture(first);
  await store.upsertPendingCapture(record({ predictedWinner: 'B', algorithmId: 'new-version', snapshot: { ...snapshot(), preMatchPnl: { team1: -200, team2: 200 } } }));
  const saved = (await store.load()).records[0];
  assert.equal(saved.status, 'verified');
  assert.equal(saved.actualWinner, 'B');
  assert.equal(saved.predictedWinner, 'A');
  assert.equal(saved.algorithmId, 'old-version');
  assert.deepEqual(saved.snapshot, first.snapshot);
});

test('corrupt datasets fail without overwriting existing data', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'match-corrupt-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'data.json');
  await fs.writeFile(filePath, '{broken');
  await assert.rejects(() => createStore({ filePath }).load());
  assert.equal(await fs.readFile(filePath, 'utf8'), '{broken');
});

test('capture saves algorithm metadata and does not treat both named participants as a result', async () => {
  const saved = [];
  const captured = await captureEndedMatches({
    store: { load: async () => ({ records: [] }), upsertPendingCapture: async row => { saved.push(row); return { created: true }; } },
    scraper: { getAllCricketMatches: async () => ({ matches: [{ matchId: '8', matchName: 'A v B', competitionName: 'CPL', status: 'ended', totalMatched: 10 }] }), getCricketSnapshot: async () => snapshot() },
    fetchCrexOverview: async () => [{}], findCrexFixture: () => ({ statusText: 'A v B: match abandoned', slug: 'test' }), fetchCrexDetail: async () => null,
  });
  assert.equal(captured.captured, 1);
  assert.equal(saved[0].actualWinner, null);
  assert.match(saved[0].algorithmId, /caribbean/);
  assert.ok(saved[0].predictorVersion);
  assert.equal(saved[0].inputTiming, 'provider-frozen-fields-captured-after-start');
});

test('admin list and export handlers return valid saved snapshots with league algorithms', async () => {
  const { getMatchDataset, getMatchDatasetExport } = require('../routes/admin');
  const response = () => ({
    statusCode: 200, headers: {}, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set(key, value) { this.headers[key] = value; return this; },
  });
  const stores = deps([record(), record({ matchId: '2', snapshot: {} })]);
  const list = response();
  await getMatchDataset({ query: { league: 'CPL', page: '1', limit: '1' } }, list, stores);
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.success, true);
  assert.equal(list.body.records.length, 1);
  assert.equal(list.body.pagination.total, 1);
  assert.equal(list.body.quality.excluded, 1);
  assert.ok(list.body.records[0].snapshot);
  assert.ok(list.body.records[0].currentAlgorithm.algorithmId);
  const exported = response();
  await getMatchDatasetExport({}, exported, stores);
  assert.match(exported.headers['Content-Disposition'], /match_dataset\.json/);
  assert.equal(exported.body.records.length, 1);
  assert.equal(exported.body.leagues.length, list.body.leagues.length);
});

test('admin dataset handler surfaces read failures without reporting empty success', async () => {
  const { getMatchDataset } = require('../routes/admin');
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await getMatchDataset({ query: {} }, response, { store: { load: async () => { throw new Error('Dataset unreadable'); } }, trackedStores: [] });
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.success, false);
  assert.equal(response.body.message, 'Dataset unreadable');
});
