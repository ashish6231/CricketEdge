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

const adapter = new TennisLiveLoadAdapter();
let _pollInterval = parseInt(process.env.TLL_POLL_INTERVAL_MS, 10) || 4000;
let _timer = null;
let _isRunning = false;

async function runPollCycle() {
  if (_isRunning) return;
  // If not lock holder, don't execute upstream calls
  if (!session.isSingletonLeader()) return;

  _isRunning = true;
  try {
    const queue = getIngestQueue();

    // 1. Fetch raw matches lists in parallel
    const [cricket, toss, sessionMatches, tennis] = await Promise.all([
      adapter.getMatches().catch(err => ({ error: err.message })),
      adapter.getTossMatches().catch(err => ({ error: err.message })),
      adapter.getSessionMatches().catch(err => ({ error: err.message })),
      adapter.getTennisMatches().catch(err => ({ error: err.message })),
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
    if (Array.isArray(tennis) && tennis.length) {
      await queue.add('ingest', { source: 'tll', type: 'tennis:matches', data: tennis });
    }

    // 2. Fetch snapshots for active live matches + any matches currently viewed by users in MatchDetail
    let subscribedMatchIds = new Set();
    try {
      const socketService = require('../socketService');
      if (typeof socketService.getActiveSubscribedMatchIds === 'function') {
        subscribedMatchIds = new Set(socketService.getActiveSubscribedMatchIds());
      }
    } catch {}

    const activeCricket = (Array.isArray(cricket) ? cricket : [])
      .filter(m => {
        const mid = String(m.id || m.matchId);
        return m.inPlay || m.status === 'live' || m.status === 'in-play' || subscribedMatchIds.has(mid);
      });

    for (const subMid of subscribedMatchIds) {
      if (!activeCricket.some(m => String(m.id || m.matchId) === String(subMid))) {
        activeCricket.push({ id: subMid, matchId: subMid });
      }
    }

    for (const m of activeCricket) {
      const mid = m.id || m.matchId;

      adapter.getSnapshot(mid)
        .then(snapshot => {
          if (snapshot && !snapshot.error) {
            queue.add('ingest', {
              source: 'tll',
              type: 'cricket:snapshot',
              matchId: mid,
              data: snapshot,
            }).catch(() => {});
          }
        })
        .catch(() => {});

      adapter.getSessionTrades(mid)
        .then(trades => {
          if (trades && !trades.error) {
            queue.add('ingest', {
              source: 'tll',
              type: 'session:trades',
              matchId: mid,
              data: trades,
            }).catch(() => {});
          }
        })
        .catch(() => {});

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
  } catch (err) {
    console.error('❌ [TLL-Worker] poll cycle error:', err.message);
  } finally {
    _isRunning = false;
  }
}

async function start() {
  console.log('🚀 [TLL-Worker] starting TennisLiveLoad ingestion service...');
  await session.loadSavedSession();

  // Try to acquire singleton lock (wait up to 30s during deploy handoff)
  const isLeader = await session.acquireSingletonLock(30000);
  if (!isLeader) {
    console.warn('⏸️  [TLL-Worker] running in standby mode (waiting for lock)...');
  }

  // Start polling loop
  if (_timer) clearInterval(_timer);
  _timer = setInterval(runPollCycle, _pollInterval);

  // Run initial cycle
  runPollCycle().catch(() => {});
}

function stop() {
  if (_timer) clearInterval(_timer);
  _timer = null;
  console.log('⏹️  [TLL-Worker] stopped.');
}

if (require.main === module) {
  require('dotenv').config();
  start().catch(console.error);
}

module.exports = {
  adapter,
  session,
  start,
  stop,
};
