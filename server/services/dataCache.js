/**
 * dataCache.js — Centralized Background Data Cache
 *
 * Architecture:
 *   ONE background poller → fetches ALL upstream data every 3s → stores in memory
 *   ALL user requests     → read from this memory cache (0ms, zero upstream calls)
 *
 * Replaces per-request caching. scraper.js handles raw HTTP + cookie + 401 retry.
 */

const scraper = require('./scraper');
const crexService = require('./crexService');

const TENNIS_POLL_INTERVAL_MS = parseInt(process.env.DATA_POLL_INTERVAL_MS, 10) || 5000;
const CREX_POLL_INTERVAL_MS = parseInt(process.env.CREX_POLL_INTERVAL_MS, 10) || 3000;

// ──── In-memory cache ────
let _cricketMatches = [];
let _tossMatches = [];
let _sessionMatches = [];
let _tennisMatches = [];

const _cricketSnapshots = new Map();   // matchId → snapshot
const _tossSnapshots = new Map();      // matchId → snapshot
const _sessionTrades = new Map();      // matchId → trades
const _tennisSnapshots = new Map();    // matchId → snapshot
const _liveOdds = new Map();           // matchId → odds

// CREX cache
let _crexOverview = [];
const _crexDetails = new Map();        // matchId → detail

let _lastUpdatedAt = null;
let _tennisPollTimer = null;
let _crexPollTimer = null;
let _tennisRunning = false;
let _crexRunning = false;
let _tennisPollCount = 0;
let _crexPollCount = 0;

// ──── Ended-match detection ────
function _isEnded(match) {
  if (!match || !match.status) return false;
  const s = (match.status || '').toLowerCase();
  return s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed';
}

