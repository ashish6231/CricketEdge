const test = require('node:test');
const assert = require('node:assert/strict');

function stub(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
let current = { matches: [], total: 0 };
let bundleBuilder = async id => ({ matchId: id, cricket: { teams: {} }, toss: null, session: null, crex: null });
const builders = {
  getMatchBundlePayload: (...args) => bundleBuilder(...args),
  ...Object.fromEntries(['Cricket', 'Toss', 'Tennis', 'Session'].map(feed => [`get${feed}MatchesPayload`, async () => structuredClone(current)])),
};
stub('../middleware/auth', { JWT_SECRET: 'offline-test' });
stub('../db/prisma', {});
stub('../services/dataCache', {});
stub('../services/matchPayloadService', builders);
stub('../services/scraper-crex', {});
stub('../services/scraper-tennisliveload', {});
const service = require('../services/socketService');

function setup() {
  const io = { engine: { clientsCount: 0 }, sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    use() {}, on(event, fn) { this[event] = fn; },
    to(room) { return { emit: (event, data) => {
      for (const id of io.sockets.adapter.rooms.get(room) || []) io.sockets.sockets.get(id).emit(event, data);
    } }; },
  };
  service.init(io);
  function connect(id, feedDeltas = true) {
    const handlers = new Map();
    const socket = { id, connected: true, rooms: new Set(), handshake: { auth: { feedDeltas } }, sent: [],
      on(event, fn) { handlers.set(event, fn); },
      emit(event, data) { this.sent.push({ event, data }); },
      receive(event, data) { return handlers.get(event)(data); },
      join(room) { this.rooms.add(room); const members = io.sockets.adapter.rooms.get(room) || new Set(); members.add(id); io.sockets.adapter.rooms.set(room, members); },
      leave(room) { this.rooms.delete(room); io.sockets.adapter.rooms.get(room)?.delete(id); },
    };
    io.sockets.sockets.set(id, socket);
    io.engine.clientsCount++;
    io.connection(socket);
    return socket;
  }
  return { connect };
}

test('mixed clients get lossless feeds; duplicate requests and unchanged polls send nothing', async () => {
  const { connect } = setup();
  current = { matches: Array.from({ length: 100 }, (_, i) => ({ matchId: String(i), matchName: `A${i} v B${i}`, price: 2 })), total: 100 };
  const modern = connect('modern'), legacy = connect('legacy', false);
  await Promise.all([modern.receive('feed:cricket'), legacy.receive('feed:cricket')]);
  assert.equal(modern.sent[0].event, 'cricket:matches');
  await modern.receive('feed:cricket');
  await service.broadcastAllMatches();
  assert.equal(modern.sent.length, 1);
  current.matches[0].price = 1.5;
  await service.broadcastAllMatches();
  assert.equal(modern.sent.at(-1).event, 'feed:delta');
  assert.equal(modern.sent.at(-1).data.changed.length, 1);
  assert.equal(legacy.sent.at(-1).event, 'cricket:matches');
  const { applyFeedDelta } = await import('../../frontend/src/utils/feedDelta.js');
  assert.deepEqual(applyFeedDelta(modern.sent[0].data, modern.sent[1].data), legacy.sent[1].data);
  await modern.receive('feed:cricket', { force: true });
  assert.equal(modern.sent.at(-1).event, 'cricket:matches');
  await modern.receive('feed:unsubscribe', 'cricket');
  const count = modern.sent.length;
  current.matches[1].price = 3;
  await service.broadcastAllMatches();
  assert.equal(modern.sent.length, count);
});

test('duplicate in-flight subscriptions build once and leaving during a build does not rejoin', async () => {
  const { connect } = setup();
  const socket = connect('viewer');
  let resolveBundle, calls = 0;
  bundleBuilder = async id => { calls++; return new Promise(resolve => { resolveBundle = () => resolve({ matchId: id, cricket: { odds: 2 } }); }); };
  const first = socket.receive('match:subscribe', { matchId: 'one' });
  await socket.receive('match:subscribe', { matchId: 'one' });
  assert.equal(calls, 1);
  await socket.receive('match:unsubscribe', { matchId: 'one' });
  resolveBundle();
  await first;
  assert.equal(socket.rooms.has('match:one'), false);
  assert.equal(socket.sent.length, 0);
});

test('overlapping ingestion events share a single full-bundle broadcast', async () => {
  const { connect } = setup();
  const socket = connect('viewer');
  socket.join('match:coalesced');
  let calls = 0;
  bundleBuilder = async id => { calls++; await new Promise(resolve => setImmediate(resolve)); return { matchId: id, cricket: { odds: 2 } }; };
  await Promise.all(Array.from({ length: 5 }, () => service.broadcastMatchBundle('coalesced', { force: true })));
  assert.equal(calls, 1);
  assert.equal(socket.sent.length, 1);
});
