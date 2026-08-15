# Toss Dataset (JSON) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture ended toss markets into `server/data/toss_dataset.json`, let Superadmin confirm real winners in an admin tab, and export the labeled dataset for future algorithm work.

**Architecture:** JSON file is the source of truth. `tossDatasetStore` owns atomic read/write. `tossCapture` discovers ended tosses via scraper and appends pending records (including current predictor output). A worker + manual Capture now trigger capture. Superadmin APIs + `AdminTossDataset` UI list pending/verified and confirm winners with audit logs.

**Tech Stack:** Node.js (CommonJS server), Express, Prisma (audit logs only), React + Vite frontend, `node:test` for unit tests, dynamic `import()` of ESM `tossPredictor.js`.

## Global Constraints

- Capture only when toss list item `status === 'ended'` and `(totalMatched || 0) > 0`
- Storage is JSON only — no `TossDatasetRecord` Prisma model / migration
- Never overwrite a `verified` record’s snapshot, prediction, or `actualWinner`
- Never treat inferred odds winner as ground truth
- Do not change production `tossPredictor.js` rules in this plan
- Do not expose upstream hostnames (e.g. `tennisliveload.com`) in admin-facing errors
- Superadmin only for all toss-dataset APIs and UI
- Spec: `docs/superpowers/specs/2026-08-15-toss-dataset-json-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `server/data/toss_dataset.json` | Dataset file (version + records) |
| `server/services/tossDatasetStore.js` | Atomic load/save, list, upsert pending, confirm winner, export |
| `server/services/tossCapture.js` | Ended-match discovery, snapshot fetch, predictor call, upsert |
| `server/services/tossCaptureWorker.js` | Interval worker, overlap guard, `runTossCaptureNow` |
| `server/tests/tossDatasetStore.test.js` | Store unit tests |
| `server/tests/tossCapture.test.js` | Capture + worker unit tests |
| `server/routes/admin.js` | Superadmin toss-dataset routes |
| `server/index.js` | Start/stop capture worker |
| `server/package.json` | Optional script aliases if useful |
| `server/.env.example` | `TOSS_CAPTURE_INTERVAL_MS` |
| `frontend/src/utils/tossDatasetAdmin.js` | Query builder + small helpers |
| `frontend/src/utils/tossDatasetAdmin.test.js` | Helper tests |
| `frontend/src/api.js` | Admin API client functions |
| `frontend/src/pages/admin/AdminTossDataset.jsx` | Superadmin UI |
| `frontend/src/pages/AdminPage.jsx` | Tab wiring |
| `frontend/src/utils/adminAuditLogs.js` | Add confirm action to audit filter list if present |

---

### Task 1: JSON dataset store

**Files:**
- Create: `server/data/toss_dataset.json`
- Create: `server/services/tossDatasetStore.js`
- Test: `server/tests/tossDatasetStore.test.js`

**Interfaces:**
- Consumes: Node `fs` / `fs.promises`, `path`, `os`
- Produces:
  - `DEFAULT_DATASET_PATH` (string)
  - `emptyDataset()` → `{ version: 1, updatedAt: string, records: [] }`
  - `createStore({ filePath })` → store object:
    - `async load()` → dataset
    - `async listRecords({ status, search, page, limit })` → `{ records, pagination: { page, limit, total, pages } }`
    - `async upsertPendingCapture(record)` → `{ record, created: boolean, updated: boolean }`
    - `async confirmActualWinner({ matchId, actualWinner, admin })` → `{ record }`
    - `async buildExport()` → full dataset object
  - Errors: `{ status: 400|404|409, message: string }` thrown as plain objects or Error with `.status`

- [ ] **Step 1: Write failing store tests**

Create `server/tests/tossDatasetStore.test.js`:

```js
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

