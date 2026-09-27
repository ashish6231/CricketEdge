/**
 * services/api-broadcast/index.js
 * API & Real-Time Broadcast Service (Layer 4)
 *
 * Stateless and horizontally scalable behind a load balancer to serve 1000+ users.
 * NEVER touches upstream scrapers directly.
 * Only reads from Layer 3 (Redis Live Cache / Postgres).
 * Subscribes to Redis Pub/Sub for O(1) fan-out to all connected WebSocket clients.
 */

const { getRedisClient, getSubClient } = require('../../shared/redis');
const normalizer = require('../normalizer/normalizer');

let _io = null;
let _isSubscribed = false;

/**
 * Initialize broadcast layer with Socket.IO instance
 * @param {import('socket.io').Server} io
 */
function init(io) {
  _io = io;
  if (_isSubscribed) return;
  _isSubscribed = true;

  console.log('📡 [API-Broadcast] initializing Redis Pub/Sub listener for real-time fan-out...');
  const sub = getSubClient();

  const CHANNELS = [
    'cricket:matches',
    'toss:matches',
    'session:matches',
    'tennis:matches',
    'crex:overview',
    'match:bundle',
  ];

  CHANNELS.forEach(ch => {
    try {
      sub.subscribe(ch);
    } catch {}
  });

  // Handle Redis Pub/Sub messages
  const onMessage = (channel, message) => {
    if (!_io) return;
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;

      if (channel === 'cricket:matches') {
        _io.emit('cricket:matches', data);
      } else if (channel === 'toss:matches') {
        _io.emit('toss:matches', data);
      } else if (channel === 'session:matches') {
        _io.emit('session:matches', data);
      } else if (channel === 'tennis:matches') {
        _io.emit('tennis:matches', data);
      } else if (channel === 'crex:overview') {
        _io.emit('crex:overview', data);
      } else if (channel === 'match:bundle' || channel.startsWith('match:bundle:')) {
        const matchId = String(data?.matchId || channel.replace('match:bundle:', ''));
        _io.to(`match:${matchId}`).emit(`match:bundle:${matchId}`, data);
        _io.to(`match:${matchId}`).emit('match:bundle', data);
      } else if (channel.startsWith('match:crex:')) {
        const matchId = channel.replace('match:crex:', '');
        _io.to(`match:${matchId}`).emit(`match:crex:${matchId}`, data);
      }
    } catch (err) {
      console.warn(`⚠️  [API-Broadcast] error handling pub/sub message on ${channel}:`, err.message);
    }
  };

  if (sub.isMock) {
    CHANNELS.forEach(ch => sub.on(ch, (msg) => onMessage(ch, msg)));
  } else {
    sub.on('message', onMessage);
  }

  // Handle client room subscriptions
  _io.on('connection', async (socket) => {
    // On connect, push initial cached data from Redis immediately (0ms wait)
    try {
      const cricket = await getCachedCricketMatches();
      if (cricket?.matches?.length) socket.emit('cricket:matches', cricket);

      const toss = await getCachedTossMatches();
      if (toss?.length) socket.emit('toss:matches', toss);

      const session = await getCachedSessionMatches();
      if (session) socket.emit('session:matches', session);

      const tennis = await getCachedTennisMatches();
      if (tennis?.length) socket.emit('tennis:matches', tennis);
    } catch (e) {
      // ignore
    }

    // Room join for match-specific live updates
    const handleSubscribe = async (payload) => {
      const matchId = typeof payload === 'object' ? payload?.matchId : payload;
      if (!matchId) return;
      const mid = String(matchId);
      socket.join(`match:${mid}`);

      // Push cached bundle immediately
      const bundle = await getCachedMatchBundle(mid);
      if (bundle) {
        socket.emit(`match:bundle:${mid}`, bundle);
        socket.emit('match:bundle', bundle);
      }
    };

    const handleUnsubscribe = (payload) => {
      const matchId = typeof payload === 'object' ? payload?.matchId : payload;
      if (matchId) socket.leave(`match:${matchId}`);
    };

    socket.on('subscribe:match', handleSubscribe);
    socket.on('match:subscribe', handleSubscribe);
    socket.on('unsubscribe:match', handleUnsubscribe);
    socket.on('match:unsubscribe', handleUnsubscribe);
  });

  console.log('✅ [API-Broadcast] service running and attached to Socket.IO.');
}

/**
 * 0ms Cached REST Accessors (Read only from Redis or Normalizer in-memory store)
 */
async function getCachedCricketMatches() {
  try {
    const redis = getRedisClient();
    const raw = await redis.get('matches:cricket');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { matches: normalizer.getCricketMatches() };
}

async function getCachedTossMatches() {
  try {
    const redis = getRedisClient();
    const raw = await redis.get('matches:toss');
    if (raw) return JSON.parse(raw);
  } catch {}
  return normalizer.getTossMatches();
}

async function getCachedSessionMatches() {
  try {
    const redis = getRedisClient();
    const raw = await redis.get('matches:session');
    if (raw) return JSON.parse(raw);
  } catch {}
  return normalizer.getSessionMatches();
}

async function getCachedTennisMatches() {
  try {
    const redis = getRedisClient();
    const raw = await redis.get('matches:tennis');
    if (raw) return JSON.parse(raw);
  } catch {}
  return normalizer.getTennisMatches();
}

async function getCachedMatchBundle(matchId) {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(`match:${matchId}:bundle`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return normalizer.getMatchBundle(matchId);
}

module.exports = {
  init,
  getCachedCricketMatches,
  getCachedTossMatches,
  getCachedSessionMatches,
  getCachedTennisMatches,
  getCachedMatchBundle,
};
