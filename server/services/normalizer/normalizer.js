/**
 * services/normalizer/normalizer.js
 * Ingestion Normalizer
 * Converts raw source streams from TennisLiveLoad and CREX into the unified schema,
 * writes live state to Redis, publishes updates to Redis Pub/Sub, and stores history in Postgres.
 */

const { getRedisClient } = require('../../shared/redis');
const { createNormalizedMatch, createNormalizedOdds, mergeMatches } = require('../../shared/schema');
const prisma = require('../../db/prisma');

// In-memory caches for fast normalization & merging
let _cricketMatches = [];
let _tossMatches = [];
let _sessionMatches = [];
let _tennisMatches = [];
let _crexOverview = [];

const _cricketSnapshots = new Map();
const _crexDetails = new Map();
const _tossSnapshots = new Map();
const _sessionTrades = new Map();

function cleanTeamName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(women|men|xi|u19|t20|super kings|riders|titans|warriors|lions|stars)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function findMatchingCrex(tllMatch, crexList = _crexOverview) {
  if (!tllMatch || !Array.isArray(crexList)) return null;

  const t1 = cleanTeamName(tllMatch.team1);
  const t2 = cleanTeamName(tllMatch.team2);

  for (const c of crexList) {
    const c1 = cleanTeamName(c.team1Name || c.team1Short);
    const c2 = cleanTeamName(c.team2Name || c.team2Short);

    if (t1 && t2 && c1 && c2) {
      if ((c1.includes(t1) || t1.includes(c1)) && (c2.includes(t2) || t2.includes(c2))) return c;
      if ((c1.includes(t2) || t2.includes(c1)) && (c2.includes(t1) || t1.includes(c2))) return c;
    }
  }
  return null;
}

/**
 * Process incoming raw ingestion job
 */
async function processIngestJob(job) {
  const { source, type, matchId, data } = job.data || {};
  const redis = getRedisClient();

  if (type === 'cricket:matches' && Array.isArray(data)) {
    // 1. Normalize TennisLiveLoad matches and merge with active CREX overview
    const normalized = data.map(m => {
      const norm = createNormalizedMatch({ ...m, source: 'tennisliveload' });
      const matchedCrex = findMatchingCrex(norm, _crexOverview);
      if (matchedCrex) {
        norm.crex = matchedCrex;
        norm.source = 'merged';
      }
      return norm;
    });

    _cricketMatches = normalized;

    // Cache in Redis (60s TTL)
    await redis.set('matches:cricket', JSON.stringify({ matches: normalized }), 'EX', 60);

    // Publish to Pub/Sub channel for O(1) broadcast
    await redis.publish('cricket:matches', JSON.stringify({ matches: normalized }));
  }

  else if (type === 'crex:overview' && Array.isArray(data)) {
    _crexOverview = data;
    await redis.set('crex:overview', JSON.stringify(data), 'EX', 30);
    await redis.publish('crex:overview', JSON.stringify(data));

    // Re-correlate cricket matches with fresh CREX data
    if (_cricketMatches.length > 0) {
      for (const m of _cricketMatches) {
        const found = findMatchingCrex(m, data);
        if (found) {
          m.crex = found;
          m.source = 'merged';
        }
      }
      await redis.set('matches:cricket', JSON.stringify({ matches: _cricketMatches }), 'EX', 60);
      await redis.publish('cricket:matches', JSON.stringify({ matches: _cricketMatches }));
    }
  }

  else if (type === 'toss:matches' && Array.isArray(data)) {
    _tossMatches = data;
    await redis.set('matches:toss', JSON.stringify(data), 'EX', 60);
    await redis.publish('toss:matches', JSON.stringify(data));
  }

  else if (type === 'session:matches') {
    const list = Array.isArray(data) ? data : (data?.matches || []);
    _sessionMatches = list;
    await redis.set('matches:session', JSON.stringify(data), 'EX', 60);
    await redis.publish('session:matches', JSON.stringify(data));
  }

  else if (type === 'tennis:matches' && Array.isArray(data)) {
    _tennisMatches = data;
    await redis.set('matches:tennis', JSON.stringify(data), 'EX', 60);
    await redis.publish('tennis:matches', JSON.stringify(data));
  }

  else if (type === 'toss:snapshot' && matchId && data) {
    const mid = String(matchId);
    _tossSnapshots.set(mid, data);
    await redis.set(`match:${mid}:toss`, JSON.stringify(data), 'EX', 120);
  }

  else if (type === 'session:trades' && matchId && data) {
    const mid = String(matchId);
    _sessionTrades.set(mid, data);
    await redis.set(`match:${mid}:session`, JSON.stringify(data), 'EX', 120);
  }

  else if (type === 'cricket:snapshot' && matchId && data) {
    const mid = String(matchId);
    _cricketSnapshots.set(mid, data);

    // Save live odds key in Redis (Architecture: match:{id}:odds keys with short TTL)
    if (data.runners || data.teams) {
      const odds = createNormalizedOdds(mid, data);
      await redis.set(`match:${mid}:odds`, JSON.stringify(odds), 'EX', 30);
      await redis.publish(`match:odds:${mid}`, JSON.stringify(odds));
    }

    // Build unified match bundle
    const bundle = {
      matchId: mid,
      cricket: data,
      toss: _tossSnapshots.get(mid) || null,
      session: _sessionTrades.get(mid) || null,
      crex: _crexDetails.get(mid) || null,
      updatedAt: Date.now(),
    };

    // Store in Redis (120s TTL)
    await redis.set(`match:${mid}:bundle`, JSON.stringify(bundle), 'EX', 120);

    // Publish to specific match channel & bundle channel
    await redis.publish(`match:bundle:${mid}`, JSON.stringify(bundle));
    await redis.publish('match:bundle', JSON.stringify(bundle));
  }

  else if (type === 'crex:detail' && matchId && data) {
    const mid = String(matchId);
    _crexDetails.set(mid, data);
    await redis.set(`match:${mid}:crex`, JSON.stringify(data), 'EX', 60);
    await redis.publish(`match:crex:${mid}`, JSON.stringify(data));
  }
}

// In-memory accessors for zero-latency local fallback
function getCricketMatches() {
  return _cricketMatches;
}

function getTossMatches() {
  return _tossMatches;
}

function getSessionMatches() {
  return _sessionMatches;
}

function getTennisMatches() {
  return _tennisMatches;
}

function getCrexOverview() {
  return _crexOverview;
}

function getMatchBundle(matchId) {
  const mid = String(matchId);
  return {
    matchId: mid,
    cricket: _cricketSnapshots.get(mid) || null,
    toss: _tossSnapshots.get(mid) || null,
    session: _sessionTrades.get(mid) || null,
    crex: _crexDetails.get(mid) || null,
    updatedAt: Date.now(),
  };
}

module.exports = {
  processIngestJob,
  getCricketMatches,
  getTossMatches,
  getSessionMatches,
  getTennisMatches,
  getCrexOverview,
  getMatchBundle,
};