// ──── Tennisliveload Background Poll Cycle (every 5s) ────
async function _tennisliveloadPollCycle() {
  if (_tennisRunning) return;
  _tennisRunning = true;
  const cycleStart = Date.now();

  try {
    // 1. Fetch all match lists in parallel
    const [cricket, toss, session, tennis] = await Promise.all([
      scraper.fetchCricketMatches().catch(err => ({ error: err.message })),
      scraper.fetchTossMatches().catch(err => ({ error: err.message })),
      scraper.fetchSessionMatches().catch(err => ({ error: err.message })),
      scraper.fetchTennisMatches().catch(err => ({ error: err.message })),
    ]);

    // Store lists (keep old if upstream returned error)
    if (Array.isArray(cricket)) _cricketMatches = cricket;
    else if (cricket && !cricket.error) _cricketMatches = cricket;

    if (Array.isArray(toss)) _tossMatches = toss;
    else if (toss && !toss.error) _tossMatches = toss;

    if (Array.isArray(session)) _sessionMatches = session;
    else if (session && !session.error) _sessionMatches = Array.isArray(session.matches) ? session.matches : session;
    else console.warn('[dataCache] session fetch failed:', JSON.stringify(session)?.slice(0, 200));

    if (Array.isArray(tennis)) _tennisMatches = tennis;
    else if (tennis && !tennis.error) _tennisMatches = tennis;

    // 2. Collect all active matchIds for snapshot fetching
    const cricketActive = (Array.isArray(_cricketMatches) ? _cricketMatches : [])
      .filter(m => !_isEnded(m));
    const tossActive = (Array.isArray(_tossMatches) ? _tossMatches : [])
      .filter(m => !_isEnded(m));
    const sessionActive = (Array.isArray(_sessionMatches) ? _sessionMatches : [])
      .filter(m => !_isEnded(m));
    const tennisActive = (Array.isArray(_tennisMatches) ? _tennisMatches : [])
      .filter(m => !_isEnded(m));

    // Also fetch snapshots for recently ended matches (to get final state)
    const cricketEnded = (Array.isArray(_cricketMatches) ? _cricketMatches : [])
      .filter(m => _isEnded(m) && !_cricketSnapshots.has(String(m.matchId)));
    const tossEnded = (Array.isArray(_tossMatches) ? _tossMatches : [])
      .filter(m => _isEnded(m) && !_tossSnapshots.has(String(m.matchId)));

    // 3. Fetch ALL snapshots in parallel (Option A — fastest)
    const snapshotPromises = [];

    for (const m of cricketActive) {
      const mid = String(m.matchId);
      snapshotPromises.push(
        scraper.fetchCricketSnapshot(m.matchId)
          .then(data => { if (data && !data.error) _cricketSnapshots.set(mid, data); })
          .catch(() => {})
      );
      snapshotPromises.push(
        scraper.fetchLiveOdds(m.matchId)
          .then(data => { if (data && !data.error) _liveOdds.set(mid, data); })
          .catch(() => {})
      );
    }

    for (const m of cricketEnded) {
      const mid = String(m.matchId);
      snapshotPromises.push(
        scraper.fetchCricketSnapshot(m.matchId)
          .then(data => { if (data && !data.error) _cricketSnapshots.set(mid, data); })
          .catch(() => {})
      );
    }

    for (const m of tossActive) {
      const mid = String(m.matchId);
      snapshotPromises.push(
        scraper.fetchTossSnapshot(m.matchId)
          .then(data => { if (data && !data.error) _tossSnapshots.set(mid, data); })
          .catch(() => {})
      );
    }
    for (const m of tossEnded) {
      const mid = String(m.matchId);
      snapshotPromises.push(
        scraper.fetchTossSnapshot(m.matchId)
          .then(data => { if (data && !data.error) _tossSnapshots.set(mid, data); })
          .catch(() => {})
      );
    }

    for (const m of sessionActive) {
      const mid = String(m.matchId);
      snapshotPromises.push(
        scraper.fetchSessionTrades(m.matchId)
          .then(data => { if (data && !data.error) _sessionTrades.set(mid, data); })
          .catch(() => {})
      );
    }

    for (const m of tennisActive) {
      const mid = String(m.matchId);
      snapshotPromises.push(
        scraper.fetchTennisSnapshot(m.matchId)
          .then(data => { if (data && !data.error) _tennisSnapshots.set(mid, data); })
          .catch(() => {})
      );
    }

    await Promise.all(snapshotPromises);

    // Clean up expired negative cache entries
    const now = Date.now();
    for (const [key, expiresAt] of _notFoundCache.entries()) {
      if (now >= expiresAt) _notFoundCache.delete(key);
    }

    _lastUpdatedAt = new Date();
    _tennisPollCount++;

    if (_tennisPollCount === 1 || _tennisPollCount % 50 === 0) {
      const elapsed = Date.now() - cycleStart;
      const active = cricketActive.length + tossActive.length + sessionActive.length + tennisActive.length;
      console.log(`📡 dataCache (tennisliveload #${_tennisPollCount}): ${active} active matches, ${elapsed}ms`);
    }

    // Broadcast updated matches and active match rooms over WebSocket
    try {
      const socketService = require('./socketService');
      socketService.broadcastAllMatches();
    } catch (e) {}
  } catch (err) {
    console.error('❌ dataCache tennisliveload poll error:', err.message);
  } finally {
    _tennisRunning = false;
  }
}

// ──── CREX Background Poll Cycle ────
async function _crexPollCycle() {
  if (_crexRunning) return;
  _crexRunning = true;

  try {
    const overview = await crexService.getCrexOverview().catch(() => null);
    if (Array.isArray(overview) && overview.length > 0) {
      _crexOverview = overview;

      // Match with active cricket matches to fetch scorecards / ball commentary
      const cricketActive = (Array.isArray(_cricketMatches) ? _cricketMatches : [])
        .filter(m => !_isEnded(m));

      if (cricketActive.length > 0) {
        const crexDetailPromises = [];
        for (const m of cricketActive) {
          const cm = crexService.findCrexMatch(m.matchName, _crexOverview, {
            startTime: m.startTime || m.openDate || m.marketStartTime,
            status: m.status,
            inPlay: m.inPlay,
          });
          if (cm && (cm.slug || cm.url)) {
            crexDetailPromises.push(
              crexService.getCrexMatchDetail(cm.slug || cm.url)
                .then(detail => {
                  if (detail) {
                    _crexDetails.set(String(m.matchId), { ...cm, ...detail, isReversed: Boolean(cm.isReversed) });
                  }
                })
                .catch(() => {})
            );
          }
        }
        if (crexDetailPromises.length > 0) {
          await Promise.all(crexDetailPromises);
        }
      }
    }
    _crexPollCount++;

    // Broadcast CREX score updates & active match details over WebSocket
    try {
      const socketService = require('./socketService');
      socketService.broadcastCrexUpdates();
    } catch (e) {}
  } catch (err) {
    console.error('❌ dataCache CREX poll error:', err.message);
  } finally {
    _crexRunning = false;
  }
}

