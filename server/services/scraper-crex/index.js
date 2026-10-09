/**
 * services/scraper-crex/index.js
 * CREX ingestion worker.
 *
 * Overview and detail polling run at separate cadences. Detail requests are
 * limited to matches present in our cricket feed, with open match rooms first.
 * This keeps scorecards fresh without scraping every unrelated CREX fixture.
 */

const CrexAdapter = require('./adapter');
const { getIngestQueue } = require('../normalizer/queue');
const dataCache = require('../dataCache');
const crexService = require('../crexService');

const adapter = new CrexAdapter();

const numberFromEnv = (name, fallback, minimum) => {
  const parsed = Number.parseInt(process.env[name], 10);
  return Math.max(minimum, Number.isFinite(parsed) ? parsed : fallback);
};

const LOOP_MS = numberFromEnv('CREX_WORKER_TICK_MS', 750, 500);
const OVERVIEW_POLL_MS = numberFromEnv('CREX_OVERVIEW_POLL_MS', 8000, 3000);
const DETAIL_POLL_MS = numberFromEnv('CREX_DETAIL_POLL_MS', 3000, 1500);
const SUBSCRIBED_DETAIL_POLL_MS = numberFromEnv('CREX_SUBSCRIBED_DETAIL_POLL_MS', 1500, 1000);
const DETAIL_CONCURRENCY = numberFromEnv('CREX_DETAIL_CONCURRENCY', 3, 1);

let _timer = null;
let _stopped = true;
let _isRunning = false;
let _lastOverviewAt = 0;
let _latestOverview = [];
let _lastOverviewFingerprint = '';
const _lastDetailFetchAt = new Map();
const _lastDetailFingerprint = new Map();

function overviewFingerprint(matches) {
  return JSON.stringify((matches || []).map(m => [
    m.crexMatchId,
    m.slug,
    m.status,
    m.statusText,
    m.score1,
    m.score2,
    // Some live CREX rows expose a countdown which is normalized to Date.now().
    // Excluding that volatile value prevents an unchanged overview from being
    // queued and broadcast again on every poll.
    m.status === 'live' ? null : m.startTime,
    m.odds?.rate,
    m.odds?.rate2,
    m.odds?.rateTeam,
  ]));
}

function getSubscribedMatchIds() {
  try {
    const socketService = require('../socketService');
    return new Set(socketService.getActiveSubscribedMatchIds().map(String));
  } catch {
    return new Set();
  }
}

function findLocalMatch(crexMatch, localMatches) {
  for (const localMatch of localMatches) {
    const matched = crexService.findCrexMatch(localMatch.matchName, [crexMatch], {
      startTime: localMatch.startTime || localMatch.openDate || localMatch.marketStartTime,
      status: localMatch.status,
      inPlay: localMatch.inPlay,
    });
    if (matched) return localMatch;
  }
  return null;
}

function buildDetailCandidates(overview, now) {
  const localMatches = dataCache.getCricketMatches();
  const subscribedIds = getSubscribedMatchIds();
  const candidates = [];
  const seen = new Set();

  for (const crexMatch of overview) {
    if (!(crexMatch?.isLive || crexMatch?.status === 'live' || crexMatch?.inPlay)) continue;

    const key = String(crexMatch.crexMatchId || crexMatch.slug || crexMatch.url || '');
    if (!key || seen.has(key)) continue;

    const localMatch = findLocalMatch(crexMatch, Array.isArray(localMatches) ? localMatches : []);
    const localMatchId = localMatch ? String(localMatch.id || localMatch.matchId || '') : '';
    const directlySubscribed = subscribedIds.has(`crex-${key}`) || subscribedIds.has(key);
    const isSubscribed = directlySubscribed || (localMatchId && subscribedIds.has(localMatchId));

    // Overview scores are sufficient for list cards. Full detail HTML scraping
    // is reserved for matches a user is actively viewing in a room.
    // When no room subscriber is present, use a relaxed background cadence (60s).
    if (!localMatch && !isSubscribed) continue;

    const cadence = isSubscribed ? SUBSCRIBED_DETAIL_POLL_MS : 60000;
    const lastFetched = _lastDetailFetchAt.get(key) || 0;
    if (now - lastFetched < cadence) continue;

    seen.add(key);
    candidates.push({
      crexMatch,
      key,
      localMatchId: localMatchId || (directlySubscribed ? key : ''),
      priority: isSubscribed ? 0 : 1,
    });
  }

  return candidates.sort((a, b) => a.priority - b.priority);
}

async function runWithConcurrency(items, limit, handler) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await handler(item);
    }
  });
  await Promise.all(workers);
}

async function runPollCycle() {
  if (_isRunning) return;
  _isRunning = true;

  try {
    const queue = getIngestQueue();
    const now = Date.now();

    if (!_latestOverview.length || now - _lastOverviewAt >= OVERVIEW_POLL_MS) {
      const rawOverview = await adapter.getRawOverview();
      _lastOverviewAt = Date.now();
      if (Array.isArray(rawOverview) && rawOverview.length) {
        _latestOverview = rawOverview;
        const fingerprint = overviewFingerprint(rawOverview);
        if (fingerprint !== _lastOverviewFingerprint) {
          _lastOverviewFingerprint = fingerprint;
          await queue.add('ingest', {
            source: 'crex',
            type: 'crex:overview',
            data: rawOverview,
          });
        }
      }
    }

    const candidates = buildDetailCandidates(_latestOverview, Date.now());
    await runWithConcurrency(candidates, DETAIL_CONCURRENCY, async ({ crexMatch, key, localMatchId }) => {
      _lastDetailFetchAt.set(key, Date.now());
      const slugOrUrl = crexMatch.slug || crexMatch.url;
      if (!slugOrUrl) return;

      try {
        const detail = await adapter.getSnapshot(slugOrUrl);
        if (!detail) return;

        const fingerprint = JSON.stringify(detail);
        if (fingerprint === _lastDetailFingerprint.get(key)) return;
        _lastDetailFingerprint.set(key, fingerprint);

        await queue.add('ingest', {
          source: 'crex',
          type: 'crex:detail',
          matchId: localMatchId || undefined,
          crexMatchId: crexMatch.crexMatchId,
          slug: crexMatch.slug,
          data: detail,
        });
      } catch (err) {
        console.warn(`⚠️  [CREX-Worker] detail fetch failed for ${key}:`, err.message);
      }
    });
  } catch (err) {
    console.warn('⚠️  [CREX-Worker] poll cycle error:', err.message);
  } finally {
    _isRunning = false;
  }
}

async function tick() {
  if (_stopped) return;
  await runPollCycle();
  if (_stopped) return;
  _timer = setTimeout(tick, LOOP_MS);
  _timer.unref?.();
}

function start() {
  if (!_stopped) return;
  console.log('🚀 [CREX-Worker] starting adaptive CREX ingestion service...');
  _stopped = false;
  tick().catch(err => console.warn('⚠️  [CREX-Worker] start error:', err.message));
}

function stop() {
  _stopped = true;
  if (_timer) clearTimeout(_timer);
  _timer = null;
  console.log('⏹️  [CREX-Worker] stopped.');
}

if (require.main === module) {
  require('dotenv').config();
  start();
}

module.exports = {
  adapter,
  start,
  stop,
  runPollCycle,
  buildDetailCandidates,
  overviewFingerprint,
};
