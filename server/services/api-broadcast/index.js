/**
 * services/api-broadcast/index.js
 * Layer 4 — Redis Pub/Sub trigger bridge.
 *
 * Subscribes to Redis Pub/Sub channels published by the Normalizer (Layer 2).
 * On each message, delegates to socketService which builds the enriched
 * matchPayloadService payload and fans it out to all connected Socket.IO clients.
 *
 * This layer never emits directly — socketService owns all Socket.IO output.
 * This keeps the broadcast pipeline: Normalizer → Redis → api-broadcast → socketService → clients
 */

const { getSubClient } = require('../../shared/redis');

let _isSubscribed = false;

// Debounce timers to coalesce back-to-back scrape updates (e.g. 1 broadcast per 2.5s)
const _debounceTimers = {};
const DEBOUNCE_MS = 2500;

function _debounced(key, fn, delay = DEBOUNCE_MS) {
  if (_debounceTimers[key]) clearTimeout(_debounceTimers[key]);
  _debounceTimers[key] = setTimeout(() => {
    delete _debounceTimers[key];
    fn();
  }, delay);
}

/**
 * Initialize the pub/sub bridge.
 * Must be called after socketService.init() so broadcastAllMatches is available.
 */
function init() {
  if (_isSubscribed) return;
  _isSubscribed = true;

  // Lazy-require to avoid circular dependency (socketService → matchPayloadService → dataCache → normalizer)
  const socketService = require('../socketService');

  console.log('📡 [API-Broadcast] subscribing to Redis Pub/Sub channels...');
  const sub = getSubClient();

  const LIST_CHANNELS = ['cricket:matches', 'toss:matches', 'session:matches', 'tennis:matches'];
  const CREX_CHANNEL = 'crex:overview';
  const BUNDLE_CHANNEL = 'match:bundle';

  const allChannels = [...LIST_CHANNELS, CREX_CHANNEL, BUNDLE_CHANNEL];
  allChannels.forEach(ch => { try { sub.subscribe(ch); } catch {} });

  const onMessage = (channel, message) => {
    try {
      if (LIST_CHANNELS.includes(channel)) {
        // Any match list update → coalesced broadcast (max 1 per 1000ms)
        _debounced('lists', () => socketService.broadcastAllMatches().catch(() => {}));

      } else if (channel === CREX_CHANNEL) {
        _debounced('crex', () => socketService.broadcastCrexUpdates().catch(() => {}));

      } else if (channel === BUNDLE_CHANNEL) {
        // Individual match bundle update → broadcast only if room has active subscribers!
        try {
          const data = typeof message === 'string' ? JSON.parse(message) : message;
          const matchId = String(data?.matchId || '');
          if (!matchId) return;

          const io = socketService.getIo();
          if (!io) return;
          const room = io.sockets.adapter?.rooms?.get(`match:${matchId}`);
          if (!room || room.size === 0) return; // Nobody watching this match -> zero CPU/bandwidth waste

          _debounced(`bundle:${matchId}`, () => {
            socketService.broadcastMatchBundle(matchId).catch(() => {});
          }, 500);
        } catch {}
      }
    } catch (err) {
      console.warn(`⚠️  [API-Broadcast] pub/sub handler error on ${channel}:`, err.message);
    }
  };

  if (sub.isMock) {
    allChannels.forEach(ch => sub.on(ch, (msg) => onMessage(ch, msg)));
  } else {
    sub.on('message', onMessage);
  }

  console.log('✅ [API-Broadcast] Redis Pub/Sub bridge active.');
}

module.exports = { init };
