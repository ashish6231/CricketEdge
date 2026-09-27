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
let _pollInterval = parseInt(process.env.CREX_POLL_INTERVAL_MS, 10) || 10000;
let _timer = null;
let _isRunning = false;

async function runPollCycle() {
  if (_isRunning) return;
  _isRunning = true;

  try {
    const queue = getIngestQueue();

    // 1. Fetch public overview
    const matches = await adapter.getMatches();
    if (Array.isArray(matches) && matches.length) {
      await queue.add('ingest', {
        source: 'crex',
        type: 'crex:overview',
        data: matches,
      });

      // 2. Fetch details for active live matches
      const liveMatches = matches.filter(m => m.inPlay || m.status === 'live');
      for (const m of liveMatches.slice(0, 10)) {
        adapter.getSnapshot(m.id)
          .then(detail => {
            if (detail) {
              queue.add('ingest', {
                source: 'crex',
                type: 'crex:detail',
                matchId: m.id,
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
