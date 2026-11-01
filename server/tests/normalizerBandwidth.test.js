const test = require('node:test');
const assert = require('node:assert/strict');

function stub(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
const rows = new Map(), publications = [];
stub('../shared/redis', { getRedisClient: () => ({
  async set(key, value) { rows.set(key, JSON.parse(value)); },
  async publish(channel, value) { publications.push({ channel, value }); },
}) });
stub('../db/prisma', {});
stub('../services/crexService', { findCrexMatch: () => null });
stub('../services/providerTotalStore', { getDefaultProviderTotalStore: () => ({ attach: async value => value }) });
const { processIngestJob, getMatchBundle } = require('../services/normalizer/normalizer');
const ingest = (type, data, matchId) => processIngestJob({ data: { type, data, matchId } });

test('Redis invalidations stay tiny while complete cricket, toss and session data remains intact', async () => {
  const matchId = 'bandwidth-test';
  await ingest('cricket:matches', [{ matchId, matchName: 'A v B', status: 'in-play' }]);
  const snapshot = { teamNames: ['A', 'B'], teams: { A: { trades: Array.from({ length: 1000 }, (_, i) => ({ price: 2, size: i + 1, updatedAt: i })) } } };
  await ingest('cricket:snapshot', snapshot, matchId);
  await ingest('toss:snapshot', { ...snapshot, totalMatched: 1234 }, matchId);
  assert.deepEqual(rows.get(`match:${matchId}:bundle`).cricket, snapshot);
  assert.deepEqual(getMatchBundle(matchId).cricket, snapshot);
  assert.equal(getMatchBundle(matchId).toss.totalMatched, 1234);
  const notifications = publications.filter(({ channel }) => channel.endsWith(':matches') || channel.startsWith('match:bundle'));
  assert.ok(notifications.length > 0);
  assert.ok(notifications.every(({ value }) => Buffer.byteLength(value) < 64));
});

test('toss snapshot changes invalidate the list feed without requiring a match detail room',async()=>{
  const snapshot={teamNames:['A','B'],teams:{A:{trades:[]},B:{trades:[]}}};
  const count=()=>publications.filter(item=>item.channel==='toss:matches').length;
  const before=count();
  await ingest('toss:snapshot',snapshot,'list-only');assert.equal(count(),before+1);
  await ingest('toss:snapshot',structuredClone(snapshot),'list-only');assert.equal(count(),before+1);
  snapshot.teams.A.trades.push({type:'back',price:1.98,size:10});
  await ingest('toss:snapshot',snapshot,'list-only');assert.equal(count(),before+2);
});
