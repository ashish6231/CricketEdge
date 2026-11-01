const test = require('node:test');
const assert = require('node:assert/strict');
// Use a fake database throughout; importing the CLI must not connect remotely.
process.env.PREDICTION_STORAGE = 'database';
process.env.DATABASE_URL = 'mysql://test:test@localhost/test';
const { migratePredictionDatasets, withConnectionRetry } = require('../scripts/migrate_prediction_datasets');

function retryOptions() {
  const delays = [], attempts = [];
  return { delays, attempts, wait: async ms => delays.push(ms), onRetry: attempt => attempts.push(attempt) };
}

test('connection resets and wrapped MariaDB pool errors recover with bounded backoff', async () => {
  for (const failure of [{code:'ECONNRESET'}, {code:'P2010',meta:{code:'45028'}}, {code:'P2024'}]) {
    const options = retryOptions();
    let calls = 0;
    const result = await withConnectionRetry(async () => {
      if (++calls < 3) throw failure;
      return 'ready';
    }, options);
    assert.equal(result,'ready');
    assert.equal(calls,3);
    assert.deepEqual(options.delays,[1000,2000]);
    assert.deepEqual(options.attempts,[2,3]);
  }
});

test('persistent connection failures stop after three attempts; SQL failures fail immediately', async () => {
  for (const [failure, expectedCalls] of [[{code:'ECONNRESET'},3], [{code:'P2010',meta:{code:'1064'}},1], [{code:'P2002'},1]]) {
    let calls = 0;
    const options = retryOptions();
    await assert.rejects(withConnectionRetry(async () => { calls++; throw failure; },options),error => error === failure);
    assert.equal(calls,expectedCalls);
    assert.equal(options.delays.length,expectedCalls-1);
  }
});

test('migration retries idempotent DDL and failed dataset transactions before continuing', async () => {
  let ddlCalls = 0, transactions = 0;
  const prisma = {
    async $executeRawUnsafe() { if (++ddlCalls === 1) throw {code:'ECONNRESET'}; },
    async $transaction(fn) {
      if (++transactions === 1) throw {code:'P2010',meta:{code:'45028'}};
      return fn({
        $executeRaw:async () => {},
        $queryRaw:async strings => strings.join('?').includes('FROM PredictionDataset')
          ? [{metadata:'{}', initialized:true}] : [],
      });
    },
  };
  const options = retryOptions();
  const result = await migratePredictionDatasets({prisma,retryOptions:options});
  assert.equal(result.storage,'database');
  assert.equal(result.datasets.length,5);
  assert.ok(result.datasets.every(dataset => dataset.records === 0));
  assert.equal(ddlCalls,3);
  assert.equal(transactions,6);
  assert.deepEqual(options.delays,[1000,1000]);
});
