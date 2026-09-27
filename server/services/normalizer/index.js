/**
 * services/normalizer/index.js
 * Normalizer Worker Entrypoint
 * Consumes raw ingestion events from BullMQ queue and processes them via normalizer.js.
 */

const { createIngestWorker } = require('./queue');
const { processIngestJob } = require('./normalizer');

let _workerInstance = null;

function start() {
  console.log('🚀 [Normalizer] starting queue worker service...');
  _workerInstance = createIngestWorker(async (job) => {
    await processIngestJob(job);
  });
  return _workerInstance;
}

function stop() {
  if (_workerInstance && typeof _workerInstance.close === 'function') {
    _workerInstance.close().catch(() => {});
  }
  _workerInstance = null;
  console.log('⏹️  [Normalizer] worker stopped.');
}

if (require.main === module) {
  require('dotenv').config();
  start();
}

module.exports = {
  start,
  stop,
};
