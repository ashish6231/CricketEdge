/**
 * services/normalizer/queue.js
 * Ingestion Queue setup using BullMQ with fallback for local dev.
 */

const { Queue, Worker } = require('bullmq');
const { getRedisClient, REDIS_URL } = require('../../shared/redis');
const { EventEmitter } = require('events');

const QUEUE_NAME = 'cricket-ingest-queue';

class InMemoryQueue extends EventEmitter {
  constructor() {
    super();
    this.name = QUEUE_NAME;
    this.handler = null;
    this.isMock = true;
  }

  async add(name, data, opts = {}) {
    // Process asynchronously to simulate worker queue behavior
    setImmediate(async () => {
      if (typeof this.handler === 'function') {
        try {
          await this.handler({ name, data, id: `mock-${Date.now()}` });
        } catch (err) {
          console.error('[InMemoryQueue] processing error:', err.message);
        }
      }
    });
    return { id: `mock-${Date.now()}` };
  }

  process(handler) {
    this.handler = handler;
  }
}

let _queue = null;
let _worker = null;

function getIngestQueue() {
  if (_queue) return _queue;

  const redis = getRedisClient();
  if (REDIS_URL && !redis.isMock) {
    try {
      _queue = new Queue(QUEUE_NAME, {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 2,
        },
      });
      return _queue;
    } catch (e) {
      console.warn('⚠️  [BullMQ] could not initialize Redis Queue, using fallback:', e.message);
    }
  }

  _queue = new InMemoryQueue();
  return _queue;
}

function createIngestWorker(processHandler) {
  const redis = getRedisClient();
  const queue = getIngestQueue();

  if (queue.isMock) {
    queue.process(processHandler);
    console.log('✅ [Normalizer-Worker] running on in-memory queue.');
    return queue;
  }

  if (_worker) return _worker;

  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      return await processHandler(job);
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  _worker.on('failed', (job, err) => {
    console.warn(`⚠️  [Normalizer-Worker] job ${job?.id} failed:`, err.message);
  });

  console.log('✅ [Normalizer-Worker] BullMQ worker initialized with Redis connection.');
  return _worker;
}

module.exports = {
  getIngestQueue,
  createIngestWorker,
  QUEUE_NAME,
};
