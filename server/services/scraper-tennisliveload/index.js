/**
 * services/scraper-tennisliveload/index.js
 * TennisLiveLoad Singleton Ingestion Worker
 *
 * Runs on a dedicated interval (~3000ms - 5000ms).
 * Strictly guards execution with Redis singleton lock to prevent multi-device bans.
 * Emits raw ingestion payloads into the Normalizer Queue.
 */

const TennisLiveLoadAdapter = require('./adapter');
const session = require('./session');
const { getIngestQueue } = require('../normalizer/queue');
const { compactSessionPayload } = require('../../utils/sessionPayload');

const adapter = new TennisLiveLoadAdapter();
let _pollInterval = parseInt(process.env.TLL_POLL_INTERVAL_MS, 10) || 10000;
let _timer = null;
let _isRunning = false;
const _sessionDetailLastAttempt = new Map();
const _upcomingSnapshotLastAttempt = new Map();
const UPCOMING_SNAPSHOT_REFRESH_MS = parseInt(process.env.TLL_UPCOMING_SNAPSHOT_REFRESH_MS, 10) || 3 * 60 * 1000;
const SESSION_SUBSCRIBED_REFRESH_MS = parseInt(process.env.TLL_SESSION_SUBSCRIBED_REFRESH_MS, 10) || 30 * 1000;
const SESSION_LIVE_IDLE_REFRESH_MS = parseInt(process.env.TLL_SESSION_LIVE_IDLE_REFRESH_MS, 10) || 5 * 60 * 1000;
const SESSION_UPCOMING_REFRESH_MS = parseInt(process.env.TLL_SESSION_UPCOMING_REFRESH_MS, 10) || 30 * 60 * 1000;
const SESSION_ENDED_REFRESH_MS = parseInt(process.env.TLL_SESSION_ENDED_REFRESH_MS, 10) || 24 * 60 * 60 * 1000;
const SESSION_BACKGROUND_PER_CYCLE = parseInt(process.env.TLL_SESSION_BACKGROUND_PER_CYCLE, 10) || 2;

function isEndedMatch(match) {
  const status = String(match?.status || '').toLowerCase();
  return ['ended', 'completed', 'closed', 'verified', 'pending'].includes(status);
}

function isLiveMatch(match) {
  const status = String(match?.status || '').toLowerCase();
  return !isEndedMatch(match) && Boolean(match?.inPlay || status === 'live' || status === 'in-play');
}

function mergeLiveOdds(snapshot, liveOdds) {
  if (!snapshot || !Array.isArray(liveOdds?.runners) || !liveOdds.runners.length) return snapshot;
  const existing = Array.isArray(snapshot.runners) ? snapshot.runners : [];
  const normalizeName = value => String(value || '').trim().toLowerCase();
  const merged = liveOdds.runners.map(next => {
    const nextName = normalizeName(next.runnerName || next.name);
    const previous = existing.find(item => normalizeName(item.runnerName || item.name) === nextName);
    return { ...(previous || {}), ...next };
  });
  const liveNames = new Set(merged.map(item => normalizeName(item.runnerName || item.name)));
  for (const item of existing) {
    if (!liveNames.has(normalizeName(item.runnerName || item.name))) merged.push(item);
  }
  return { ...snapshot, runners: merged, liveOddsUpdatedAt: liveOdds.updatedAt || Date.now() };
}

async function refreshSessionDetails(sessionMatches, subscribedMatchIds, queue) {
  const now = Date.now();
  const list = Array.isArray(sessionMatches) ? sessionMatches : [];
  const liveTargets = [];
  const backgroundTargets = [];

  for (const match of list) {
    const matchId = String(match?.matchId || match?.id || '');
    if (!matchId) continue;

    const lastAttempt = _sessionDetailLastAttempt.get(matchId) || 0;
    const subscribed = subscribedMatchIds.has(matchId);
    const live = isLiveMatch(match);
    const refreshMs = subscribed
      ? Math.max(SESSION_SUBSCRIBED_REFRESH_MS, _pollInterval)
      : live
        ? SESSION_LIVE_IDLE_REFRESH_MS
        : (isEndedMatch(match) ? SESSION_ENDED_REFRESH_MS : SESSION_UPCOMING_REFRESH_MS);

    if (now - lastAttempt < refreshMs) continue;
    const target = { matchId, match, lastAttempt, refreshMs };
    if (live || subscribed) liveTargets.push(target);
    else backgroundTargets.push(target);
  }

  // Warm upcoming/completed cards gradually so list polling never creates a request spike.
  backgroundTargets.sort((a, b) => {
    // Completed matches have final matched money, so fill those once first.
    const tierA = isEndedMatch(a.match) ? 1 : 2;
    const tierB = isEndedMatch(b.match) ? 1 : 2;
    return tierA - tierB || a.lastAttempt - b.lastAttempt;
  });
  const targets = [...liveTargets, ...backgroundTargets.slice(0, SESSION_BACKGROUND_PER_CYCLE)];

  const batchSize = 5;
  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    await Promise.all(batch.map(async ({ matchId, refreshMs }) => {
      _sessionDetailLastAttempt.set(matchId, Date.now());
      try {
        const trades = await adapter.getSessionTrades(matchId);
        if (trades && !trades.error) {
          const notifySubscribers = subscribedMatchIds.has(matchId);
          await queue.add('ingest', {
            source: 'tll',
            type: 'session:trades',
            matchId,
            data: compactSessionPayload(trades),
            notifySubscribers,
          });
        } else {
          _sessionDetailLastAttempt.set(matchId, Date.now() - refreshMs + 30 * 1000);
        }
      } catch {
        _sessionDetailLastAttempt.set(matchId, Date.now() - refreshMs + 30 * 1000);
      }
    }));
  }
}

