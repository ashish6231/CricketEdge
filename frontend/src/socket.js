import { io } from 'socket.io-client';

let socket = null;

// Global prefetch cache — stores match bundles pushed by server on connect
// MatchDetail reads from this for instant zero-wait rendering
const matchBundleCache = new Map();

export function getMatchBundle(matchId) {
  return matchBundleCache.get(String(matchId)) || null;
}

export function setMatchBundle(matchId, bundle) {
  matchBundleCache.set(String(matchId), bundle);
}

export function getSocket() {
  if (socket) return socket;

  const rawUrl = import.meta.env?.VITE_API_URL || '';
  const serverUrl = rawUrl ? rawUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') : window.location.origin;

  const token = localStorage.getItem('auth_token') || null;

  socket = io(serverUrl, {
    // polling first — works on ALL networks including slow/restricted ones.
    // Socket.IO auto-upgrades to websocket once polling handshake succeeds.
    transports: ['polling', 'websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    // Exponential backoff factor
    randomizationFactor: 0.5,
    timeout: 20000,
    // Reuse existing connection — don't create new socket on hot reload
    forceNew: false,
  });

  socket.on('connect', () => {
    // Upgrade transport log only in dev
    if (import.meta.env.DEV) {
      console.log('🟢 Socket connected:', socket.id, '| transport:', socket.io.engine.transport.name);
    }
  });

  socket.io.engine.on('upgrade', () => {
    if (import.meta.env.DEV) {
      console.log('⬆️ Transport upgraded to websocket');
    }
  });

  // Cache all prefetched match bundles pushed by server on connect
  socket.on('match:prefetch', (bundle) => {
    if (bundle?.matchId) setMatchBundle(bundle.matchId, bundle);
  });

  // Also cache bundles received via normal subscribe flow
  socket.on('match:bundle', (bundle) => {
    if (bundle?.matchId) setMatchBundle(bundle.matchId, bundle);
  });

  // When cricket list arrives, seed bundle cache from each match's embedded snapshot
  socket.on('cricket:matches', (payload) => {
    if (payload?.updatedAt) {
      window.dispatchEvent(new CustomEvent('data-refreshed', { detail: { time: new Date(payload.updatedAt) } }))
    }
    const matches = payload?.matches || [];
    matches.forEach(m => {
      if (!m?.matchId || !m?.snapshot) return;
      const existing = matchBundleCache.get(String(m.matchId));
      if (!existing || existing._seeded) {
        matchBundleCache.set(String(m.matchId), {
          matchId: String(m.matchId),
          cricket: {
            ...m.snapshot,
            teamNames: m.snapshot?.teamNames || m.matchName?.split(' v ').map(s => s.trim()) || [],
            competitionName: m.competitionName || m.snapshot?.competitionName || '',
            startTime: m.startTime || m.snapshot?.startTime || null,
            inPlay: m.inPlay || false,
            status: m.status || '',
            totalMatched: m.totalMatched || 0,
          },
          toss: null,
          session: null,
          crex: m.crex || null,
          _seeded: true,
        });
      }
    });
  });

  return socket;
}

export function updateSocketAuth(token) {
  if (!socket) return;
  socket.auth = { token };
  // Only reconnect if currently connected — avoids double-connect on slow networks
  if (socket.connected) {
    socket.disconnect().connect();
  } else {
    socket.connect();
  }
}

export function subscribeMatch(matchId, sport = 'cricket') {
  const s = getSocket();
  if (s && matchId) {
    s.emit('match:subscribe', { matchId: String(matchId), sport });
  }
}

export function unsubscribeMatch(matchId) {
  const s = getSocket();
  if (s && matchId) {
    s.emit('match:unsubscribe', { matchId: String(matchId) });
  }
}

export function requestTossFeed() {
  const s = getSocket();
  if (s) s.emit('feed:toss');
}

export function requestTennisFeed() {
  const s = getSocket();
  if (s) s.emit('feed:tennis');
}
