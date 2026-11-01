require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const { createPredictionDatasetPersistence, DATASET_FILES } = require('../services/predictionDatasetPersistence');

const TRANSIENT_CONNECTION_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
  'P1001', 'P1002', 'P1008', 'P1017', 'P2024', '45028']);

function isTransientConnectionError(error) {
  // Prisma wraps MariaDB pool errors in P2010; do not retry arbitrary SQL failures.
  return [error?.code, error?.errno, error?.meta?.code, error?.cause?.code,
    error?.meta?.driverAdapterError?.cause?.code]
    .some(code => TRANSIENT_CONNECTION_CODES.has(String(code)));
}

async function withConnectionRetry(operation, { wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onRetry = (attempt) => console.warn(`Prediction archive connection interrupted; retrying (${attempt}/3)...`) } = {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (attempt >= 3 || !isTransientConnectionError(error)) throw error;
      onRetry(attempt + 1);
      await wait(attempt * 1000);
    }
  }
}

async function migratePredictionDatasets({ prisma = require('../db/prisma'), retryOptions } = {}) {
  if (process.env.PREDICTION_STORAGE === 'file' || (!process.env.DATABASE_URL
    && process.env.PREDICTION_STORAGE !== 'database' && process.env.NODE_ENV !== 'production')) {
    return { storage: 'file', datasets: [] };
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required for prediction archives');
  const sql = await fs.readFile(path.join(__dirname, '../prisma/migrations/20261016170000_prediction_archives/migration.sql'), 'utf8');
  // Fixed, additive DDL only; do not run db push or alter existing app tables.
  for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
    await withConnectionRetry(() => prisma.$executeRawUnsafe(statement), retryOptions);
  }
  const datasets = [];
  for (const [filename, datasetKey] of Object.entries(DATASET_FILES)) {
    const repository = createPredictionDatasetPersistence({
      filePath: path.join(__dirname, '../data', filename), datasetKey, prisma, enabled: true });
    const data = await withConnectionRetry(() => repository.runExclusive(() => repository.read()), retryOptions);
    datasets.push({ datasetKey, records: data.records.length });
    console.log(`Prediction archive ready: ${datasetKey}, ${data.records.length} records`);
  }
  return { storage: 'database', datasets };
}
async function verifyPredictionDatasets() {
  const prisma = require('../db/prisma');
  const { createHash } = require('node:crypto');
  const summary = [];
  for (const [filename, datasetKey] of Object.entries(DATASET_FILES)) {
    const rows = await prisma.$queryRaw`SELECT recordKey, SHA2(payload, 256) AS checksum FROM PredictionRecord WHERE datasetKey = ${datasetKey}`;
    const saved = new Map(rows.map(row => [row.recordKey, row.checksum]));
    const local = JSON.parse(await fs.readFile(path.join(__dirname, '../data', filename), 'utf8'));
    const matching = local.records.filter(record => saved.get(String(record.recordId ?? record.matchId))
      === createHash('sha256').update(JSON.stringify(record)).digest('hex')).length;
    summary.push({ datasetKey, databaseRecords: rows.length, localRecords: local.records.length, matchingRecords: matching });
  }
  return summary;
}
if (require.main === module) {
  (process.argv.includes('--verify') ? verifyPredictionDatasets() : migratePredictionDatasets())
    .then(result => { console.log(JSON.stringify(result)); process.exit(0); })
    .catch(error => { console.error('Prediction archive migration failed:', error.code || error.name); process.exit(1); });
}
module.exports = { migratePredictionDatasets, withConnectionRetry };
