/**
 * shared/redis.js
 * Centralized Redis client, Pub/Sub manager, and Distributed Lock helper.
 * Uses ioredis if REDIS_URL is configured, with zero-crash in-memory fallback for local dev.
 */

const Redis = require('ioredis');
const { EventEmitter } = require('events');

const REDIS_URL = process.env.REDIS_URL || null;

class InMemoryRedisMock extends EventEmitter {
  constructor() {
    super();
    this.store = new Map();
    this.ttls = new Map();
    this.isMock = true;
    console.log('ℹ️  Redis: running in in-memory fallback mode (REDIS_URL not configured).');
  }

  async get(key) {
    const expiresAt = this.ttls.get(key);
    if (expiresAt && Date.now() > expiresAt) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }
    return this.store.get(key) || null;
  }

  async set(key, value, ...args) {
    this.store.set(key, String(value));
    if (args && args.length >= 2) {
      const mode = String(args[0]).toUpperCase();
      if (mode === 'EX') {
        const seconds = parseInt(args[1], 10);
        this.ttls.set(key, Date.now() + seconds * 1000);
      } else if (mode === 'PX') {
        const ms = parseInt(args[1], 10);
        this.ttls.set(key, Date.now() + ms);
      }
    }
    return 'OK';
  }

  async del(...keys) {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
      this.ttls.delete(k);
    }
    return count;
  }

  async setnx(key, value) {
    if (this.store.has(key)) return 0;
    this.store.set(key, String(value));
    return 1;
  }

  async expire(key, seconds) {
    if (!this.store.has(key)) return 0;
    this.ttls.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async publish(channel, message) {
    this.emit(channel, message);
    return 1;
  }

  async subscribe(channel) {
    return 1;
  }

  duplicate() {
    return this;
  }

  async quit() {
    return 'OK';
  }
}

let _client = null;
let _subClient = null;

function getRedisClient() {
  if (_client) return _client;

  if (REDIS_URL) {
    try {
      _client = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times) {
          return Math.min(times * 100, 3000);
        },
      });
      _client.on('error', (err) => {
        console.warn('⚠️  Redis Client Error:', err.message);
      });
      _client.on('connect', () => {
        console.log('✅ Redis connected successfully to', REDIS_URL.replace(/:\/\/[^@]*@/, '://***@'));
      });
      return _client;
    } catch (e) {
      console.warn('⚠️  Redis connection failed, using fallback:', e.message);
    }
  }

  _client = new InMemoryRedisMock();
  return _client;
}

function getSubClient() {
  if (_subClient) return _subClient;
  const client = getRedisClient();
  if (client.isMock) {
    _subClient = client;
    return _subClient;
  }
  _subClient = client.duplicate();
  return _subClient;
}

/**
 * Acquire a distributed lock (Singleton pattern for TennisLiveLoad worker)
 * @param {string} lockKey
 * @param {number} ttlSeconds
 * @param {string} ownerId
 * @returns {Promise<boolean>}
 */
async function acquireLock(lockKey, ttlSeconds = 30, ownerId = String(process.pid)) {
  const client = getRedisClient();
  try {
    if (client.isMock) {
      const existing = await client.get(lockKey);
      if (existing && existing !== ownerId) return false;
      await client.set(lockKey, ownerId, 'EX', ttlSeconds);
      return true;
    }
    const res = await client.set(lockKey, ownerId, 'NX', 'EX', ttlSeconds);
    return res === 'OK';
  } catch (err) {
    console.warn(`[RedisLock] Error acquiring lock ${lockKey}:`, err.message);
    return false;
  }
}

/**
 * Refresh an existing lock heartbeat
 */
async function refreshLock(lockKey, ttlSeconds = 30, ownerId = String(process.pid)) {
  const client = getRedisClient();
  try {
    const current = await client.get(lockKey);
    if (current === ownerId) {
      await client.set(lockKey, ownerId, 'EX', ttlSeconds);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Release a distributed lock
 */
async function releaseLock(lockKey, ownerId = String(process.pid)) {
  const client = getRedisClient();
  try {
    const current = await client.get(lockKey);
    if (current === ownerId) {
      await client.del(lockKey);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  getRedisClient,
  getSubClient,
  acquireLock,
  refreshLock,
  releaseLock,
  REDIS_URL,
};
