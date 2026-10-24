const test = require('node:test');
const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const { snapshotFeed, diffFeed } = require('../utils/feedDelta');

const payload = matches => ({ matches, total: matches.length, competitions: ['League'], updatedAt: 'first' });

test('feed deltas round trip additions, deletions, ordering, and metadata without losing card fields', async () => {
  const { applyFeedDelta } = await import('../../frontend/src/utils/feedDelta.js');
  const original = payload([{ matchId: '1', score: '10/1' }, { matchId: '2', price: 2 }]);
  const next = { ...payload([{ matchId: '3', price: 1.5 }, { matchId: '1', score: '14/1' }]), competitions: ['New'], updatedAt: 'next' };
  const delta = { ...diffFeed(snapshotFeed(original), snapshotFeed(next)), baseVersion: 1, version: 2, feed: 'cricket' };
  assert.deepEqual(applyFeedDelta({ ...original, version: 1 }, delta), { ...next, version: 2 });
  assert.deepEqual(original.matches, [{ matchId: '1', score: '10/1' }, { matchId: '2', price: 2 }]);
  assert.equal(applyFeedDelta(null, delta), null);
  assert.equal(applyFeedDelta({ ...original, version: 9 }, delta), null);
  assert.equal(applyFeedDelta({ ...original, version: 1 }, { ...delta, order: ['missing'] }), null);
  assert.equal(applyFeedDelta({ ...original, version: 1 }, { ...delta, order: ['1', '1'] }), null);
});

test('timestamp-only polling is suppressed; scores, odds, schedule and result corrections survive', () => {
  const original = payload([{ matchId: '1', startTime: 123, crex: { score1: '10/1' }, actualWinner: null }]);
  const before = snapshotFeed(original);
  assert.equal(diffFeed(before, snapshotFeed({ ...original, updatedAt: 'later' })), null);
  // The normalizer mutates existing objects: signatures must remain stable.
  original.matches[0].crex.score1 = '14/1';
  assert.equal(diffFeed(before, snapshotFeed(original)).changed.length, 1);
  for (const changes of [{ startTime: 456 }, { runners: [{ back: 1.5 }] }, { actualWinner: 'A' }]) {
    const next = payload([{ ...original.matches[0], ...changes }]);
    assert.equal(diffFeed(snapshotFeed(original), snapshotFeed(next)).changed.length, 1);
  }
});

test('empty feeds and metadata-only changes are reconstructable', async () => {
  const { applyFeedDelta } = await import('../../frontend/src/utils/feedDelta.js');
  const before = { ...payload([{ matchId: '1' }]), version: 1 };
  const next = payload([]);
  const delta = { ...diffFeed(snapshotFeed(before), snapshotFeed(next)), baseVersion: 1, version: 2 };
  assert.deepEqual(applyFeedDelta(before, delta).matches, []);
});

test('one changed card avoids resending completed history, including with compression', () => {
  const matches = Array.from({ length: 300 }, (_, i) => ({
    matchId: String(i), matchName: `Team ${i} v Team ${i + 1}`, competitionName: `League ${i % 13}`,
    status: i ? 'ended' : 'in-play', startTime: 1792830000000 + i * 3600000,
    totalMatched: i * 1237, runners: [{ runnerName: `Team ${i}`, back: 1.5 + i / 1000 }],
  }));
  const before = payload(matches);
  const next = payload(matches.map((match, i) => i ? match : { ...match, totalMatched: 4321 }));
  const delta = diffFeed(snapshotFeed(before), snapshotFeed(next));
  assert.equal(delta.changed.length, 1);
  const fullBytes = gzipSync(JSON.stringify(next)).length;
  const deltaBytes = gzipSync(JSON.stringify(delta)).length;
  assert.ok(deltaBytes < fullBytes / 10, `${deltaBytes} vs ${fullBytes} compressed bytes`);
});
