const fsp = require('fs/promises');
const path = require('path');
const { createPredictionDatasetPersistence } = require('./predictionDatasetPersistence');

const DEFAULT_DATASET_PATH = path.join(__dirname, '../data/toss_dataset.json');

function emptyDataset() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: [],
  };
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function hasUsableSnapshot(snapshot) {
  return snapshot !== null && typeof snapshot === 'object' && !Array.isArray(snapshot);
}

function createStore({ filePath = DEFAULT_DATASET_PATH, persistence } = {}) {
  const database = persistence === undefined ? createPredictionDatasetPersistence({ filePath }) : persistence;
  let chain = Promise.resolve();

  function enqueue(fn) {
    const result = chain.then(() => database ? database.runExclusive(fn) : fn());
    chain = result.catch(() => {});
    return result;
  }

  async function readDatasetFromDisk() {
    if (database) return database.read();
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.records)) {
        throw new Error('invalid dataset');
      }
      return parsed;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // corrupt or invalid JSON — reinitialize
      }
      const fresh = emptyDataset();
      await writeDatasetToDisk(fresh);
      return fresh;
    }
  }

  async function writeDatasetToDisk(data) {
    data.updatedAt = new Date().toISOString();
    if (database) return database.write(data);
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });
    const tmpPath = `${filePath}.${Math.random().toString(16).slice(2)}.tmp`;
    await fsp.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await fsp.rename(tmpPath, filePath);
  }

  async function load() {
    return enqueue(() => readDatasetFromDisk());
  }

  async function listRecords({ status = 'all', search, page = 1, limit = 20 } = {}) {
    const data = await load();
    let records = data.records;

    if (status && status !== 'all') {
      records = records.filter((r) => r.status === status);
    }

    if (search) {
      const q = search.toLowerCase();
      records = records.filter(
        (r) =>
          (r.matchName && r.matchName.toLowerCase().includes(q)) ||
          (r.team1 && r.team1.toLowerCase().includes(q)) ||
          (r.team2 && r.team2.toLowerCase().includes(q)),
      );
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);
    const total = records.length;
    const pages = Math.max(1, Math.ceil(total / safeLimit));
    const offset = (safePage - 1) * safeLimit;

    return {
      records: records.slice(offset, offset + safeLimit),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages,
      },
    };
  }

  async function upsertPendingCapture(record) {
    return enqueue(async () => {
      const data = await readDatasetFromDisk();
      const matchId = String(record.matchId);
      const existing = data.records.find((r) => String(r.matchId) === matchId);

      const isVerified = !!record.actualWinner;
      const status = record.actualWinner === 'No Result' ? 'abandoned' : isVerified ? 'verified' : 'pending';
      const actualWinner = record.actualWinner || null;
      const confirmedAt = isVerified ? (record.capturedAt || new Date().toISOString()) : null;
      const confirmedByEmail = isVerified ? 'crex-auto' : null;
      const confirmedById = isVerified ? 'system' : null;

      if (!existing) {
        const newRecord = { 
          ...record, 
          matchId, 
          status, 
          actualWinner,
          confirmedAt,
          confirmedByEmail,
          confirmedById
        };
        data.records.push(newRecord);
        await writeDatasetToDisk(data);
        return { record: newRecord, created: true, updated: false };
      }

      if (['verified', 'abandoned'].includes(existing.status)) {
        return { record: existing, created: false, updated: false };
      }

      if (hasUsableSnapshot(existing.snapshot) && !existing.lastCaptureError && !isVerified) {
        return { record: existing, created: false, updated: false };
      }

      Object.assign(existing, { ...record, matchId }, {
        status,
        actualWinner,
        confirmedAt,
        confirmedByEmail,
        confirmedById,
      });
      await writeDatasetToDisk(data);
      return { record: existing, created: false, updated: true };
    });
  }

  async function confirmActualWinner({ matchId, actualWinner, admin }) {
    return enqueue(async () => {
      const data = await readDatasetFromDisk();
      const id = String(matchId);
      const existing = data.records.find((r) => String(r.matchId) === id);

      if (!existing) {
        throw httpError(404, 'Match not found in toss dataset');
      }

      if (![existing.team1, existing.team2, 'No Result'].includes(actualWinner)) {
        throw httpError(400, 'actualWinner must be team1, team2 or No Result');
      }

      const nextStatus = actualWinner === 'No Result' ? 'abandoned' : 'verified';
      if (existing.status === nextStatus && existing.actualWinner === actualWinner) {
        return { record: existing, changed: false };
      }

      const wasVerified = ['verified', 'abandoned'].includes(existing.status);
      existing.status = nextStatus;
      existing.actualWinner = actualWinner;
      existing.confirmedAt = new Date().toISOString();
      existing.confirmedByEmail = admin.email;
      existing.confirmedById = admin.userId;
      existing.predictionCorrect = actualWinner === 'No Result' || !existing.predictedWinner
        ? null : existing.predictedWinner === actualWinner;

      await writeDatasetToDisk(data);
      return { record: existing, changed: true, edited: wasVerified };
    });
  }

  async function buildExport() {
    return load();
  }

  return {
    load,
    listRecords,
    upsertPendingCapture,
    confirmActualWinner,
    buildExport,
  };
}

let defaultStore = null;

function getDefaultStore() {
  if (!defaultStore) defaultStore = createStore();
  return defaultStore;
}

module.exports = {
  DEFAULT_DATASET_PATH,
  emptyDataset,
  createStore,
  getDefaultStore,
};
