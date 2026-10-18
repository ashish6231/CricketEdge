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

let _io = null;

// userId -> activeToken cache (updated on login/logout events)
const _activeTokenCache = new Map();
let _tokenCacheUpdatedAt = 0;

// Bandwidth optimization: Fingerprint caches to avoid broadcasting identical data
let _lastCricketFp = null;
let _lastTossFp = null;
let _lastTennisFp = null;
let _lastSessionFp = null;
const _lastCrexLiveFps = new Map();
const _lastBundleFps = new Map();
const _lastBundleBroadcastAt = new Map();
const MATCH_BUNDLE_BROADCAST_INTERVAL_MS = Math.max(5000, parseInt(process.env.MATCH_BUNDLE_BROADCAST_INTERVAL_MS, 10) || 60 * 1000);

function roundMoneyFp(val) {
  const n = Number(val) || 0;
  if (n < 1000) return Math.round(n / 100) * 100;
  if (n < 50000) return Math.round(n / 500) * 500;
  return Math.round(n / 2000) * 2000;
}

function fingerprintMatches(matches) {
  if (!Array.isArray(matches)) return '';
  return matches.map(m => `${m.matchId}_${m.status}_${m.inPlay}_${m.matchLoad?.team1?.odds}_${m.matchLoad?.team2?.odds}_${roundMoneyFp(m.matchLoad?.team1?.money)}_${roundMoneyFp(m.matchLoad?.team2?.money)}_${Math.round(m.matchLoad?.team1?.percent || 0)}_${Math.round(m.matchLoad?.team2?.percent || 0)}`).join('|');
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

      // Instantly deliver the latest cached bundle to this subscriber
      try {
        const bundle = await matchPayloadService.getMatchBundlePayload(matchId, socket.user, sport);
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
      }
    });

    socket.on('match:unsubscribe', (data) => {
      const matchId = typeof data === 'object' ? data?.matchId : data;
      if (matchId) {
        socket.leave(`match:${matchId}`);
      }
    });

    // Request specific list on tab switch
    socket.on('feed:cricket', async () => {
      try {
        socket.join('feed:cricket');
        const cricket = await matchPayloadService.getCricketMatchesPayload().catch(() => null);
        if (cricket) socket.emit('cricket:matches', cricket);
      } catch {}
    });

    socket.on('feed:toss', async () => {
      try {
        socket.join('feed:toss');
        const toss = await matchPayloadService.getTossMatchesPayload();
        socket.emit('toss:matches', toss);
      } catch {}
    });

    socket.on('feed:tennis', async () => {
      try {
        socket.join('feed:tennis');
        const tennis = await matchPayloadService.getTennisMatchesPayload();
        socket.emit('tennis:matches', tennis);
      } catch {}
    });

    socket.on('feed:session', async () => {
      try {
        socket.join('feed:session');
        const session = await matchPayloadService.getSessionMatchesPayload();
        socket.emit('session:matches', session);
      } catch {}
    });

    socket.on('feed:unsubscribe', (feed) => {
      if (['cricket', 'toss', 'tennis', 'session'].includes(feed)) {
        socket.leave(`feed:${feed}`);
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
async function broadcastMatchBundle(matchId, options = {}) {
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
    const [cricketPayload, tossPayload, tennisPayload, sessionPayload] = await Promise.all([
      hasCricket ? matchPayloadService.getCricketMatchesPayload().catch(() => null) : null,
      hasToss ? matchPayloadService.getTossMatchesPayload().catch(() => null) : null,
      hasTennis ? matchPayloadService.getTennisMatchesPayload().catch(() => null) : null,
      hasSession ? matchPayloadService.getSessionMatchesPayload().catch(() => null) : null,
    ]);

    // Broadcast list feeds ONLY if data actually changed (avoids 100s of identical emits per minute)
    if (cricketPayload) {
      const fp = fingerprintMatches(cricketPayload.matches);
      if (fp !== _lastCricketFp) {
        _lastCricketFp = fp;
        _io.to('feed:cricket').emit('cricket:matches', cricketPayload);
      }
    }
    if (tossPayload) {
      const fp = fingerprintMatches(tossPayload.matches);
      if (fp !== _lastTossFp) {
        _lastTossFp = fp;
        _io.to('feed:toss').emit('toss:matches', tossPayload);
      }
    }
    if (tennisPayload) {
      const fp = JSON.stringify(tennisPayload.matches?.map(m => `${m.matchId}_${m.status}`) || []);
      if (fp !== _lastTennisFp) {
        _lastTennisFp = fp;
        _io.to('feed:tennis').emit('tennis:matches', tennisPayload);
      }
    }
    if (sessionPayload) {
      const fp = JSON.stringify(sessionPayload.matches?.map(m => (
        `${m.matchId}_${m.status}_${m.inPlay}_${m.sessionCount}_${m.totalMatched}_${m.sessionDataReady}`
      )) || []);
      if (fp !== _lastSessionFp) {
        _lastSessionFp = fp;
        _io.to('feed:session').emit('session:matches', sessionPayload);
      }
    }

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
