/**
 * services/scraper-crex/index.js
 * CREX Ingestion Worker
 *
 * Stateless worker that polls public CREX pages at a gentle cadence (~10000ms - 12000ms).
 * Pushes raw match overviews and active match details into the Normalizer Queue.
 */

const CrexAdapter = require('./adapter');
const { getIngestQueue } = require('../normalizer/queue');

const adapter = new CrexAdapter();
let _pollInterval = parseInt(process.env.CREX_POLL_INTERVAL_MS, 10) || 2000;
let _timer = null;
let _isRunning = false;

async function runPollCycle() {
  if (_isRunning) return;
  _isRunning = true;

  try {
    const queue = getIngestQueue();

    // 1. Fetch public overview
    const rawOverview = await adapter.getRawOverview();
    if (Array.isArray(rawOverview) && rawOverview.length) {
      await queue.add('ingest', {
        source: 'crex',
        type: 'crex:overview',
        data: rawOverview,
      });

      // 2. Fetch details for active live matches
      const liveMatches = rawOverview.filter(m => m.isLive || m.status === 'live' || m.inPlay);
      for (const m of liveMatches.slice(0, 10)) {
        const slugOrUrl = m.slug || m.url || m.crexMatchId;
        if (!slugOrUrl) continue;
        adapter.getSnapshot(slugOrUrl)
          .then(detail => {
            if (detail) {
              queue.add('ingest', {
                source: 'crex',
                type: 'crex:detail',
                crexMatchId: m.crexMatchId,
                slug: m.slug,
                data: detail,
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }
    }
  } catch (err) {
    console.warn('⚠️  [CREX-Worker] poll cycle error:', err.message);
  } finally {
    _isRunning = false;
  }
}

function start() {
  console.log('🚀 [CREX-Worker] starting CREX public ingestion service...');
  if (_timer) clearInterval(_timer);
  _timer = setInterval(runPollCycle, _pollInterval);
  runPollCycle().catch(() => {});
}

function stop() {
  if (_timer) clearInterval(_timer);
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
};
