const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createStore, emptyDataset } = require('../services/tossDatasetStore');

function tempPath() {
  return path.join(os.tmpdir(), `toss_dataset_${Date.now()}_${Math.random().toString(16).slice(2)}.json`);
}

function baseRecord(overrides = {}) {
  return {
    matchId: 'm1',
    marketId: null,
    matchName: 'Salem Spartans v Madurai Panthers',
    competitionName: 'TNPL',
    team1: 'Salem Spartans',
    team2: 'Madurai Panthers',
    startTime: '2026-08-15T10:00:00.000Z',
    endedAt: '2026-08-15T10:30:00.000Z',
    capturedAt: '2026-08-15T10:31:00.000Z',
    snapshot: { teamNames: ['Salem Spartans', 'Madurai Panthers'] },
    predictedWinner: 'Salem Spartans',
    predictionReason: 'Higher Lay Trades',
    predictionRisk: { tier: 'medium' },
    matchedRules: [],
    predictorVersion: 'production',
    actualWinner: null,
    status: 'pending',
    confirmedAt: null,
    confirmedByEmail: null,
    confirmedById: null,
    lastCaptureError: null,
    ...overrides,
  };
}

test('initializes empty dataset when file is missing', async () => {
  const filePath = tempPath();
  const store = createStore({ filePath });
  const data = await store.load();
  assert.equal(data.version, 1);
  assert.deepEqual(data.records, []);
  assert.ok(fs.existsSync(filePath));
});

test('upsert creates pending record once', async () => {
  const store = createStore({ filePath: tempPath() });
  const first = await store.upsertPendingCapture(baseRecord());
  assert.equal(first.created, true);
  const second = await store.upsertPendingCapture(baseRecord({
    snapshot: { changed: true },
    predictedWinner: 'Madurai Panthers',
  }));
  assert.equal(second.created, false);
  assert.equal(second.updated, false);
  const listed = await store.listRecords({ status: 'pending', page: 1, limit: 20 });
  assert.equal(listed.records.length, 1);
  assert.equal(listed.records[0].predictedWinner, 'Salem Spartans');
});

test('allows fill-in of failed pending capture', async () => {
  const store = createStore({ filePath: tempPath() });
  await store.upsertPendingCapture(baseRecord({
    snapshot: null,
    lastCaptureError: 'snapshot failed',
  }));
  const filled = await store.upsertPendingCapture(baseRecord({
    snapshot: { ok: true },
    lastCaptureError: null,
  }));
  assert.equal(filled.updated, true);
  assert.deepEqual(filled.record.snapshot, { ok: true });
});

test('confirm sets verified winner and rejects wrong team', async () => {
  const store = createStore({ filePath: tempPath() });
  await store.upsertPendingCapture(baseRecord());
  await assert.rejects(
    () => store.confirmActualWinner({
      matchId: 'm1',
      actualWinner: 'Other Team',
      admin: { userId: 1, email: 'a@b.com' },
    }),
    (err) => err.status === 400,
  );
  const ok = await store.confirmActualWinner({
    matchId: 'm1',
    actualWinner: 'Salem Spartans',
    admin: { userId: 1, email: 'a@b.com' },
  });
  assert.equal(ok.record.status, 'verified');
  assert.equal(ok.record.actualWinner, 'Salem Spartans');
});

test('verified records are not overwritten by capture', async () => {
  const store = createStore({ filePath: tempPath() });
  await store.upsertPendingCapture(baseRecord());
  await store.confirmActualWinner({
    matchId: 'm1',
    actualWinner: 'Salem Spartans',
    admin: { userId: 1, email: 'a@b.com' },
  });
  const again = await store.upsertPendingCapture(baseRecord({
    predictedWinner: 'Madurai Panthers',
    snapshot: { hacked: true },
  }));
  assert.equal(again.updated, false);
  const listed = await store.listRecords({ status: 'verified', page: 1, limit: 20 });
  assert.equal(listed.records[0].predictedWinner, 'Salem Spartans');
  assert.equal(listed.records[0].actualWinner, 'Salem Spartans');
});

test('confirm unknown match returns 404', async () => {
  const store = createStore({ filePath: tempPath() });
  await assert.rejects(
    () => store.confirmActualWinner({
      matchId: 'missing',
      actualWinner: 'X',
      admin: { userId: 1, email: 'a@b.com' },
    }),
    (err) => err.status === 404,
  );
});

test('matchId is coerced to string; numeric id confirms via string param', async () => {
  const store = createStore({ filePath: tempPath() });
  await store.upsertPendingCapture(baseRecord({ matchId: 42 }));
  const listed = await store.listRecords({ status: 'pending', page: 1, limit: 20 });
  assert.equal(listed.records[0].matchId, '42');
  const ok = await store.confirmActualWinner({
    matchId: '42',
    actualWinner: 'Salem Spartans',
    admin: { userId: 1, email: 'a@b.com' },
  });
  assert.equal(ok.record.status, 'verified');
});

test('idempotent confirm same winner succeeds; different winner can be edited', async () => {
  const store = createStore({ filePath: tempPath() });
  await store.upsertPendingCapture(baseRecord());
  await store.confirmActualWinner({
    matchId: 'm1',
    actualWinner: 'Salem Spartans',
    admin: { userId: 1, email: 'a@b.com' },
  });
  const same = await store.confirmActualWinner({
    matchId: 'm1',
    actualWinner: 'Salem Spartans',
    admin: { userId: 1, email: 'a@b.com' },
  });
  assert.equal(same.record.actualWinner, 'Salem Spartans');
  assert.equal(same.changed, false);
  const edited = await store.confirmActualWinner({
    matchId: 'm1',
    actualWinner: 'Madurai Panthers',
    admin: { userId: 2, email: 'edit@b.com' },
  });
  assert.equal(edited.record.actualWinner, 'Madurai Panthers');
  assert.equal(edited.edited, true);
  assert.equal(edited.record.confirmedByEmail, 'edit@b.com');
});

test('abandoned tosses leave pending, retain inputs, survive capture and can be corrected', async () => {
  const store = createStore({ filePath: tempPath() });
  const initial = baseRecord();
  await store.upsertPendingCapture(initial);
  const admin = { userId: 1, email: 'admin@test.invalid' };
  const result = await store.confirmActualWinner({ matchId: 'm1', actualWinner: 'No Result', admin });
  assert.equal(result.record.status, 'abandoned');
  assert.equal(result.record.predictionCorrect, null);
  assert.deepEqual(result.record.snapshot, initial.snapshot);
  assert.equal((await store.listRecords({ status: 'pending' })).records.length, 0);
  assert.equal((await store.listRecords({ status: 'verified' })).records.length, 0);
  assert.equal((await store.listRecords({ status: 'abandoned' })).records.length, 1);
  assert.equal((await store.confirmActualWinner({ matchId: 'm1', actualWinner: 'No Result', admin })).changed, false);
  assert.equal((await store.upsertPendingCapture(baseRecord({ actualWinner: initial.team1 }))).updated, false);
  assert.equal((await store.buildExport()).records[0].actualWinner, 'No Result');
  const corrected = await store.confirmActualWinner({ matchId: 'm1', actualWinner: initial.team1, admin });
  assert.equal(corrected.edited, true);
  assert.equal(corrected.record.status, 'verified');
  assert.equal(corrected.record.predictionCorrect, true);
  assert.equal((await store.confirmActualWinner({ matchId: 'm1', actualWinner: 'No Result', admin })).edited, true);
});
