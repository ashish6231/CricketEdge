const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const { createStore } = require('../services/tossDatasetStore');
const {
  getTossDataset,
  patchTossActualWinner,
  postTossDatasetCapture,
  getTossDatasetExport,
} = require('../routes/admin');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    set(k, v) { this.headers[k] = v; return this; },
  };
  return res;
}

test('lists pending records for superadmin handler', async () => {
  const store = createStore({
    filePath: path.join(os.tmpdir(), `toss_route_${Date.now()}.json`),
  });
  await store.upsertPendingCapture({
    matchId: '10',
    marketId: null,
    matchName: 'Alpha v Beta',
    competitionName: null,
    team1: 'Alpha',
    team2: 'Beta',
    startTime: null,
    endedAt: null,
    capturedAt: new Date().toISOString(),
    snapshot: { teamNames: ['Alpha', 'Beta'] },
    predictedWinner: 'Alpha',
    predictionReason: 'x',
    predictionRisk: {},
    matchedRules: [],
    predictorVersion: 'production',
    actualWinner: null,
    status: 'pending',
    confirmedAt: null,
    confirmedByEmail: null,
    confirmedById: null,
    lastCaptureError: null,
  });
  const res = mockRes();
  await getTossDataset(
    { query: { status: 'pending', page: '1', limit: '20', search: '' } },
    res,
    { store },
  );
  assert.equal(res.body.success, true);
  assert.equal(res.body.records.length, 1);
});

test('confirm winner writes through store', async () => {
  const store = createStore({
    filePath: path.join(os.tmpdir(), `toss_route_c_${Date.now()}.json`),
  });
  await store.upsertPendingCapture({
    matchId: '11',
    marketId: null,
    matchName: 'Alpha v Beta',
    competitionName: null,
    team1: 'Alpha',
    team2: 'Beta',
    startTime: null,
    endedAt: null,
    capturedAt: new Date().toISOString(),
    snapshot: { teamNames: ['Alpha', 'Beta'] },
    predictedWinner: 'Alpha',
    predictionReason: 'x',
    predictionRisk: {},
    matchedRules: [],
    predictorVersion: 'production',
    actualWinner: null,
    status: 'pending',
    confirmedAt: null,
    confirmedByEmail: null,
    confirmedById: null,
    lastCaptureError: null,
  });
  const res = mockRes();
  const auditCalls = [];
  await patchTossActualWinner(
    {
      params: { matchId: '11' },
      body: { actualWinner: 'Beta' },
      user: { userId: 9, email: 'super@cricedge.in' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test' },
    },
    res,
    {
      store,
      auditLog: async (...args) => { auditCalls.push(args); },
    },
  );
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.actualWinner, 'Beta');
  assert.equal(auditCalls.length, 1);
});

test('export sets content-disposition', async () => {
  const store = createStore({
    filePath: path.join(os.tmpdir(), `toss_route_e_${Date.now()}.json`),
  });
  const res = mockRes();
  await getTossDatasetExport({}, res, { store });
  assert.match(res.headers['Content-Disposition'], /toss_dataset\.json/);
  assert.equal(res.body.version, 1);
});

test('capture endpoint returns summary', async () => {
  const res = mockRes();
  await postTossDatasetCapture({}, res, {
    runTossCaptureNow: async () => ({ scanned: 2, captured: 1, skipped: 1, failed: 0 }),
  });
  assert.deepEqual(res.body.data, { scanned: 2, captured: 1, skipped: 1, failed: 0 });
});
