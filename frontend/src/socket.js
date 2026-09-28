import { io } from 'socket.io-client';

let socket = null;

// Global prefetch cache — stores match bundles pushed by server on connect
// MatchDetail reads from this for instant zero-wait rendering
const matchBundleCache = new Map();

// sessionStorage keys
const SS_MATCHES_KEY = '_cx_matches';
const SS_BUNDLE_PREFIX = '_cx_b_';

// Restore match bundles from sessionStorage into memory cache on module load
try {
  const raw = sessionStorage.getItem(SS_MATCHES_KEY);
  if (raw) {
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      list.forEach(matchId => {
        const b = sessionStorage.getItem(SS_BUNDLE_PREFIX + matchId);
        if (b) matchBundleCache.set(String(matchId), JSON.parse(b));
      });
    }
  }
} catch { }

function persistBundle(matchId, bundle) {
  try {
    const key = String(matchId);
    sessionStorage.setItem(SS_BUNDLE_PREFIX + key, JSON.stringify(bundle));
    // Keep index of all stored matchIds
    const raw = sessionStorage.getItem(SS_MATCHES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!list.includes(key)) {
      list.push(key);
      // Cap at 30 entries — remove oldest
      if (list.length > 30) list.splice(0, list.length - 30);
      sessionStorage.setItem(SS_MATCHES_KEY, JSON.stringify(list));
    }
  } catch { }
}

export function getMatchBundle(matchId) {
  return matchBundleCache.get(String(matchId)) || null;
}

export function setMatchBundle(matchId, bundle) {
  matchBundleCache.set(String(matchId), bundle);
  persistBundle(matchId, bundle);
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
    // Re-subscribe to any active match rooms (e.g. after tab resume)
    for (const [mid, sport] of activeSubscriptions.entries()) {
      socket.emit('match:subscribe', { matchId: mid, sport });
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
    // Persist the full matches list for instant restore on next page load
    try {
      sessionStorage.setItem('_cx_matches_list', JSON.stringify(matches));
    } catch { }
    matches.forEach(m => {
      if (!m?.matchId || !m?.snapshot) return;
      const existing = matchBundleCache.get(String(m.matchId));
      if (!existing || existing._seeded) {
        const bundle = {
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
        };
        matchBundleCache.set(String(m.matchId), bundle);
        persistBundle(m.matchId, bundle);
      }
    });
  });

  return socket;
}

const activeSubscriptions = new Map();

// Automatic bandwidth saver: pause socket when tab is hidden (idle background users consume 0 bandwidth)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (socket?.connected) {
        if (import.meta.env?.DEV) console.log('⏸️ [Socket] tab hidden -> disconnecting socket to save bandwidth');
        socket.disconnect();
      }
    } else {
      if (socket && !socket.connected) {
        if (import.meta.env?.DEV) console.log('▶️ [Socket] tab visible -> reconnecting socket');
        socket.connect();
      }
    }
  });
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
    activeSubscriptions.set(String(matchId), sport);
    if (s.connected) {
      s.emit('match:subscribe', { matchId: String(matchId), sport });
    }
  }
}

export function unsubscribeMatch(matchId) {
  const s = getSocket();
  if (s && matchId) {
    activeSubscriptions.delete(String(matchId));
    if (s.connected) {
      s.emit('match:unsubscribe', { matchId: String(matchId) });
    }
  }
}

export function requestTossFeed() {
  const s = getSocket();
  if (s && s.connected) s.emit('feed:toss');
}

export function requestTennisFeed() {
  const s = getSocket();
  if (s && s.connected) s.emit('feed:tennis');
}