async function runPollCycle() {
  if (_isRunning) return;
  // If not lock holder, don't execute upstream calls
  if (!session.isSingletonLeader()) return;

  _isRunning = true;
  try {
    const queue = getIngestQueue();

    // 1. Fetch raw matches lists in parallel
    const [cricket, toss, sessionMatches] = await Promise.all([
      adapter.getMatches().catch(err => ({ error: err.message })),
      adapter.getTossMatches().catch(err => ({ error: err.message })),
      adapter.getSessionMatches().catch(err => ({ error: err.message })),
    ]);

    // Push raw list ingest jobs to Normalizer
    if (Array.isArray(cricket) && cricket.length) {
      await queue.add('ingest', { source: 'tll', type: 'cricket:matches', data: cricket });
    }
    if (Array.isArray(toss) && toss.length) {
      await queue.add('ingest', { source: 'tll', type: 'toss:matches', data: toss });
    }
    if (sessionMatches && !sessionMatches.error) {
      await queue.add('ingest', { source: 'tll', type: 'session:matches', data: sessionMatches });
    }
    // 2. Fetch snapshots for active matches (both live and upcoming) + subscribed matches
    let subscribedMatchIds = new Set();
    try {
      const socketService = require('../socketService');
      if (typeof socketService.getActiveSubscribedMatchIds === 'function') {
        subscribedMatchIds = new Set(socketService.getActiveSubscribedMatchIds());
      }
    } catch {}

    const activeCricket = (Array.isArray(cricket) ? cricket : [])
      .filter(m => !isEndedMatch(m) || subscribedMatchIds.has(String(m.id || m.matchId)));

    for (const subMid of subscribedMatchIds) {
      if (!activeCricket.some(m => String(m.id || m.matchId) === String(subMid))) {
        activeCricket.push({ id: subMid, matchId: subMid });
      }
    }

    // Process in batches of 5 to avoid upstream rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < activeCricket.length; i += BATCH_SIZE) {
      const batch = activeCricket.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (m) => {
        const mid = m.id || m.matchId;
        const isLiveOrSub = m.inPlay || m.status === 'live' || m.status === 'in-play' || subscribedMatchIds.has(String(mid));

        const now = Date.now();
        const lastSnapshotFetch = _upcomingSnapshotLastAttempt.get(String(mid)) || 0;
        if (!isLiveOrSub && (now - lastSnapshotFetch < UPCOMING_SNAPSHOT_REFRESH_MS)) {
          return;
        }
        _upcomingSnapshotLastAttempt.set(String(mid), now);

        try {
          const [rawSnapshot, liveOdds] = await Promise.all([
            adapter.getSnapshot(mid),
            isLiveOrSub ? adapter.getOdds(mid).catch(() => null) : Promise.resolve(null),
          ]);
          const snapshot = mergeLiveOdds(rawSnapshot, liveOdds);
          if (snapshot && !snapshot.error) {
            await queue.add('ingest', {
              source: 'tll',
              type: 'cricket:snapshot',
              matchId: mid,
              data: snapshot,
            }).catch(() => {});
          }
        } catch {}

        if (isLiveOrSub) {
          adapter.getTossSnapshot(mid)
            .then(tossSnap => {
              if (tossSnap && !tossSnap.error) {
                queue.add('ingest', {
                  source: 'tll',
                  type: 'toss:snapshot',
                  matchId: mid,
                  data: tossSnap,
                }).catch(() => {});
              }
            })
            .catch(() => {});
        }
      }));
    }

    await refreshSessionDetails(sessionMatches, subscribedMatchIds, queue);
  } catch (err) {
    console.error('❌ [TLL-Worker] poll cycle error:', err.message);
  } finally {
    _isRunning = false;
  }
}

