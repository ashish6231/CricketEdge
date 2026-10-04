const fsp = require('fs/promises');
const path = require('path');
const { checkMatchRecordQuality } = require('./matchRecordQuality');

const DEFAULT_DATASET_PATH = path.join(__dirname, '../data/match_dataset.json');

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

function createStore({ filePath = DEFAULT_DATASET_PATH } = {}) {
  let chain = Promise.resolve();

  function enqueue(fn) {
    const result = chain.then(fn);
    chain = result.catch(() => {});
    return result;
  }

  async function readDatasetFromDisk() {
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.records)) {
        throw new Error('invalid dataset');
      }
      return parsed;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      const fresh = emptyDataset();
      await writeDatasetToDisk(fresh);
      return fresh;
    }
  }

  async function writeDatasetToDisk(data) {
    data.updatedAt = new Date().toISOString();
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
    const quality = checkMatchRecordQuality(record);
    if (!quality.valid) throw httpError(400, `Invalid match data: ${quality.reason}`);
    if (record.actualWinner && ![record.team1, record.team2, 'No Result'].includes(record.actualWinner)) {
      throw httpError(400, 'actualWinner must be team1, team2 or No Result');
    }
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

      const existingIsUsable = checkMatchRecordQuality(existing).valid;
      const existingResolved = existing.resultVerification?.verification === 'verified'
        || existing.resultVerification?.status === 'verified'
        || (existing.confirmedByEmail && existing.confirmedByEmail !== 'crex-auto');
      if (existingIsUsable && ['verified', 'abandoned'].includes(existing.status) && existingResolved) {
        return { record: existing, created: false, updated: false };
      }

      if (existingIsUsable && !isVerified) {
        return { record: existing, created: false, updated: false };
      }

      // Resolving a result must retain the saved input and original prediction.
      Object.assign(existing, existingIsUsable ? {} : { ...record, matchId }, {
        status,
        actualWinner,
        confirmedAt,
        confirmedByEmail,
        confirmedById,
        ...(isVerified ? {
          reportedWinner: record.reportedWinner || actualWinner,
          resultText: record.resultText || null,
          resultVerification: record.resultVerification || null,
        } : {}),
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
        throw httpError(404, 'Match not found in match dataset');
      }

      if (!checkMatchRecordQuality(existing).valid) {
        throw httpError(400, 'Cannot confirm a match without proper saved data');
      }

      if (actualWinner !== existing.team1 && actualWinner !== existing.team2) {
        throw httpError(400, 'actualWinner must be team1 or team2');
      }

      if (existing.status === 'verified' && existing.actualWinner === actualWinner) {
        return { record: existing, changed: false };
      }

      const wasVerified = existing.status === 'verified';
      existing.status = 'verified';
      existing.actualWinner = actualWinner;
      existing.confirmedAt = new Date().toISOString();
      existing.confirmedByEmail = admin.email;
      existing.confirmedById = admin.userId;
      existing.predictionCorrect = existing.predictedWinner ? existing.predictedWinner === actualWinner : null;
      delete existing.resultVerification;

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
