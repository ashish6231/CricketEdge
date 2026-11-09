// End-to-end coverage of the tennis path without any network or upstream login:
// adapter list parsing -> normalizer cache/Redis -> feed deltas -> cache pruning.
const test = require('node:test');
const assert = require('node:assert/strict');

function stub(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const rows = new Map(), publications = [];
stub('../shared/redis', {
  getRedisClient: () => ({
    async set(key, value) { rows.set(key, JSON.parse(value)); },
    async publish(channel, value) { publications.push({ channel, value }); },
    async expire() {},
  }),
  getCacheRedisClient: () => ({}),
  REDIS_URL: null,
});
stub('../db/prisma', {});
stub('../services/crexService', { findCrexMatch: () => null });
stub('../services/providerTotalStore', { getDefaultProviderTotalStore: () => ({ attach: async value => value }) });
// The session module would load cookies and may auto-login; never let tests reach it.
let loginCalls = 0;
stub('../services/scraper-tennisliveload/session', {
  getCookies: () => 'cricket_live_load_session=test',
  getFixedUserAgent: () => 'test-agent',
  loadSavedSession: async () => true,
  autoLogin: async () => { loginCalls++; return false; },
  recordSuccessfulCall() {}, record401Failure: () => 1, isConnected: () => true,
});

const { createNormalizedMatch } = require('../shared/schema');
const { snapshotFeed, diffFeed } = require('../utils/feedDelta');
const { snapshotPollingPolicy } = require('../utils/snapshotPolling');
const { guestMayViewMatch } = require('../lib/guestMatchAccess');
const TennisLiveLoadAdapter = require('../services/scraper-tennisliveload/adapter');
const normalizer = require('../services/normalizer/normalizer');

const ingest = (type, data, matchId) => normalizer.processIngestJob({ data: { source: 'tll', type, data, matchId } });

const rawTennisList = [
  { id: 't-live', name: 'Player A v Player B', competitionName: 'ATP Paris', status: 'in-play', inPlay: true, startTime: 1762270000000, totalMatched: 15234.5 },
  { id: 't-up', name: 'Player C v Player D', competitionName: 'ATP Paris', status: 'upcoming', startTime: '2026-11-05T10:00:00Z' },
  { id: 't-cancel', name: 'Player E v Player F', competitionName: 'WTA Finals', status: 'CANCELLED' },
  { id: 't-retired', name: 'Player G v Player H', competitionName: 'WTA Finals', status: 'abandoned', inPlay: true },
];

function adapterWith(response) {
  const adapter = new TennisLiveLoadAdapter();
  adapter._request = async () => response;
  return adapter;
}

test('adapter normalizes both tennis list shapes and keeps provider values', async () => {
  for (const response of [rawTennisList, { matches: rawTennisList }]) {
    const list = await adapterWith(response).getTennisMatches();
    assert.equal(list.length, 4);
    const live = list.find(match => match.matchId === 't-live');
    assert.equal(live.matchName, 'Player A v Player B');
    assert.equal(live.team1, 'Player A');
    assert.equal(live.team2, 'Player B');
    assert.equal(live.competitionName, 'ATP Paris');
    assert.equal(live.status, 'live');
    assert.equal(live.inPlay, true);
    assert.equal(live.totalMatched, 15234.5);
    assert.equal(live.startTime, 1762270000000);
    assert.equal(list.find(match => match.matchId === 't-up').startTime, Date.parse('2026-11-05T10:00:00Z'));
    assert.ok(list.every(match => match.source === 'tennisliveload'));
  }
});

test('cancelled and abandoned tennis matches are completed, never "upcoming" or live', async () => {
  const list = await adapterWith(rawTennisList).getTennisMatches();
  for (const id of ['t-cancel', 't-retired']) {
    const match = list.find(item => item.matchId === id);
    assert.equal(match.status, 'completed', id);
    assert.equal(match.inPlay, false, id);
    assert.equal(guestMayViewMatch(match, null), true, `${id} should be free like other ended matches`);
    assert.notEqual(snapshotPollingPolicy(match).refreshMs, 0);
  }
});

test('upstream failures are surfaced, not turned into an empty list', async () => {
  const failure = { error: 'HTTP 503', upstreamStatus: 503 };
  assert.deepEqual(await adapterWith(failure).getTennisMatches(), failure);
  assert.deepEqual(await adapterWith(failure).getMatches(), failure);
  assert.deepEqual(await adapterWith(null).getTennisMatches(), []);
  assert.equal(loginCalls, 0);
});

test('normalized matches are deterministic so unchanged polls produce no feed delta', async () => {
  const first = rawTennisList.map(match => createNormalizedMatch({ ...match, source: 'tennisliveload' }));
  await new Promise(resolve => setTimeout(resolve, 5));
  const second = rawTennisList.map(match => createNormalizedMatch({ ...match, source: 'tennisliveload' }));
  assert.deepEqual(first, second);
  assert.ok(first.every(match => !('updatedAt' in match)));

  const feed = matches => snapshotFeed({ total: matches.length, matches, updatedAt: new Date().toISOString() });
  assert.equal(diffFeed(feed(first), feed(second)), null);

  const moved = second.map(match => match.matchId === 't-live' ? { ...match, totalMatched: 16000 } : match);
  const delta = diffFeed(feed(first), feed(moved));
  assert.deepEqual(delta.changed.map(match => match.matchId), ['t-live']);
  assert.equal(delta.changed[0].totalMatched, 16000);
});

test('tennis list and snapshot ingest update memory, Redis and notify the broadcast layer', async () => {
  const list = await adapterWith(rawTennisList).getTennisMatches();
  await ingest('tennis:matches', list);
  assert.deepEqual(normalizer.getTennisMatches().map(match => match.matchId), ['t-live', 't-up', 't-cancel', 't-retired']);
  assert.equal(rows.get('matches:tennis').matches.length, 4);
  assert.ok(publications.some(({ channel }) => channel === 'tennis:matches'));

  const snapshot = { teamNames: ['Player A', 'Player B'], totalMatched: 15234.5, teams: { 'Player A': { trades: [{ price: 1.8, size: 20 }] } } };
  await ingest('tennis:snapshot', snapshot, 't-live');
  const bundle = rows.get('match:t-live:bundle');
  assert.deepEqual(bundle.cricket, snapshot);
  assert.equal(bundle.toss, null);
  assert.equal(bundle.session, null);
  assert.deepEqual(normalizer.getMatchBundle('t-live').cricket, snapshot);
  assert.ok(publications.some(({ channel }) => channel === 'match:bundle:t-live'));

  // A newer poll replaces the value rather than keeping the old one.
  await ingest('tennis:snapshot', { ...snapshot, totalMatched: 20000 }, 't-live');
  assert.equal(normalizer.getMatchBundle('t-live').cricket.totalMatched, 20000);
});

test('an empty tennis list is published so finished leagues disappear', async () => {
  await ingest('tennis:matches', []);
  assert.deepEqual(normalizer.getTennisMatches(), []);
  assert.deepEqual(rows.get('matches:tennis').matches, []);
});

test('cache pruning drops old unlisted snapshots but keeps listed and recent ones', async () => {
  await ingest('tennis:matches', [createNormalizedMatch({ id: 'listed', name: 'A v B', status: 'ended' })]);
  await ingest('tennis:snapshot', { teamNames: ['A', 'B'] }, 'listed');
  await ingest('tennis:snapshot', { teamNames: ['C', 'D'] }, 'gone');
  await ingest('tennis:snapshot', { teamNames: ['E', 'F'] }, 'recent');

  const later = Date.now() + 2 * 60 * 60 * 1000;
  // Two hours later every unlisted entry is past the one-hour retention window.
  assert.equal(normalizer.pruneCaches({ now: later, retentionMs: 60 * 60 * 1000 }) >= 1, true);
  assert.ok(normalizer.getMatchBundle('listed').cricket, 'listed matches are always kept');
  assert.equal(normalizer.getMatchBundle('gone').cricket, null);

  await ingest('tennis:snapshot', { teamNames: ['E', 'F'] }, 'recent');
  normalizer.pruneCaches({ now: Date.now() + 1000, retentionMs: 60 * 60 * 1000 });
  assert.ok(normalizer.getMatchBundle('recent').cricket, 'recently refreshed entries survive');
});
