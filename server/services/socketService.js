/**
 * socketService.js
 * Manages WebSocket connections, room subscriptions, and real-time broadcasts.
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const dataCache = require('./dataCache');
const matchPayloadService = require('./matchPayloadService');
const prisma = require('../db/prisma');
const { fingerprintMatchBundle } = require('../utils/matchBundleFingerprint');
const { snapshotFeed, diffFeed } = require('../utils/feedDelta');

let _io = null;

// userId -> activeToken cache (updated on login/logout events)
const _activeTokenCache = new Map();
let _tokenCacheUpdatedAt = 0;

const _lastCrexLiveFps = new Map();
const _lastBundleFps = new Map();
const _lastBundleBroadcastAt = new Map();
const _bundleInFlight = new Map();
const MATCH_BUNDLE_BROADCAST_INTERVAL_MS = Math.max(5000, parseInt(process.env.MATCH_BUNDLE_BROADCAST_INTERVAL_MS, 10) || 60 * 1000);
const FEED_BUILDERS = {
  cricket: () => matchPayloadService.getCricketMatchesPayload(),
  toss: () => matchPayloadService.getTossMatchesPayload(),
  tennis: () => matchPayloadService.getTennisMatchesPayload(),
  session: () => matchPayloadService.getSessionMatchesPayload(),
};
const _feedInFlight = new Map();

function deliverFeed(socket, feed, next, force = false) {
  socket.feedStates ||= new Map();
  const previous = socket.feedStates.get(feed);
  const version = (previous?.version || 0) + 1;
  const delta = previous && !force ? diffFeed(previous.snapshot, next) : null;
  if (previous && !force && !delta) return;
  const full = { ...next.payload, version };
  const update = delta && { ...delta, feed, baseVersion: previous.version, version };
  if (socket.handshake.auth?.feedDeltas === true && update &&
      Buffer.byteLength(JSON.stringify(update)) < Buffer.byteLength(JSON.stringify(full))) {
    socket.emit('feed:delta', update);
  } else {
    socket.emit(`${feed}:matches`, full);
  }
  socket.feedStates.set(feed, { snapshot: next, version });
}

async function publishFeed(feed, onlySocket = null, force = false) {
  // Coalesce overlapping ingestion events and subscription requests.
  let pending = _feedInFlight.get(feed);
  if (!pending) {
    pending = Promise.resolve().then(FEED_BUILDERS[feed]).then(snapshotFeed);
    _feedInFlight.set(feed, pending);
  }
  try {
    const snapshot = await pending;
    if (onlySocket) {
      if (onlySocket.connected && onlySocket.rooms.has(`feed:${feed}`)) deliverFeed(onlySocket, feed, snapshot, force);
    } else {
      const room = _io.sockets.adapter?.rooms?.get(`feed:${feed}`);
      for (const id of room || []) {
        const socket = _io.sockets.sockets.get(id);
        if (socket) deliverFeed(socket, feed, snapshot);
      }
    }
  } finally {
    if (_feedInFlight.get(feed) === pending) _feedInFlight.delete(feed);
  }
}

async function _refreshActiveTokenCache() {
  // Collect all authenticated userIds currently connected
  if (!_io) return;
  const userIds = new Set();
  for (const [, socket] of _io.sockets.sockets) {
    if (socket.userId) userIds.add(socket.userId);
  }
  if (!userIds.size) return;

  try {
    const rows = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, activeToken: true },
    });
    rows.forEach(r => _activeTokenCache.set(r.id, r.activeToken));
    _tokenCacheUpdatedAt = Date.now();
  } catch {}
}

function _checkSessionsAndKickStale() {
  if (!_io) return;
  for (const [, socket] of _io.sockets.sockets) {
    if (!socket.userId || !socket.token) continue;
    const activeToken = _activeTokenCache.get(socket.userId);
    if (activeToken === undefined) continue; // not in cache yet
    if (activeToken && activeToken !== socket.token) {
      socket.emit('session:replaced', {
        code: 'SESSION_REPLACED',
        message: 'Aapka account kisi doosre device par login ho gaya hai. Yahan se logout ho gaya.',
      });
      socket.disconnect(true);
    }
  }
}

function init(io) {
  _io = io;

  // 1. Auth middleware — allow authenticated users AND guests
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.userId;
        socket.token = token;
        socket.user = decoded;
        socket.join(`user:${decoded.userId}`);
      } catch (err) {
        socket.user = null;
        socket.isGuest = true;
      }
    } else {
      socket.user = null;
      socket.isGuest = true;
    }
    next();
  });

  // 2. Client connection & subscriptions
  io.on('connection', async (socket) => {
    // Wake up background workers if they were in idle sleep mode
    try {
      const crexWorker = require('./scraper-crex');
      const tllWorker = require('./scraper-tennisliveload');
      crexWorker.wakeUp?.();
      tllWorker.wakeUp?.();
    } catch {}

    // Match Room Subscription (When user opens MatchDetail)
    socket.on('match:subscribe', async (data) => {
      const matchId = typeof data === 'object' ? data?.matchId : data;
      const sport = typeof data === 'object' ? (data?.sport || 'cricket') : 'cricket';
      if (!matchId) return;
      socket.matchRequests ||= new Map();
      const requestKey = String(matchId);
      if (socket.matchRequests.has(requestKey) || socket.rooms.has(`match:${matchId}`)) return;
      const request = {};
      socket.matchRequests.set(requestKey, request);

      // Instantly deliver the latest cached bundle to this subscriber
      try {
        const bundle = await matchPayloadService.getMatchBundlePayload(matchId, socket.user, sport);
        if (!socket.connected || socket.matchRequests.get(requestKey) !== request) return;
        if (bundle?.error) {
          // If login or subscription is required, emit error directly and do not join room
          socket.emit('match:bundle', bundle);
          return;
        }

        const room = `match:${matchId}`;
        const roomAlreadyActive = (_io.sockets.adapter?.rooms?.get(room)?.size || 0) > 0;
        socket.join(room);

        if (sport === 'session') {
          try {
            const tllWorker = require('./scraper-tennisliveload');
            tllWorker.triggerImmediateSessionFetch?.(matchId);
          } catch {}
        }

        if (bundle) {
          socket.emit('match:bundle', bundle);
          // Start the room cadence only for its first subscriber. A later viewer
          // must not postpone the minute update for viewers already in the room.
          if (!roomAlreadyActive) {
            _lastBundleFps.set(String(matchId), fingerprintMatchBundle(bundle));
            _lastBundleBroadcastAt.set(String(matchId), Date.now());
          }
        }
      } catch (err) {
        socket.emit(`match:error:${matchId}`, { error: err.message });
      } finally {
        if (socket.matchRequests.get(requestKey) === request) socket.matchRequests.delete(requestKey);
      }
    });

    socket.on('match:unsubscribe', (data) => {
      const matchId = typeof data === 'object' ? data?.matchId : data;
      if (matchId) {
        socket.matchRequests?.delete(String(matchId));
        socket.leave(`match:${matchId}`);
      }
    });

    for (const feed of Object.keys(FEED_BUILDERS)) {
      socket.on(`feed:${feed}`, async (options) => {
        const room = `feed:${feed}`;
        if (socket.rooms.has(room) && !options?.force) return;
        socket.join(room);
        try { await publishFeed(feed, socket, true); } catch {}
      });
    }

    socket.on('feed:unsubscribe', (feed) => {
      if (Object.hasOwn(FEED_BUILDERS, feed)) {
        socket.leave(`feed:${feed}`);
        socket.feedStates?.delete(feed);
      }
    });

  });

  console.log('⚡ SocketService initialized with real-time broadcasting channels');
}

/**
 * Sends a match room bundle only when user-visible data changed.
 * All ingestion paths use this function so overlapping Redis events cannot
 * broadcast the same large payload more than once.
 */
