/**
 * services/normalizer/normalizer.js
 * Ingestion Normalizer
 * Converts raw source streams from TennisLiveLoad and CREX into the unified schema,
 * writes live state to Redis, publishes updates to Redis Pub/Sub, and stores history in MariaDB.
 */

const { getRedisClient } = require('../../shared/redis');
const { createNormalizedMatch, createNormalizedOdds, mergeMatches } = require('../../shared/schema');
const crexService = require('../crexService');
const prisma = require('../../db/prisma');
const crypto = require('crypto');
const { compactSessionPayload } = require('../../utils/sessionPayload');

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
const _sessionTradeFingerprints = new Map();
let _crexOverviewFingerprint = '';
let _sessionMatchesFingerprint = '';

function fingerprint(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('base64');
}

function buildCrexField(cm) {
  if (!cm) return null;
  return {
    matched: true,
    isReversed: Boolean(cm.isReversed),
    crexMatchId: cm.crexMatchId,
    slug: cm.slug,
    url: cm.url,
    team1Name: cm.team1Name,
    team1Short: cm.team1Short,
    team1Flag: cm.team1Flag,
    team2Name: cm.team2Name,
    team2Short: cm.team2Short,
    team2Flag: cm.team2Flag,
    score1: cm.score1 || null,
    score2: cm.score2 || null,
    status: cm.status,
    statusText: cm.statusText || '',
    venue: cm.venue,
    odds: cm.odds || null,
    runningBall: cm.runningBall || null,
  };
}

/**
 * Process incoming raw ingestion job
 */
