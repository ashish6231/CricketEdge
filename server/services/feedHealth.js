/**
 * services/feedHealth.js
 * Tracks when each upstream feed last delivered usable data.
 *
 * The ingest leader records attempts in memory and mirrors the raw timestamps
 * to Redis. Staleness is always computed at read time from those timestamps,
 * so a poller that silently stopped (standby, crashed loop, dead session) is
 * reported as stale by every replica instead of looking healthy forever.
 */

const { getCacheRedisClient } = require('../shared/redis');

const FEEDS = Object.freeze(['cricket', 'toss', 'session', 'tennis']);
const REDIS_KEY = 'feed:health';
const REDIS_TTL_SEC = 24 * 60 * 60;
const STALE_AFTER_MS = Math.max(60000, parseInt(process.env.FEED_STALE_AFTER_MS, 10) || 5 * 60 * 1000);

function createFeedHealth({ staleAfterMs = STALE_AFTER_MS, getRedis = getCacheRedisClient } = {}) {
  const state = new Map();

  const entry = feed => {
    if (!state.has(feed)) {
      state.set(feed, { firstAttemptAt: null, lastAttemptAt: null, lastSuccessAt: null, lastError: null, consecutiveFailures: 0 });
    }
    return state.get(feed);
  };

  function recordSuccess(feed, now = Date.now()) {
    const item = entry(feed);
    item.firstAttemptAt ??= now;
    item.lastAttemptAt = now;
    item.lastSuccessAt = now;
    item.lastError = null;
    item.consecutiveFailures = 0;
  }

  function recordFailure(feed, error, now = Date.now()) {
    const item = entry(feed);
    item.firstAttemptAt ??= now;
    item.lastAttemptAt = now;
    item.lastError = String(error?.message || error || 'unknown error').slice(0, 200);
    item.consecutiveFailures += 1;
  }

  /** Records the outcome of one upstream list call ({error} objects count as failures). */
  function recordResult(feed, result, now = Date.now()) {
    if (result == null) return recordFailure(feed, 'empty response', now);
    if (result.error) return recordFailure(feed, result.error, now);
    return recordSuccess(feed, now);
  }

  function rawState() {
    return Object.fromEntries([...state].map(([feed, item]) => [feed, { ...item }]));
  }

  function describe(raw, now = Date.now()) {
    const feeds = {};
    for (const feed of FEEDS) {
      const item = raw?.[feed];
      if (!item?.lastAttemptAt && !item?.lastSuccessAt) {
        feeds[feed] = { status: 'unknown', stale: false, lastSuccessAt: null, ageMs: null };
        continue;
      }
      // Before the first success, measure from the first attempt so one boot-time
      // failure does not flash a warning.
      const reference = item.lastSuccessAt ?? item.firstAttemptAt ?? item.lastAttemptAt;
      const ageMs = Math.max(0, now - reference);
      const stale = ageMs > staleAfterMs;
      feeds[feed] = {
        status: stale ? 'stale' : 'ok',
        stale,
        lastSuccessAt: item.lastSuccessAt ? new Date(item.lastSuccessAt).toISOString() : null,
        lastAttemptAt: item.lastAttemptAt ? new Date(item.lastAttemptAt).toISOString() : null,
        ageMs: item.lastSuccessAt ? Math.max(0, now - item.lastSuccessAt) : null,
        consecutiveFailures: item.consecutiveFailures || 0,
        lastError: item.lastError || null,
      };
    }
    return {
      stale: Object.values(feeds).some(item => item.stale),
      staleAfterMs,
      checkedAt: new Date(now).toISOString(),
      feeds,
    };
  }

  async function persist() {
    if (!state.size) return;
    try {
      await getRedis().set(REDIS_KEY, JSON.stringify(rawState()), 'EX', REDIS_TTL_SEC);
    } catch { /* Health reporting must never break ingestion. */ }
  }

  /** Local leader state wins; replicas and standby instances read the leader's mirror. */
  async function getHealth(now = Date.now()) {
    if (state.size) return describe(rawState(), now);
    try {
      const raw = await getRedis().get(REDIS_KEY);
      return describe(raw ? JSON.parse(raw) : null, now);
    } catch {
      return describe(null, now);
    }
  }

  function reset() {
    state.clear();
  }

  return { recordSuccess, recordFailure, recordResult, persist, getHealth, describe, rawState, reset };
}

const defaultFeedHealth = createFeedHealth();

module.exports = {
  FEEDS,
  STALE_AFTER_MS,
  createFeedHealth,
  ...defaultFeedHealth,
};
