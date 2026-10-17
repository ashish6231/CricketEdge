const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createPredictionDatasetPersistence } = require('../services/predictionDatasetPersistence');
const { createStore: createMatchStore } = require('../services/matchDatasetStore');
const { createStore: createTossStore } = require('../services/tossDatasetStore');
const { createCachedMarketFeed } = require('../services/cachedMarketFeed');

// Transactional fake verifies storage behavior and rollback without depending on
// production credentials. Real MariaDB import/readback is checked separately.
function database() {
  let state = { headers: new Map(), records: new Map() }, chain = Promise.resolve();
  return { $transaction(fn) {
    const work = chain.then(async () => {
      const next = structuredClone(state);
      const tx = {
        async $executeRaw(strings, ...values) {
          const sql = strings.join('?');
          if (sql.includes('INSERT INTO PredictionDataset')) {
            if (!next.headers.has(values[0])) next.headers.set(values[0], { metadata: '{}', initialized: false });
          } else if (sql.includes('INSERT INTO PredictionRecord')) {
            const [id, datasetKey, recordKey, payload, position] = values;
            next.records.set(id, { datasetKey, recordKey, payload, position });
          } else if (sql.includes('UPDATE PredictionDataset SET')) {
            next.headers.set(values[1], { metadata: values[0], initialized: true });
          } else if (sql.includes('DELETE FROM PredictionRecord')) {
            for (const [id, row] of next.records) if (row.datasetKey === values[0] && row.recordKey === values[1]) next.records.delete(id);
          } else throw Error('Unexpected write');
        },
        async $queryRaw(strings, ...values) {
          return strings.join('?').includes('FROM PredictionDataset')
            ? [next.headers.get(values[0])]
            : [...next.records.values()].filter(row => row.datasetKey === values[0]);
        },
      };
      const result = await fn(tx);
      state = next;
      return result;
    });
    chain = work.catch(() => {});
    return work;
  } };
}
async function setup(t, records = []) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prediction-db-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'seed.json');
  await fs.writeFile(filePath, JSON.stringify({ version: 1, records }));
  const prisma = database();
  const repository = key => createPredictionDatasetPersistence({ filePath, datasetKey: key, prisma, enabled: true });
  return { filePath, repository };
}

test('DB import survives new store instances and ignores stale files on redeploy', async t => {
  const { filePath, repository } = await setup(t, [{ matchId: 'one', winner: 'A' }]);
  let repo = repository('matches');
  await repo.runExclusive(async () => { const data = await repo.read(); data.records.push({ matchId: 'two', winner: 'B' }); await repo.write(data); });
  await fs.writeFile(filePath, JSON.stringify({ version: 1, records: [] }));
  repo = repository('matches');
  const data = await repo.runExclusive(() => repo.read());
  assert.deepEqual(data.records.map(row => row.matchId), ['one', 'two']);
  assert.equal(JSON.parse(await fs.readFile(filePath)).records.length, 0);
  await repo.runExclusive(() => repo.write({ version: 1, records: [] }));
  await fs.writeFile(filePath, JSON.stringify({ records: [{ matchId: 'obsolete' }] }));
  assert.equal((await repo.runExclusive(() => repo.read())).records.length, 0);
});

test('concurrent workers serialize modifications and database errors roll back writes', async t => {
  const { repository } = await setup(t);
  const a = repository('matches'), b = repository('matches');
  await Promise.all([a, b].map((repo, index) => repo.runExclusive(async () => {
    const data = await repo.read(); await new Promise(resolve => setImmediate(resolve));
    data.records.push({ matchId: `worker-${index}` }); await repo.write(data);
  })));
  assert.equal((await a.runExclusive(() => a.read())).records.length, 2);
  await assert.rejects(a.runExclusive(async () => { await a.write({ records: [] }); throw Error('failed'); }), /failed/);
  assert.equal((await b.runExclusive(() => b.read())).records.length, 2);
  const toss = repository('tosses');
  assert.equal((await toss.runExclusive(() => toss.read())).records.length, 0);
});

test('invalid seeds and duplicate identities cannot overwrite an archive', async t => {
  const { filePath, repository } = await setup(t);
  await fs.writeFile(filePath, '{broken');
  const repo = repository('matches');
  await assert.rejects(repo.runExclusive(() => repo.read()), SyntaxError);
  await fs.writeFile(filePath, JSON.stringify({ records: [{ matchId: 'good' }] }));
  assert.equal((await repo.runExclusive(() => repo.read())).records.length, 1);
  await assert.rejects(repo.runExclusive(() => repo.write({ records: [{ matchId: 'dup' }, { matchId: 'dup' }] })), /Duplicate/);
  assert.equal((await repo.runExclusive(() => repo.read())).records[0].matchId, 'good');
});

test('match and toss store operations persist to DB, including manual result confirmation', async t => {
  const { filePath, repository } = await setup(t);
  const snapshot = { teamNames: ['A', 'B'], preMatchVolume: { team1: { back: 20, lay: 5 }, team2: { back: 10, lay: 2 } }, preMatchPnl: { team1: -10, team2: 10 } };
  for (const [key, create] of [['matches', createMatchStore], ['tosses', createTossStore]]) {
    const store = create({ filePath, persistence: repository(key) });
    const record = { matchId: 'fixture', competitionName: 'Any League', team1: 'A', team2: 'B', snapshot, predictedWinner: 'A' };
    await store.upsertPendingCapture(record);
    await store.confirmActualWinner({ matchId: 'fixture', actualWinner: 'B', admin: { email: 'admin@test.invalid', userId: 1 } });
    const restarted = create({ filePath, persistence: repository(key) });
    assert.equal((await restarted.load()).records[0].actualWinner, 'B');
    assert.equal((await restarted.buildExport()).records[0].predictedWinner, 'A');
  }
});

test('capture client waits for a refreshed cached session after 401, without logging in', async () => {
  let cookie = 'saved-session', calls = 0;
  const feed = createCachedMarketFeed({ getCookie: () => cookie, http: { get: async () => {
    calls++; if (cookie === 'saved-session') throw { response: { status: 401 } };
    return { data: { teamNames: ['A', 'B'] } };
  } } });
  assert.match((await feed.getCricketSnapshot('one')).error, /401/);
  assert.match((await feed.getTossSnapshot('one')).error, /refreshed/);
  assert.equal(calls, 1);
  cookie = 'refreshed-session';
  assert.deepEqual((await feed.getTossSnapshot('one')).teamNames, ['A', 'B']);
});