async function processIngestJob(job) {
  const { source, type, matchId, data, notifySubscribers = false } = job.data || {};
  const redis = getRedisClient();

  if (type === 'cricket:matches' && Array.isArray(data)) {
    // 1. Normalize TennisLiveLoad matches and merge with active CREX overview
    const normalized = data.map(m => {
      const norm = createNormalizedMatch({ ...m, source: 'tennisliveload' });
      const cm = crexService.findCrexMatch(norm.matchName, _crexOverview, {
        startTime: norm.startTime,
        status: norm.status,
        inPlay: norm.inPlay,
      });
      if (cm) {
        norm.crex = buildCrexField(cm);
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
    const nextOverviewFingerprint = fingerprint(data);
    const overviewChanged = nextOverviewFingerprint !== _crexOverviewFingerprint;
    _crexOverview = data;
    if (!overviewChanged) return;
    _crexOverviewFingerprint = nextOverviewFingerprint;

    await redis.set('crex:overview', JSON.stringify(data), 'EX', 30);
    await redis.publish('crex:overview', JSON.stringify(data));

    // Re-correlate cricket matches with fresh CREX data
    if (_cricketMatches.length > 0) {
      let updated = false;
      for (const m of _cricketMatches) {
        const cm = crexService.findCrexMatch(m.matchName, data, {
          startTime: m.startTime,
          status: m.status,
          inPlay: m.inPlay,
        });
        if (cm) {
          const nextCrex = buildCrexField(cm);
          if (fingerprint(m.crex) === fingerprint(nextCrex)) continue;
          m.crex = nextCrex;
          m.source = 'merged';
          updated = true;
        }
      }
      if (updated) {
        await redis.set('matches:cricket', JSON.stringify({ matches: _cricketMatches }), 'EX', 60);
        await redis.publish('cricket:matches', JSON.stringify({ matches: _cricketMatches }));
      }
    }
  }

  else if (type === 'toss:matches' && Array.isArray(data)) {
    _tossMatches = data;
    await redis.set('matches:toss', JSON.stringify(data), 'EX', 60);
    await redis.publish('toss:matches', JSON.stringify(data));
  }

  else if (type === 'session:matches') {
    const list = Array.isArray(data) ? data : (data?.matches || []);
    const nextFingerprint = fingerprint(list);
    if (_sessionMatchesFingerprint === nextFingerprint) {
      await redis.expire('matches:session', 60);
      return;
    }
    _sessionMatchesFingerprint = nextFingerprint;
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

    const bundle = getMatchBundle(mid);
    await redis.set(`match:${mid}:bundle`, JSON.stringify(bundle), 'EX', 120);
    await redis.publish(`match:bundle:${mid}`, JSON.stringify(bundle));
    await redis.publish('match:bundle', JSON.stringify({ matchId: mid }));
  }

  else if (type === 'session:trades' && matchId && data) {
    const mid = String(matchId);
    const compactData = compactSessionPayload(data);
    const nextFingerprint = fingerprint(compactData);
    if (_sessionTradeFingerprints.get(mid) === nextFingerprint) return;
    _sessionTradeFingerprints.set(mid, nextFingerprint);
    _sessionTrades.set(mid, compactData);
    await redis.set(`match:${mid}:session`, JSON.stringify(compactData), 'EX', 120);

    if (notifySubscribers) {
      const bundle = getMatchBundle(mid);
      await redis.set(`match:${mid}:bundle`, JSON.stringify(bundle), 'EX', 120);
      await redis.publish(`match:bundle:${mid}`, JSON.stringify(bundle));
      await redis.publish('match:bundle', JSON.stringify({ matchId: mid }));
    }
    await redis.publish('session:matches', JSON.stringify({ matches: _sessionMatches }));
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
    await redis.publish('match:bundle', JSON.stringify({ matchId: mid }));
    await redis.publish('cricket:matches', JSON.stringify({ matchId: mid }));
  }

  else if (type === 'crex:detail' && data) {
    const detail = data;
    const cid = String(job.data?.crexMatchId || detail.crexMatchId || '');
    const slug = String(job.data?.slug || detail.slug || '');
    const directMatchId = String(matchId || '');
    const detailFingerprint = fingerprint(detail);
    const previousCidDetail = cid ? _crexDetails.get(cid) : null;
    const previousSlugDetail = slug ? _crexDetails.get(slug) : null;

    if (cid) _crexDetails.set(cid, detail);
    if (slug) _crexDetails.set(slug, detail);

    // Correlate with any active cricket matches
    let matchedDetailChanged = false;
    for (const m of _cricketMatches) {
      const mCid = String(m.crex?.crexMatchId || '');
      const mSlug = String(m.crex?.slug || '');
      const currentMatchId = String(m.id || m.matchId || '');
      if ((directMatchId && currentMatchId === directMatchId) ||
          (cid && mCid === cid) ||
          (slug && mSlug === slug) ||
          (slug && mSlug && (mSlug.includes(slug) || slug.includes(mSlug)))) {
        const mid = String(m.id || m.matchId);
        const previousDetail = mid === cid
          ? previousCidDetail
          : (mid === slug ? previousSlugDetail : _crexDetails.get(mid));
        const detailChanged = !previousDetail || fingerprint(previousDetail) !== detailFingerprint;
        _crexDetails.set(mid, detail);

        if (detail.scorecard) {
          if (!m.crex) m.crex = {};
          m.crex.scorecard = detail.scorecard;
          m.crex.score1 = detail.scorecard.team1?.score || m.crex.score1;
          m.crex.score2 = detail.scorecard.team2?.score || m.crex.score2;
          m.crex.statusText = detail.scorecard.statusEquation || detail.scorecard.matchResult || m.crex.statusText;
          m.crex.runningBall = detail.scorecard.runningBall || detail.runningBall || m.crex.runningBall;
        }

        if (!detailChanged) continue;
        matchedDetailChanged = true;

        const serializedDetail = JSON.stringify(detail);
        await redis.set(`match:${mid}:crex`, serializedDetail, 'EX', 60);
        await redis.publish(`match:crex:${mid}`, serializedDetail);

        const bundle = getMatchBundle(mid);
        await redis.set(`match:${mid}:bundle`, JSON.stringify(bundle), 'EX', 120);
        await redis.publish(`match:bundle:${mid}`, JSON.stringify(bundle));
        await redis.publish('match:bundle', JSON.stringify({ matchId: mid }));
      }
    }

    // Re-broadcast updated cricket matches list so home screen cards get fresh scores
    if (matchedDetailChanged && _cricketMatches.length > 0) {
      await redis.set('matches:cricket', JSON.stringify({ matches: _cricketMatches }), 'EX', 60);
      await redis.publish('cricket:matches', JSON.stringify({ matches: _cricketMatches }));
    }
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
  let crex = _crexDetails.get(mid) || null;
  if (!crex) {
    const m = _cricketMatches.find(x => String(x.id || x.matchId) === mid);
    if (m?.crex) {
      const detailed = (m.crex.crexMatchId && _crexDetails.get(m.crex.crexMatchId))
        || (m.crex.slug && _crexDetails.get(m.crex.slug));
      // Merge detail scorecard into overview crex if detail found
      if (detailed) {
        crex = {
          ...m.crex,
          ...detailed,
          score1: detailed.scorecard?.team1?.score || detailed.score1 || m.crex.score1,
          score2: detailed.scorecard?.team2?.score || detailed.score2 || m.crex.score2,
          statusText: detailed.scorecard?.statusEquation || detailed.scorecard?.matchResult || detailed.statusText || m.crex.statusText,
          runningBall: detailed.scorecard?.runningBall || detailed.runningBall || m.crex.runningBall,
        };
      } else {
        crex = m.crex;
      }
    }
  }
  return {
    matchId: mid,
    cricket: _cricketSnapshots.get(mid) || null,
    toss: _tossSnapshots.get(mid) || null,
    session: _sessionTrades.get(mid) || null,
    crex: crex,
    updatedAt: Date.now(),
  };
}

function setCrexDetail(key, detail) {
  if (key && detail) {
    _crexDetails.set(String(key), detail);
  }
}

module.exports = {
  processIngestJob,
  getCricketMatches,
  getTossMatches,
  getSessionMatches,
  getTennisMatches,
  getCrexOverview,
  getMatchBundle,
  setCrexDetail,
};