function broadcastMatchBundle(matchId, options = {}) {
  const mid = String(matchId || '');
  if (_bundleInFlight.has(mid)) return _bundleInFlight.get(mid);
  const pending = _broadcastMatchBundle(matchId, options).finally(() => {
    if (_bundleInFlight.get(mid) === pending) _bundleInFlight.delete(mid);
  });
  _bundleInFlight.set(mid, pending);
  return pending;
}

async function _broadcastMatchBundle(matchId, options = {}) {
  if (!_io || !matchId) return false;

  const mid = String(matchId);
  const roomName = `match:${mid}`;
  const room = _io.sockets.adapter?.rooms?.get(roomName);
  if (!room || room.size === 0) return false;

  const now = Date.now();
  if (!options.force && now - (_lastBundleBroadcastAt.get(mid) || 0) < MATCH_BUNDLE_BROADCAST_INTERVAL_MS) {
    return false;
  }

  const bundle = await matchPayloadService.getMatchBundlePayload(
    mid,
    { isBroadcaster: true, role: 'admin' },
    'cricket',
  );
  if (!bundle || bundle.error) return false;

  const fingerprint = fingerprintMatchBundle(bundle);
  // Whether changed or not, do the expensive full-bundle comparison at most once per minute.
  _lastBundleBroadcastAt.set(mid, now);
  if (fingerprint === _lastBundleFps.get(mid)) return false;

  _lastBundleFps.set(mid, fingerprint);
  _io.to(roomName).emit('match:bundle', bundle);
  return true;
}

function getConnectedClientsCount() {
  return _io?.engine?.clientsCount || 0;
}

function hasActiveFeedSubscribers(feed) {
  if (!_io) return false;
  if (!feed) return getConnectedClientsCount() > 0;
  const room = _io.sockets.adapter?.rooms?.get(`feed:${feed}`);
  return Boolean(room && room.size > 0);
}

/**
 * Broadcasts all match lists & updates active match rooms
 * Called whenever dataCache completes a tennisliveload poll cycle
 */
