const fs = require('node:fs/promises');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash } = require('node:crypto');

const DATASET_FILES = Object.freeze({
  'match_dataset.json': 'matches', 'toss_dataset.json': 'tosses',
  'emirates_d10_dataset.json': 'emirates_d10', 'wncl_dataset.json': 'wncl',
  'womens_spring_dataset.json': 'womens_spring',
});

function createPredictionDatasetPersistence({ filePath, prisma, datasetKey, enabled } = {}) {
  const filename = path.basename(filePath);
  const defaultLocation = path.resolve(filePath) === path.resolve(__dirname, '../data', filename);
  const key = datasetKey || (defaultLocation ? DATASET_FILES[filename] : null);
  const mode = process.env.PREDICTION_STORAGE;
  const database = enabled ?? (!!key && (mode === 'database'
    || (!mode && (process.env.NODE_ENV === 'production'
      || (process.env.NODE_ENV !== 'test' && !!process.env.DATABASE_URL)))));
  if (!database) return null;
  if (!key) throw new Error('Database dataset key required');
  const context = new AsyncLocalStorage();
  const client = () => prisma || require('../db/prisma');
  const recordKey = record => {
    const value = record.recordId ?? record.matchId;
    if (value === undefined || value === null || !String(value).trim()) throw new Error(`Missing record identity in ${key}`);
    if (String(value).length > 191) throw new Error('Dataset record identity too long');
    return String(value);
  };
  async function write(data) {
    const state = context.getStore();
    if (!state) throw new Error('Dataset write requires a transaction');
    if (!Array.isArray(data.records)) throw new Error('Invalid dataset; refusing to overwrite');
    const next = new Map();
    for (const [position, record] of data.records.entries()) {
      const identity = recordKey(record);
      if (next.has(identity)) throw new Error(`Duplicate record identity in ${key}: ${identity}`);
      const payload = JSON.stringify(record);
      const previous = state.records.get(identity);
      if (!previous || previous.payload !== payload || previous.position !== position) {
        const id = createHash('sha256').update(`${key}\0${identity}`).digest('hex');
        await state.tx.$executeRaw`INSERT INTO PredictionRecord (id, datasetKey, recordKey, payload, position, createdAt, updatedAt)
          VALUES (${id}, ${key}, ${identity}, ${payload}, ${position}, NOW(3), NOW(3))
          ON DUPLICATE KEY UPDATE payload = VALUES(payload), position = VALUES(position), updatedAt = NOW(3)`;
      }
      next.set(identity, { payload, position });
    }
    for (const identity of state.records.keys()) {
      if (!next.has(identity)) await state.tx.$executeRaw`DELETE FROM PredictionRecord WHERE datasetKey = ${key} AND recordKey = ${identity}`;
    }
    const { records, ...metadata } = data;
    await state.tx.$executeRaw`UPDATE PredictionDataset SET metadata = ${JSON.stringify(metadata)}, initialized = TRUE, updatedAt = NOW(3) WHERE id = ${key}`;
    state.records = next;
    state.metadata = metadata;
    state.initialized = true;
  }
  async function read() {
    const state = context.getStore();
    if (!state) throw new Error('Dataset read requires a transaction');
    if (!state.initialized) {
      let seed;
      try { seed = JSON.parse(await fs.readFile(filePath, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; seed = { version: 1, records: [] }; }
      // Only the first import reads disk. A later deploy must never replace DB
      // records with an older repository JSON file, including an empty DB.
      await write(seed);
    }
    return { ...structuredClone(state.metadata), records: [...state.records.values()]
      .sort((a, b) => a.position - b.position).map(row => JSON.parse(row.payload)) };
  }
  async function runExclusive(fn) {
    return client().$transaction(async tx => {
      // This row lock serializes read/modify/write across workers, replicas and
      // concurrent deploys; a process-local promise queue alone cannot do that.
      await tx.$executeRaw`INSERT INTO PredictionDataset (id, metadata, initialized, updatedAt)
        VALUES (${key}, '{}', FALSE, NOW(3)) ON DUPLICATE KEY UPDATE id = VALUES(id)`;
      const [header] = await tx.$queryRaw`SELECT metadata, initialized FROM PredictionDataset WHERE id = ${key} FOR UPDATE`;
      const rows = await tx.$queryRaw`SELECT recordKey, payload, position FROM PredictionRecord WHERE datasetKey = ${key} ORDER BY position`;
      const state = { tx, initialized: !!header.initialized, metadata: JSON.parse(header.metadata),
        records: new Map(rows.map(row => [row.recordKey, { payload: row.payload, position: row.position }])) };
      return context.run(state, fn);
    }, { maxWait: 15000, timeout: 120000 });
  }
  return { read, write, runExclusive, datasetKey: key };
}
module.exports = { createPredictionDatasetPersistence, DATASET_FILES };