function getEffectivePollInterval() {
  try {
    const socketService = require('../socketService');
    const clientsCount = socketService.getConnectedClientsCount?.() || 0;
    if (clientsCount === 0) {
      // Idle sleep mode: Nobody is looking at the site! (save 80% bandwidth)
      return 60000;
    }
    const subscribedMatchIds = socketService.getActiveSubscribedMatchIds?.() || [];
    if (subscribedMatchIds.length > 0) {
      return _pollInterval;
    }
    const dataCache = require('../dataCache');
    const cricket = dataCache.getCricketMatches();
    const hasLive = Array.isArray(cricket) && cricket.some(m => m.inPlay || m.status === 'live' || m.status === 'in-play');
    if (!hasLive) {
      // Quiet period: Visitors online, but all matches are upcoming/ended
      return 30000;
    }
    return _pollInterval;
  } catch {
    return _pollInterval;
  }
}

let _stopped = true;

async function pollTick() {
  if (_stopped) return;
  await runPollCycle().catch(() => {});
  if (_stopped) return;
  const nextInterval = getEffectivePollInterval();
  _timer = setTimeout(pollTick, nextInterval);
  _timer.unref?.();
}

function wakeUp() {
  if (_stopped) return;
  if (_timer) clearTimeout(_timer);
  pollTick().catch(() => {});
}

async function start() {
  console.log('🚀 [TLL-Worker] starting TennisLiveLoad ingestion service...');
  _stopped = false;
  await session.loadSavedSession();

  // Try to acquire singleton lock (wait up to 30s during deploy handoff)
  const isLeader = await session.acquireSingletonLock(30000);
  if (!isLeader) {
    console.warn('⏸️  [TLL-Worker] running in standby mode (waiting for lock)...');
  }

  // Start adaptive polling loop
  if (_timer) clearTimeout(_timer);
  pollTick().catch(() => {});
}

function stop() {
  _stopped = true;
  if (_timer) clearTimeout(_timer);
  _timer = null;
  console.log('⏹️  [TLL-Worker] stopped.');
}

if (require.main === module) {
  require('dotenv').config();
  start().catch(console.error);
}

const _pendingDirectFetches = new Set();
const _pendingDirectSessionFetches = new Set();

function triggerImmediateSessionFetch(matchId, options = {}) {
  if (!matchId) return;
  const mid = String(matchId);
  if (_pendingDirectSessionFetches.has(mid)) return;
  _pendingDirectSessionFetches.add(mid);

  const queue = getIngestQueue();
  adapter.getSessionTrades(mid)
    .then(trades => {
      if (trades && !trades.error) {
        _sessionDetailLastAttempt.set(mid, Date.now());
        return queue.add('ingest', {
          source: 'tll',
          type: 'session:trades',
          matchId: mid,
          data: compactSessionPayload(trades),
          notifySubscribers: options.notifySubscribers !== false,
        });
      }
      return null;
    })
    .catch(() => {})
    .finally(() => {
      setTimeout(() => _pendingDirectSessionFetches.delete(mid), 10 * 1000);
    });
}

function triggerImmediateMatchFetch(matchId, options = {}) {
  if (!matchId) return;
  const mid = String(matchId);
  if (_pendingDirectFetches.has(mid)) return;
  _pendingDirectFetches.add(mid);

  const queue = getIngestQueue();

  Promise.all([
    Promise.all([
      adapter.getSnapshot(mid),
      adapter.getOdds(mid).catch(() => null),
    ]).then(([rawSnapshot, liveOdds]) => {
      const snapshot = mergeLiveOdds(rawSnapshot, liveOdds);
      if (snapshot && !snapshot.error) {
        queue.add('ingest', {
          source: 'tll',
          type: 'cricket:snapshot',
          matchId: mid,
          data: snapshot,
        }).catch(() => {});
      }
    }).catch(() => {}),

    adapter.getTossSnapshot(mid).then(tossSnap => {
      if (tossSnap && !tossSnap.error) {
        queue.add('ingest', {
          source: 'tll',
          type: 'toss:snapshot',
          matchId: mid,
          data: tossSnap,
        }).catch(() => {});
      }
    }).catch(() => {}),
  ]).finally(() => {
    setTimeout(() => _pendingDirectFetches.delete(mid), 3000);
  });

  triggerImmediateSessionFetch(mid, options);
}

module.exports = {
  adapter,
  session,
  start,
  stop,
  wakeUp,
  triggerImmediateMatchFetch,
  triggerImmediateSessionFetch,
};
