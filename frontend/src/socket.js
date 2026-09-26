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
  // If VITE_API_URL is provided with trailing slash or /api, clean it up
  const serverUrl = rawUrl ? rawUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') : window.location.origin;

  const token = localStorage.getItem('auth_token') || null;

  socket = io(serverUrl, {
    transports: ['polling', 'websocket'],
    auth: {
      token,
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('🟢 WebSocket connected:', socket.id, '| transport:', socket.io.engine.transport.name);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔴 WebSocket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.warn('⚠️ WebSocket connect error:', error.message);
  });

  socket.io.engine.on('upgrade', (transport) => {
    console.log('⬆️ Transport upgraded to:', transport.name);
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
  // This is instant — no extra server calls needed
  socket.on('cricket:matches', (payload) => {
    if (payload?.updatedAt) {
      window.dispatchEvent(new CustomEvent('data-refreshed', { detail: { time: new Date(payload.updatedAt) } }))
    }
    const matches = payload?.matches || [];
    matches.forEach(m => {
      if (!m?.matchId || !m?.snapshot) return;
      const existing = matchBundleCache.get(String(m.matchId));
      // Only seed if no real bundle cached yet
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
  if (socket) {
    socket.auth = { token };
    socket.disconnect().connect();
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
  if (s) {
    s.emit('feed:toss');
  }
}

export function requestTennisFeed() {
  const s = getSocket();
  if (s) {
    s.emit('feed:tennis');
  }
}
