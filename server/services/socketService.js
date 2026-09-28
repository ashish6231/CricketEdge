/**
 * socketService.js
 * Manages WebSocket connections, room subscriptions, and real-time broadcasts.
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const dataCache = require('./dataCache');
const matchPayloadService = require('./matchPayloadService');
const prisma = require('../db/prisma');

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

function fingerprintMatches(matches) {
  if (!Array.isArray(matches)) return '';
  return matches.map(m => `${m.matchId}_${m.status}_${m.inPlay}_${m.matchLoad?.team1?.odds}_${m.matchLoad?.team2?.odds}_${m.matchLoad?.team1?.money}_${m.matchLoad?.team2?.money}_${m.matchLoad?.team1?.percent}_${m.matchLoad?.team2?.percent}_${m.crex?.score1}_${m.crex?.score2}_${m.crex?.statusText}`).join('|');
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
    // console.log(`🔌 Client connected [${socket.id}], guest: ${Boolean(socket.isGuest)}`);

    // Immediately push ALL cached data to the newly connected client (0ms)
    try {
      const [cricket, toss, tennis, session, crexOverview] = await Promise.all([
        matchPayloadService.getCricketMatchesPayload().catch(() => null),
        matchPayloadService.getTossMatchesPayload().catch(() => null),
        matchPayloadService.getTennisMatchesPayload().catch(() => null),
        matchPayloadService.getSessionMatchesPayload().catch(() => null),
        Promise.resolve(dataCache.getCrexOverview()),
      ]);

      if (cricket) socket.emit('cricket:matches', cricket);
      if (toss) socket.emit('toss:matches', toss);
      if (tennis) socket.emit('tennis:matches', tennis);
      if (session) socket.emit('session:matches', session);
      if (crexOverview?.length > 0) socket.emit('crex:overview', crexOverview);
    } catch (e) {}

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
          socket.emit(`match:bundle:${matchId}`, bundle);
          socket.emit('match:bundle', bundle);
          return;
        }

        const room = `match:${matchId}`;
        socket.join(room);

        if (bundle) {
          socket.emit(`match:bundle:${matchId}`, bundle);
          socket.emit('match:bundle', bundle); // Generic listener support
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
    socket.on('feed:toss', async () => {
      try {
        const toss = await matchPayloadService.getTossMatchesPayload();
        socket.emit('toss:matches', toss);
      } catch {}
    });

    socket.on('feed:tennis', async () => {
      try {
        const tennis = await matchPayloadService.getTennisMatchesPayload();
        socket.emit('tennis:matches', tennis);
      } catch {}
    });

    socket.on('feed:session', async () => {
      try {
        const session = await matchPayloadService.getSessionMatchesPayload();
        socket.emit('session:matches', session);
      } catch {}
    });
  });

  console.log('⚡ SocketService initialized with real-time broadcasting channels');
}

/**
 * Broadcasts all match lists & updates active match rooms
 * Called whenever dataCache completes a tennisliveload poll cycle
 */
async function broadcastAllMatches() {
  if (!_io) return;

  try {
    const [cricketPayload, tossPayload, tennisPayload, sessionPayload] = await Promise.all([
      matchPayloadService.getCricketMatchesPayload().catch(() => null),
      matchPayloadService.getTossMatchesPayload().catch(() => null),
      matchPayloadService.getTennisMatchesPayload().catch(() => null),
      matchPayloadService.getSessionMatchesPayload().catch(() => null),
    ]);

    // Broadcast list feeds ONLY if data actually changed (avoids 100s of identical emits per minute)
    if (cricketPayload) {
      const fp = fingerprintMatches(cricketPayload.matches);
      if (fp !== _lastCricketFp) {
        _lastCricketFp = fp;
        _io.emit('cricket:matches', cricketPayload);
      }
    }
    if (tossPayload) {
      const fp = fingerprintMatches(tossPayload.matches);
      if (fp !== _lastTossFp) {
        _lastTossFp = fp;
        _io.emit('toss:matches', tossPayload);
      }
    }
    if (tennisPayload) {
      const fp = JSON.stringify(tennisPayload.matches?.map(m => `${m.matchId}_${m.status}`) || []);
      if (fp !== _lastTennisFp) {
        _lastTennisFp = fp;
        _io.emit('tennis:matches', tennisPayload);
      }
    }
    if (sessionPayload) {
      const fp = JSON.stringify(sessionPayload.matches?.map(m => `${m.matchId}_${m.status}`) || []);
      if (fp !== _lastSessionFp) {
        _lastSessionFp = fp;
        _io.emit('session:matches', sessionPayload);
      }
    }

    // Active Match Rooms Broadcast
    // Only compute bundles for rooms that have actual connected subscribers!
    const rooms = _io.sockets.adapter?.rooms;
    if (rooms) {
      for (const [roomName, socketSet] of rooms.entries()) {
        if (roomName.startsWith('match:') && socketSet.size > 0) {
          const matchId = roomName.replace('match:', '');
          try {
            const bundle = await matchPayloadService.getMatchBundlePayload(matchId, { isBroadcaster: true, role: 'admin' });
            if (bundle && !bundle.error) {
              const bundleFp = `${bundle.cricket?.updatedAt || ''}_${bundle.crex?.runningBall || ''}_${bundle.crex?.score1 || ''}_${bundle.crex?.score2 || ''}_${bundle.cricket?.runners?.[0]?.price || ''}_${bundle.cricket?.runners?.[1]?.price || ''}`;
              if (bundleFp !== _lastBundleFps.get(matchId)) {
                _lastBundleFps.set(matchId, bundleFp);
                // Emit single clean event (no duplicate)
                _io.to(roomName).emit('match:bundle', bundle);
              }
            }
          } catch (e) {}
        }
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

  try {
    const cricketMatches = dataCache.getCricketMatches();
    for (const m of cricketMatches) {
      const mid = String(m.id || m.matchId);
      const detail = dataCache.getCrexDetail(mid);
      if (!detail) continue;

      const fp = `${detail.scorecard?.team1?.score}_${detail.scorecard?.team2?.score}_${detail.scorecard?.runningBall || detail.runningBall}_${detail.scorecard?.statusEquation || detail.statusText}_${JSON.stringify(detail.odds || '')}`;
      if (fp === _lastCrexLiveFps.get(mid)) continue;
      _lastCrexLiveFps.set(mid, fp);

      const payload = {
        matchId: mid,
        score1: detail.scorecard?.team1?.score || detail.score1 || null,
        score2: detail.scorecard?.team2?.score || detail.score2 || null,
        statusText: detail.scorecard?.statusEquation || detail.scorecard?.matchResult || detail.statusText || null,
        runningBall: detail.scorecard?.runningBall || detail.runningBall || null,
        odds: detail.odds || null,
        team1Name: detail.team1Name || null,
        team2Name: detail.team2Name || null,
        team1Short: detail.team1Short || null,
        team2Short: detail.team2Short || null,
      };
      _io.emit('crex:live', payload);

      // Also emit to room subscribers (MatchDetail) ONLY IF room has subscribers
      const room = _io.sockets.adapter?.rooms?.get(`match:${mid}`);
      if (room && room.size > 0) {
        _io.to(`match:${mid}`).emit(`match:crex:${mid}`, detail);
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
  if (room && room.size > 0) {
    _io.to(`match:${mid}`).emit(`match:crex:${mid}`, detail);
  }
}

module.exports = {
  init,
  getIo,
  getActiveSubscribedMatchIds,
  broadcastAllMatches,
  broadcastCrexUpdates,
  broadcastCrexForMatch,
  notifySessionReplaced,
};

