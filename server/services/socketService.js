/**
 * socketService.js
 * Manages WebSocket connections, room subscriptions, and real-time broadcasts.
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const dataCache = require('./dataCache');
const matchPayloadService = require('./matchPayloadService');

let _io = null;

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

      // Prefetch all active match bundles and push to client instantly
      // So when user opens any match, data is already cached on client
      const allMatches = [
        ...(cricket?.matches || []),
        ...(toss?.matches || []),
      ];
      const activeMatchIds = [...new Set(
        allMatches
          .filter(m => m.inPlay || (m.status !== 'ended' && m.status !== 'completed' && m.status !== 'closed'))
          .map(m => m.matchId)
      )].slice(0, 20); // cap at 20 to avoid overload

      if (activeMatchIds.length > 0) {
        const bundlePromises = activeMatchIds.map(mid =>
          matchPayloadService.getMatchBundlePayload(mid, socket.user, 'cricket')
            .then(bundle => { if (bundle && !bundle.error) socket.emit('match:prefetch', bundle) })
            .catch(() => {})
        );
        Promise.all(bundlePromises).catch(() => {});
      }
    } catch (e) {}

    // Match Room Subscription (When user opens MatchDetail)
    socket.on('match:subscribe', async (data) => {
      const matchId = typeof data === 'object' ? data?.matchId : data;
      const sport = typeof data === 'object' ? (data?.sport || 'cricket') : 'cricket';
      if (!matchId) return;

      const room = `match:${matchId}`;
      socket.join(room);

      // Instantly deliver the latest cached bundle to this subscriber
      try {
        const bundle = await matchPayloadService.getMatchBundlePayload(matchId, socket.user, sport);
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

    if (cricketPayload) _io.emit('cricket:matches', cricketPayload);
    if (tossPayload) _io.emit('toss:matches', tossPayload);
    if (tennisPayload) _io.emit('tennis:matches', tennisPayload);
    if (sessionPayload) _io.emit('session:matches', sessionPayload);

    // Active Match Rooms Broadcast
    // Only compute bundles for rooms that have actual connected subscribers!
    const rooms = _io.sockets.adapter?.rooms;
    if (rooms) {
      for (const [roomName, socketSet] of rooms.entries()) {
        if (roomName.startsWith('match:') && socketSet.size > 0) {
          const matchId = roomName.replace('match:', '');
          try {
            const bundle = await matchPayloadService.getMatchBundlePayload(matchId, null);
            if (bundle && !bundle.error) {
              _io.to(roomName).emit(`match:bundle:${matchId}`, bundle);
              _io.to(roomName).emit('match:bundle', bundle);
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
function broadcastCrexUpdates() {
  if (!_io) return;

  try {
    const overview = dataCache.getCrexOverview();
    if (Array.isArray(overview) && overview.length > 0) {
      _io.emit('crex:overview', overview);
    }

    const rooms = _io.sockets.adapter?.rooms;
    if (rooms) {
      for (const [roomName, socketSet] of rooms.entries()) {
        if (roomName.startsWith('match:') && socketSet.size > 0) {
          const matchId = roomName.replace('match:', '');
          const detail = dataCache.getCrexDetail(matchId);
          if (detail) {
            _io.to(roomName).emit(`match:crex:${matchId}`, detail);
            _io.to(roomName).emit('match:crex', detail);
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ Error broadcasting CREX updates over WebSocket:', err.message);
  }
}

function notifySessionReplaced(userId, newActiveToken) {
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

module.exports = {
  init,
  getIo,
  broadcastAllMatches,
  broadcastCrexUpdates,
  notifySessionReplaced,
};