// ──── Start / Stop ────
function start() {
  if (_tennisPollTimer || _crexPollTimer) return;
  console.log(`📡 dataCache: starting tennisliveload poller (every ${TENNIS_POLL_INTERVAL_MS}ms)`);
  console.log(`🏏 dataCache: starting CREX poller (every ${CREX_POLL_INTERVAL_MS}ms)`);

  _tennisliveloadPollCycle();
  _tennisPollTimer = setInterval(_tennisliveloadPollCycle, TENNIS_POLL_INTERVAL_MS);

  _crexPollCycle();
  _crexPollTimer = setInterval(_crexPollCycle, CREX_POLL_INTERVAL_MS);
}

function stop() {
  if (_tennisPollTimer) {
    clearInterval(_tennisPollTimer);
    _tennisPollTimer = null;
  }
  if (_crexPollTimer) {
    clearInterval(_crexPollTimer);
    _crexPollTimer = null;
  }
  console.log('📡 dataCache: background pollers stopped');
}

// ──── Public Read API (synchronous cache + async fallback) ────

function _asSafeList(list) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.catch) {
    Object.defineProperty(arr, 'catch', {
      value: function() { return Promise.resolve(this); },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  return arr;
}

function getCricketMatches() {
  return _asSafeList(_cricketMatches);
}

function getTossMatches() {
  return _asSafeList(_tossMatches);
}

function getSessionMatches() {
  return _asSafeList(_sessionMatches);
}

function getTennisMatches() {
  return _asSafeList(_tennisMatches);
}

const _notFoundCache = new Map();     // 'type:mid' -> expiresAt

async function getCricketSnapshot(matchId) {
  const mid = String(matchId);
  const cached = _cricketSnapshots.get(mid);
  if (cached) return cached;
  const nfKey = `cricket:${mid}`;
  const nfUntil = _notFoundCache.get(nfKey);
  if (nfUntil && Date.now() < nfUntil) {
    return { error: 'No cricket snapshot available for this match', upstreamStatus: 404, notFound: true };
  }
  try {
    const fresh = await scraper.fetchCricketSnapshot(matchId);
    if (fresh && !fresh.error) {
      _cricketSnapshots.set(mid, fresh);
      _notFoundCache.delete(nfKey);
    } else if (fresh?.upstreamStatus === 404 || fresh?.error) {
      _notFoundCache.set(nfKey, Date.now() + 30000);
    }
    return fresh;
  } catch (err) {
    return { error: err.message };
  }
}

async function getTossSnapshot(matchId) {
  const mid = String(matchId);
  const cached = _tossSnapshots.get(mid);
  if (cached) return cached;
  const nfKey = `toss:${mid}`;
  const nfUntil = _notFoundCache.get(nfKey);
  if (nfUntil && Date.now() < nfUntil) {
    return { error: 'No toss data available for this match', upstreamStatus: 404, notFound: true };
  }
  try {
    const fresh = await scraper.fetchTossSnapshot(matchId);
    if (fresh && !fresh.error) {
      _tossSnapshots.set(mid, fresh);
      _notFoundCache.delete(nfKey);
    } else if (fresh?.upstreamStatus === 404 || fresh?.error) {
      _notFoundCache.set(nfKey, Date.now() + 30000);
    }
    return fresh;
  } catch (err) {
    return { error: err.message };
  }
}

async function getSessionTrades(matchId) {
  const mid = String(matchId);
  const cached = _sessionTrades.get(mid);
  if (cached) return cached;
  const nfKey = `session:${mid}`;
  const nfUntil = _notFoundCache.get(nfKey);
  if (nfUntil && Date.now() < nfUntil) {
    return { error: 'No session trades available for this match', upstreamStatus: 404, notFound: true };
  }
  try {
    const fresh = await scraper.fetchSessionTrades(matchId);
    if (fresh && !fresh.error) {
      _sessionTrades.set(mid, fresh);
      _notFoundCache.delete(nfKey);
    } else if (fresh?.upstreamStatus === 404 || fresh?.error) {
      _notFoundCache.set(nfKey, Date.now() + 30000);
    }
    return fresh;
  } catch (err) {
    return { error: err.message };
  }
}

async function getTennisSnapshot(matchId) {
  const mid = String(matchId);
  const cached = _tennisSnapshots.get(mid);
  if (cached) return cached;
  const nfKey = `tennis:${mid}`;
  const nfUntil = _notFoundCache.get(nfKey);
  if (nfUntil && Date.now() < nfUntil) {
    return { error: 'No tennis snapshot available for this match', upstreamStatus: 404, notFound: true };
  }
  try {
    const fresh = await scraper.fetchTennisSnapshot(matchId);
    if (fresh && !fresh.error) {
      _tennisSnapshots.set(mid, fresh);
      _notFoundCache.delete(nfKey);
    } else if (fresh?.upstreamStatus === 404 || fresh?.error) {
      _notFoundCache.set(nfKey, Date.now() + 30000);
    }
    return fresh;
  } catch (err) {
    return { error: err.message };
  }
}

async function getLiveOdds(matchId) {
  const mid = String(matchId);
  const cached = _liveOdds.get(mid);
  if (cached) return cached;
  const nfKey = `odds:${mid}`;
  const nfUntil = _notFoundCache.get(nfKey);
  if (nfUntil && Date.now() < nfUntil) {
    return { error: 'No live odds available for this match', upstreamStatus: 404, notFound: true };
  }
  try {
    const fresh = await scraper.fetchLiveOdds(matchId);
    if (fresh && !fresh.error) {
      _liveOdds.set(mid, fresh);
      _notFoundCache.delete(nfKey);
    } else if (fresh?.upstreamStatus === 404 || fresh?.error) {
      _notFoundCache.set(nfKey, Date.now() + 30000);
    }
    return fresh;
  } catch (err) {
    return { error: err.message };
  }
}

function getCrexOverview() {
  return _crexOverview;
}

function getCrexDetail(matchId) {
  return _crexDetails.get(String(matchId)) || null;
}

function getLastUpdatedAt() {
  return _lastUpdatedAt;
}

function isWarmedUp() {
  return _tennisPollCount > 0 || _crexPollCount > 0;
}

async function getCricketFullData(includeSnapshots = true) {
  const matches = getCricketMatches();
  const result = {
    total_matches: Array.isArray(matches) ? matches.length : 0,
    scraped_at: new Date().toISOString(),
    matches: [],
  };
  if (!Array.isArray(matches)) return result;
  for (const match of matches) {
    const matchData = { match_info: match };
    if (includeSnapshots) {
      const snapshot = await getCricketSnapshot(match.matchId);
      if (snapshot && !snapshot.error) matchData.snapshot = snapshot;
      else if (snapshot?.error) matchData.snapshot_error = snapshot.error;
    }
    result.matches.push(matchData);
  }
  return result;
}

module.exports = {
  start,
  stop,
  getCricketMatches,
  getTossMatches,
  getSessionMatches,
  getTennisMatches,
  getCricketSnapshot,
  getTossSnapshot,
  getSessionTrades,
  getTennisSnapshot,
  getLiveOdds,
  getCrexOverview,
  getCrexDetail,
  getCricketFullData,
  getLastUpdatedAt,
  isWarmedUp,
};