test('idempotent confirm same winner succeeds; different winner is 409', async () => {
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
  await assert.rejects(
    () => store.confirmActualWinner({
      matchId: 'm1',
      actualWinner: 'Madurai Panthers',
      admin: { userId: 1, email: 'a@b.com' },
    }),
    (err) => err.status === 409,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && node --test tests/tossDatasetStore.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement store + empty JSON file**

Create `server/data/toss_dataset.json`:

```json
{
  "version": 1,
  "updatedAt": "2026-08-15T00:00:00.000Z",
  "records": []
}
```

Create `server/services/tossDatasetStore.js` implementing:

- Mutex queue so concurrent `load`/`save` operations serialize
- Atomic save: write `filePath + '.' + random + '.tmp'` then `fs.renameSync`/`await rename`
- Corrupt/missing file → `emptyDataset()` then save
- `listRecords`: filter by `status` (`pending`|`verified`|`all`), case-insensitive `search` on `matchName`/`team1`/`team2`, paginate with defaults `page=1`, `limit=20`, max limit 100
- `upsertPendingCapture`:
  - if no existing → push pending record, `created: true`
  - if verified → return existing, `updated: false`
  - if pending with usable snapshot (truthy object) → skip, `updated: false`
  - if pending with null/empty snapshot or `lastCaptureError` → merge fill-in fields, `updated: true`
- `confirmActualWinner`:
  - 404 if missing
  - 400 if `actualWinner` not exactly `team1` or `team2`
  - if verified and same winner → return record
  - if verified and different → 409
  - else set `status: 'verified'`, `actualWinner`, `confirmedAt` ISO, `confirmedByEmail`, `confirmedById` from `admin.userId` / `admin.email`
- `buildExport` → full dataset after load
- Throw errors as `Object.assign(new Error(message), { status })`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && node --test tests/tossDatasetStore.test.js`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add server/data/toss_dataset.json server/services/tossDatasetStore.js server/tests/tossDatasetStore.test.js
git commit -m "feat: add atomic JSON toss dataset store"
```

---

### Task 2: Capture service + worker

**Files:**
- Create: `server/services/tossCapture.js`
- Create: `server/services/tossCaptureWorker.js`
- Test: `server/tests/tossCapture.test.js`
- Modify: `server/.env.example` (append `TOSS_CAPTURE_INTERVAL_MS=60000`)

**Interfaces:**
- Consumes: `createStore` / store methods from Task 1; `scraper.getAllTossMatches`, `scraper.getTossSnapshot` (injectable)
- Produces:
  - `async captureEndedTosses({ scraper, store, predictTossWinner, now } = {})` → `{ scanned, captured, skipped, failed }`
  - `startTossCaptureWorker({ intervalMs, captureEndedTosses })` → `{ stop() }`
  - `async runTossCaptureNow()` → capture summary (uses default deps)
  - Constant `PREDICTOR_VERSION = 'production'`

- [ ] **Step 1: Write failing capture/worker tests**

Create `server/tests/tossCapture.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const { createStore } = require('../services/tossDatasetStore');
const { captureEndedTosses } = require('../services/tossCapture');
const { startTossCaptureWorker } = require('../services/tossCaptureWorker');

function tempStore() {
  return createStore({
    filePath: path.join(os.tmpdir(), `toss_cap_${Date.now()}_${Math.random().toString(16).slice(2)}.json`),
  });
}

test('captures only ended matches with volume', async () => {
  const store = tempStore();
  const calls = [];
  const scraper = {
    async getAllTossMatches() {
      return [
        { matchId: '1', matchName: 'A v B', status: 'ended', totalMatched: 100, competitionName: 'X', startTime: '2026-08-01T00:00:00.000Z' },
        { matchId: '2', matchName: 'C v D', status: 'in-play', totalMatched: 100 },
        { matchId: '3', matchName: 'E v F', status: 'ended', totalMatched: 0 },
      ];
    },
    async getTossSnapshot(matchId) {
      calls.push(matchId);
      return {
        teamNames: ['Team A', 'Team B'],
        marketId: 'mk1',
      };
    },
  };
  const summary = await captureEndedTosses({
    scraper,
    store,
    predictTossWinner: () => ({
      winnerName: 'Team A',
      reason: 'Higher Lay Trades',
      risk: { tier: 'medium' },
      matchedRules: [{ reason: 'Higher Lay Trades' }],
    }),
  });
  assert.equal(summary.scanned, 1);
  assert.equal(summary.captured, 1);
  assert.equal(summary.skipped, 0);
  assert.equal(summary.failed, 0);
  assert.deepEqual(calls, ['1']);
  const listed = await store.listRecords({ status: 'pending', page: 1, limit: 20 });
  assert.equal(listed.records[0].team1, 'Team A');
  assert.equal(listed.records[0].predictedWinner, 'Team A');
});

test('skips already captured matchIds', async () => {
  const store = tempStore();
  await store.upsertPendingCapture({
    matchId: '1',
    marketId: null,
    matchName: 'A v B',
    competitionName: null,
    team1: 'Team A',
    team2: 'Team B',
    startTime: null,
    endedAt: null,
    capturedAt: new Date().toISOString(),
    snapshot: { teamNames: ['Team A', 'Team B'] },
    predictedWinner: 'Team A',
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
  let snapCalls = 0;
  const summary = await captureEndedTosses({
    store,
    scraper: {
      async getAllTossMatches() {
        return [{ matchId: '1', matchName: 'A v B', status: 'ended', totalMatched: 10 }];
      },
      async getTossSnapshot() {
        snapCalls += 1;
        return { teamNames: ['Team A', 'Team B'] };
      },
    },
    predictTossWinner: () => ({ winnerName: 'Team A', reason: 'x', risk: {}, matchedRules: [] }),
  });
  assert.equal(summary.skipped, 1);
  assert.equal(summary.captured, 0);
  assert.equal(snapCalls, 0);
});

test('counts snapshot failures', async () => {
  const store = tempStore();
  const summary = await captureEndedTosses({
    store,
    scraper: {
      async getAllTossMatches() {
        return [{ matchId: '9', matchName: 'X v Y', status: 'ended', totalMatched: 5 }];
      },
      async getTossSnapshot() {
        return { error: 'No toss data' };
      },
    },
    predictTossWinner: () => ({ winnerName: 'X', reason: 'x', risk: {}, matchedRules: [] }),
  });
  assert.equal(summary.failed, 1);
});

test('worker overlap guard skips concurrent ticks', async () => {
  let runs = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const worker = startTossCaptureWorker({
    intervalMs: 20,
    captureEndedTosses: async () => {
      runs += 1;
      if (runs === 1) await gate;
      return { scanned: 0, captured: 0, skipped: 0, failed: 0 };
    },
  });
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(runs, 1);
  release();
  await new Promise((r) => setTimeout(r, 50));
  worker.stop();
  assert.ok(runs >= 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && node --test tests/tossCapture.test.js`  
Expected: FAIL (modules missing)

- [ ] **Step 3: Implement capture + worker**

`tossCapture.js` logic:

1. `matches = await scraper.getAllTossMatches()` — if not array / has `.error`, treat as failure of whole run (`scanned: 0`, throw or return failed high — prefer return `{ scanned: 0, captured: 0, skipped: 0, failed: 1 }` without throwing to keep worker alive)
2. Eligible = `status === 'ended' && (totalMatched || 0) > 0`
3. For each eligible: `existing = find in store by matchId`
   - if verified OR pending with snapshot → `skipped++`, continue
4. Else fetch snapshot; if missing/`error` → optionally `upsertPendingCapture` with `snapshot: null`, `lastCaptureError` sanitized (strip hostnames), `failed++`
5. Else build record:
   - `team1/team2` from `snapshot.teamNames[0/1]` or match name split
   - `predict = await predictTossWinner(snapshot)` (default: dynamic `import('../../frontend/src/utils/tossPredictor.js')`)
   - fields from spec; `endedAt` = `now()` ISO; `capturedAt` = now
6. `upsertPendingCapture(record)`; if created/updated → `captured++` else `skipped++`

`tossCaptureWorker.js`:

```js
function startTossCaptureWorker({
  intervalMs = Number(process.env.TOSS_CAPTURE_INTERVAL_MS || 60000),
  captureEndedTosses = require('./tossCapture').captureEndedTosses,
} = {}) {
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await captureEndedTosses();
    } catch (err) {
      console.error('Toss capture tick failed:', err.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  tick();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

let sharedWorker = null;
function runTossCaptureNow(deps) {
  const { captureEndedTosses } = require('./tossCapture');
  return (deps?.captureEndedTosses || captureEndedTosses)(deps || {});
}
module.exports = { startTossCaptureWorker, runTossCaptureNow };
```

Append to `server/.env.example`:

```
# Toss dataset auto-capture interval (ms)
TOSS_CAPTURE_INTERVAL_MS=60000
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && node --test tests/tossCapture.test.js tests/tossDatasetStore.test.js`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/tossCapture.js server/services/tossCaptureWorker.js server/tests/tossCapture.test.js server/.env.example
git commit -m "feat: add ended-toss capture service and worker"
```

---

### Task 3: Superadmin APIs + wire worker in server

**Files:**
- Modify: `server/routes/admin.js`
- Modify: `server/index.js`
- Test: extend `server/tests/tossCapture.test.js` **or** add `server/tests/tossDatasetRoutes.test.js`

**Interfaces:**
- Consumes: store + `runTossCaptureNow` + existing `auditLog`
- Produces exported handlers for tests:
  - `getTossDataset(req, res, deps)`
  - `patchTossActualWinner(req, res, deps)`
  - `postTossDatasetCapture(req, res, deps)`
  - `getTossDatasetExport(req, res, deps)`

- [ ] **Step 1: Write failing route tests**

Add to `server/tests/tossDatasetRoutes.test.js`:

```js
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
```

- [ ] **Step 2: Run tests — expect fail** (handlers not exported)

Run: `cd server && node --test tests/tossDatasetRoutes.test.js`

- [ ] **Step 3: Implement routes + index wiring**

In `server/routes/admin.js`:

- Require store factory defaulting to `createStore()` with default path, and `runTossCaptureNow`
- Implement the four handlers with dependency injection as in tests
- On confirm success, call `auditLog(admin, 'toss_dataset_confirm_winner', 'toss_dataset', Number(matchId) || 0, matchId, { before, after }, 'Confirmed toss winner', req)`
- Map store errors with `.status` to JSON `{ success: false, message }`
- Register:

```js
router.get('/toss-dataset', requireSuperAdmin, (req, res) => getTossDataset(req, res));
router.patch('/toss-dataset/:matchId/actual-winner', requireSuperAdmin, (req, res) => patchTossActualWinner(req, res));
router.post('/toss-dataset/capture', requireSuperAdmin, (req, res) => postTossDatasetCapture(req, res));
router.get('/toss-dataset/export', requireSuperAdmin, (req, res) => getTossDatasetExport(req, res));
```

- Export handlers on `module.exports` alongside `router` (same pattern as keeping `module.exports = router` then assign properties)

In `server/index.js`:

- `const { startTossCaptureWorker } = require('./services/tossCaptureWorker');`
- `let tossCaptureWorker = null;`
- In `shutdown`: `tossCaptureWorker?.stop();`
- After listen success: `tossCaptureWorker = startTossCaptureWorker({});`

- [ ] **Step 4: Run all server toss tests**

Run: `cd server && node --test tests/tossDatasetStore.test.js tests/tossCapture.test.js tests/tossDatasetRoutes.test.js`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin.js server/index.js server/tests/tossDatasetRoutes.test.js
git commit -m "feat: add Superadmin toss dataset APIs and capture worker lifecycle"
```

---

### Task 4: Frontend API helpers + query utils

**Files:**
- Create: `frontend/src/utils/tossDatasetAdmin.js`
- Create: `frontend/src/utils/tossDatasetAdmin.test.js`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/utils/adminAuditLogs.js` (add `'toss_dataset_confirm_winner'` to `AUDIT_ACTIONS` if that array exists)

**Interfaces:**
- Produces:
  - `buildTossDatasetQuery({ status, page, limit, search })` → query string
  - `adminGetTossDataset(...)`, `adminConfirmTossWinner(matchId, actualWinner)`, `adminCaptureTossDataset()`, `adminGetTossDatasetExport()`

- [ ] **Step 1: Write failing helper tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTossDatasetQuery } from './tossDatasetAdmin.js'

test('buildTossDatasetQuery encodes filters', () => {
  const q = buildTossDatasetQuery({
    status: 'pending',
    page: 2,
    limit: 20,
    search: 'Salem',
  })
  assert.equal(q, 'status=pending&page=2&limit=20&search=Salem')
})
```

- [ ] **Step 2: Run test — expect fail**

Run: `cd frontend && node --test src/utils/tossDatasetAdmin.test.js`

- [ ] **Step 3: Implement helpers + api.js functions**

`tossDatasetAdmin.js`:

```js
export function buildTossDatasetQuery({
  status = 'pending',
  page = 1,
  limit = 20,
  search = '',
} = {}) {
  const params = new URLSearchParams({
    status,
    page: String(page),
    limit: String(limit),
    search: search || '',
  })
  return params.toString()
}
```

In `api.js` (near other admin helpers):

```js
import { buildTossDatasetQuery } from './utils/tossDatasetAdmin.js'

export function adminGetTossDataset({
  status = 'pending',
  page = 1,
  limit = 20,
  search = '',
} = {}) {
  const query = buildTossDatasetQuery({ status, page, limit, search })
  return fetchAPI(`/admin/toss-dataset?${query}`)
}

export function adminConfirmTossWinner(matchId, actualWinner) {
  return fetchAPI(`/admin/toss-dataset/${encodeURIComponent(matchId)}/actual-winner`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actualWinner }),
  })
}

export function adminCaptureTossDataset() {
  return fetchAPI('/admin/toss-dataset/capture', { method: 'POST' })
}

export async function adminGetTossDatasetExport() {
  const res = await fetch(`${API_BASE}/admin/toss-dataset/export`, {
    headers: getAuthHeader(),
  })
  if (!res.ok) throw await getAPIError(res)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'toss_dataset.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
```

If `getAPIError` does not exist in current `api.js`, use the same error parsing pattern as `fetchAPI` (throw `{ status, detail }`).

Add audit action string to `AUDIT_ACTIONS` in `adminAuditLogs.js`.

- [ ] **Step 4: Run helper test — pass**

Run: `cd frontend && node --test src/utils/tossDatasetAdmin.test.js`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/tossDatasetAdmin.js frontend/src/utils/tossDatasetAdmin.test.js frontend/src/api.js frontend/src/utils/adminAuditLogs.js
git commit -m "feat: add toss dataset admin API client helpers"
```

---

### Task 5: Superadmin Toss Dataset UI

**Files:**
- Create: `frontend/src/pages/admin/AdminTossDataset.jsx`
- Modify: `frontend/src/pages/AdminPage.jsx`

**Interfaces:**
- Consumes: `adminGetTossDataset`, `adminConfirmTossWinner`, `adminCaptureTossDataset`, `adminGetTossDatasetExport`

- [ ] **Step 1: Add tab wiring in AdminPage**

- Import `Database` from `lucide-react` and `AdminTossDataset`
- Add `{ id: 'toss_dataset', label: 'Toss Dataset', icon: Database, superadminOnly: true }`
- Include `toss_dataset` in the non-superadmin redirect guard array
- Render `{tab === 'toss_dataset' && isSuperAdmin && <AdminTossDataset />}`

- [ ] **Step 2: Build AdminTossDataset page**

UI requirements (match existing admin glass-card style):

- Status toggle: Pending | Verified
- Search input (match name)
- Buttons: **Capture now**, **Export JSON**
- List rows: `matchName`, `team1` vs `team2`, `capturedAt`, `predictedWinner` (as hint only, labeled “Predicted”)
- Pending row actions: two buttons labeled with `team1` / `team2` that call confirm
- Verified row: show `actualWinner` + `confirmedAt`
- After capture: show summary text `captured/skipped/failed`
- Loading + error states
- Pagination if `pagination.pages > 1`

Keep the UI simple — no cards-in-cards clutter beyond existing admin patterns.

- [ ] **Step 3: Manual smoke check**

Run frontend + server locally. As Superadmin:

1. Open Admin → Toss Dataset
2. Click Capture now (works even if 0 new matches)
3. Confirm a pending winner if any exist
4. Export JSON downloads

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/AdminTossDataset.jsx frontend/src/pages/AdminPage.jsx
git commit -m "feat: add Superadmin Toss Dataset tab for winner confirmation"
```

---

### Task 6: End-to-end verification

**Files:** none new (verification only)

- [ ] **Step 1: Run server tests**

Run: `cd server && npm test`  
Expected: toss store/capture/route tests PASS (other tests unaffected)

- [ ] **Step 2: Run frontend helper tests**

Run: `cd frontend && node --test src/utils/tossDatasetAdmin.test.js`  
Expected: PASS

- [ ] **Step 3: Confirm dataset file path exists and is writable**

Run: `node -e "const s=require('./server/services/tossDatasetStore').createStore(); s.load().then(d=>console.log(d.version, d.records.length))"`  
Expected: prints `1 0` (or current count)

- [ ] **Step 4: Final commit if any fixes landed**

```bash
git status
# if fixes: commit with message "fix: toss dataset verification follow-ups"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Ended-only capture with volume | Task 2 |
| JSON file source of truth + atomic writes | Task 1 |
| Auto worker + Capture now | Tasks 2–3 |
| Pending list + confirm winner | Tasks 3, 5 |
| Verified freeze / no overwrite | Task 1 |
| Export JSON | Tasks 3, 5 |
| Audit log on confirm | Task 3 |
| Superadmin-only | Tasks 3, 5 |
| Predictor stored but not changed | Task 2 |
| Sanitize upstream hostnames in errors | Task 2 |
| Unit tests | Tasks 1–4, 6 |

## Placeholder / consistency review

- No TBD/TODO left in tasks
- Store method names consistent across Tasks 1–3 (`upsertPendingCapture`, `confirmActualWinner`, `listRecords`, `buildExport`)
- Route param is `matchId` (string) everywhere — not numeric DB id
- Predictor version constant `'production'` — does not require editing `tossPredictor.js`