async function broadcastAllMatches() {
  if (!_io) return;
  if (getConnectedClientsCount() === 0) return;

  const hasCricket = hasActiveFeedSubscribers('cricket');
  const hasToss = hasActiveFeedSubscribers('toss');
  const hasTennis = hasActiveFeedSubscribers('tennis');
  const hasSession = hasActiveFeedSubscribers('session');
  const activeRooms = getActiveSubscribedMatchIds();

  if (!hasCricket && !hasToss && !hasTennis && !hasSession && activeRooms.length === 0) return;

  try {
    await Promise.all([
      hasCricket ? publishFeed('cricket') : null,
      hasToss ? publishFeed('toss') : null,
      hasTennis ? publishFeed('tennis') : null,
      hasSession ? publishFeed('session') : null,
    ]);

    // Active Match Rooms Broadcast
    // Only compute bundles for rooms that have actual connected subscribers!
    if (activeRooms.length > 0) {
      for (const matchId of activeRooms) {
        try {
          await broadcastMatchBundle(matchId);
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error('❌ Error broadcasting match updates over WebSocket:', err.message);
  }
}

/**
 * Broadcasts CREX live updates (ball-by-ball, scorecards)
 * Called whenever dataCache completes a crex poll cycle
 */
async function broadcastCrexUpdates() {
  if (!_io) return;
  if (getConnectedClientsCount() === 0) return;

  const hasCricket = hasActiveFeedSubscribers('cricket');
  const activeRooms = getActiveSubscribedMatchIds();
  if (!hasCricket && activeRooms.length === 0) return;

  try {
    const cricketMatches = dataCache.getCricketMatches();
    for (const m of cricketMatches) {
      const mid = String(m.id || m.matchId);
      const detail = dataCache.getCrexDetail(mid);
      if (!detail) continue;

      const scorecard = matchPayloadService.alignScorecardTeams(detail.scorecard, m.matchName) || detail.scorecard;

      const fp = `${scorecard?.team1?.score}_${scorecard?.team2?.score}_${scorecard?.runningBall || detail.runningBall}_${scorecard?.statusEquation || detail.statusText}_${JSON.stringify(detail.odds || '')}`;
      if (fp === _lastCrexLiveFps.get(mid)) continue;
      _lastCrexLiveFps.set(mid, fp);

      const payload = {
        matchId: mid,
        score1: scorecard?.team1?.score || detail.score1 || null,
        score2: scorecard?.team2?.score || detail.score2 || null,
        statusText: scorecard?.statusEquation || scorecard?.matchResult || detail.statusText || null,
        runningBall: scorecard?.runningBall || detail.runningBall || null,
        odds: detail.odds || null,
        team1Name: scorecard?.team1?.name || detail.team1Name || null,
        team2Name: scorecard?.team2?.name || detail.team2Name || null,
        team1Short: scorecard?.team1?.shortName || detail.team1Short || null,
        team2Short: scorecard?.team2?.shortName || detail.team2Short || null,
      };
      if (hasCricket) {
        _io.to('feed:cricket').emit('crex:live', payload);
      }

      const room = _io.sockets.adapter?.rooms?.get(`match:${mid}`);
      if (room?.size > 0) {
        _io.to(`match:${mid}`).emit(`match:crex:${mid}`, {
          ...detail,
          scorecard,
        });
      }
    }
  } catch (err) {
    console.error('❌ Error broadcasting CREX updates over WebSocket:', err.message);
  }
}

function notifySessionReplaced(userId, newActiveToken) {
  // Invalidate cache so next broadcast cycle picks up the new token immediately
  if (userId) _activeTokenCache.delete(userId);

  if (!_io || !userId) return;
  const userRoom = `user:${userId}`;
  const room = _io.sockets.adapter?.rooms?.get(userRoom);
  if (!room) return;

  for (const socketId of room) {
    const s = _io.sockets.sockets.get(socketId);
    if (s && s.token && s.token !== newActiveToken) {
      s.emit('session:replaced', {
        code: 'SESSION_REPLACED',
        message: 'Aapka account kisi doosre device par login ho gaya hai. Yahan se logout ho gaya.',
      });
      s.leave(userRoom);
      s.disconnect(true);
    }
  }
}

function getIo() {
  return _io;
}

function getActiveSubscribedMatchIds() {
  const ids = new Set();
  const rooms = _io?.sockets?.adapter?.rooms;
  if (rooms) {
    for (const [roomName, socketSet] of rooms.entries()) {
      if (roomName.startsWith('match:') && socketSet.size > 0) {
        ids.add(roomName.replace('match:', ''));
      }
    }
  }
  return Array.from(ids);
}

function broadcastCrexForMatch(matchId, detail) {
  if (!_io || !matchId || !detail) return;
  const mid = String(matchId);
  const room = _io.sockets.adapter?.rooms?.get(`match:${mid}`);
  if (room?.size > 0) {
    _io.to(`match:${mid}`).emit(`match:crex:${mid}`, detail);
  }
}

module.exports = {
  init,
  getIo,
  getConnectedClientsCount,
  hasActiveFeedSubscribers,
  getActiveSubscribedMatchIds,
  broadcastMatchBundle,
  broadcastAllMatches,
  broadcastCrexUpdates,
  broadcastCrexForMatch,
  notifySessionReplaced,
  MATCH_BUNDLE_BROADCAST_INTERVAL_MS,
};
