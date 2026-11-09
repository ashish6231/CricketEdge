const test = require('node:test');
const assert = require('node:assert/strict');
const { createFeedHealth } = require('../services/feedHealth');
const matchStatus = require('../shared/matchStatus');

function memoryRedis() {
  const rows = new Map();
  return { rows, async get(key) { return rows.get(key) ?? null; }, async set(key, value) { rows.set(key, value); } };
}

const MIN = 60 * 1000;

test('a feed is fresh after success and stale once it stops updating', () => {
  const health = createFeedHealth({ staleAfterMs: 5 * MIN, getRedis: memoryRedis });
  const t0 = Date.parse('2026-11-04T10:00:00Z');
  health.recordResult('tennis', [{ matchId: 'a' }], t0);
  assert.equal(health.describe(health.rawState(), t0 + MIN).feeds.tennis.stale, false);

  // Session dies: every later poll fails with an {error} object.
  for (let i = 1; i <= 10; i++) health.recordResult('tennis', { error: 'HTTP 401' }, t0 + i * MIN);
  const report = health.describe(health.rawState(), t0 + 10 * MIN);
  assert.equal(report.stale, true);
  assert.equal(report.feeds.tennis.status, 'stale');
  assert.equal(report.feeds.tennis.consecutiveFailures, 10);
  assert.equal(report.feeds.tennis.lastError, 'HTTP 401');
  assert.equal(report.feeds.tennis.ageMs, 10 * MIN);
  assert.equal(report.feeds.tennis.lastSuccessAt, new Date(t0).toISOString());

  health.recordResult('tennis', [], t0 + 11 * MIN);
  assert.equal(health.describe(health.rawState(), t0 + 11 * MIN).feeds.tennis.stale, false, 'an empty list is still a successful poll');
});

test('one failure right after boot does not flash a warning', () => {
  const health = createFeedHealth({ staleAfterMs: 5 * MIN, getRedis: memoryRedis });
  const t0 = Date.now();
  health.recordResult('cricket', { error: 'timeout' }, t0);
  assert.equal(health.describe(health.rawState(), t0 + MIN).feeds.cricket.stale, false);
  assert.equal(health.describe(health.rawState(), t0 + 6 * MIN).feeds.cricket.stale, true);
});

test('feeds that were never polled are unknown, not stale', () => {
  const health = createFeedHealth({ getRedis: memoryRedis });
  const report = health.describe(null);
  assert.equal(report.stale, false);
  assert.deepEqual(Object.keys(report.feeds).sort(), ['cricket', 'session', 'tennis', 'toss']);
  assert.ok(Object.values(report.feeds).every(item => item.status === 'unknown'));
});

test('replicas see the leader state and detect a poller that silently stopped', async () => {
  const redis = memoryRedis();
  const leader = createFeedHealth({ staleAfterMs: 5 * MIN, getRedis: () => redis });
  const replica = createFeedHealth({ staleAfterMs: 5 * MIN, getRedis: () => redis });
  const t0 = Date.now();
  leader.recordResult('tennis', [], t0);
  await leader.persist();
  assert.equal((await replica.getHealth(t0 + MIN)).feeds.tennis.stale, false);
  // Leader stops writing entirely (standby forever, crashed loop): replica still notices.
  assert.equal((await replica.getHealth(t0 + 30 * MIN)).feeds.tennis.stale, true);
});

test('Redis errors never break health reporting', async () => {
  const health = createFeedHealth({ getRedis: () => ({ get: async () => { throw new Error('down'); }, set: async () => { throw new Error('down'); } }) });
  health.recordResult('toss', []);
  await health.persist();
  assert.equal((await createFeedHealth({ getRedis: () => { throw new Error('down'); } }).getHealth()).stale, false);
});

test('one shared ended/live status definition', () => {
  for (const status of ['ended', 'Completed', 'closed', 'verified', 'pending', 'finished', 'result', 'cancelled', 'canceled', ' ABANDONED ']) {
    assert.equal(matchStatus.isEndedStatus(status), true, status);
  }
  for (const status of ['live', 'in-play', 'upcoming', 'suspended', '', null, undefined]) {
    assert.equal(matchStatus.isEndedStatus(status), false, String(status));
  }
  assert.equal(matchStatus.isLiveMatch({ status: 'in-play' }), true);
  assert.equal(matchStatus.isLiveMatch({ inPlay: true, status: 'cancelled' }), false);
  assert.equal(matchStatus.isEndedMatch(null), false);
});
