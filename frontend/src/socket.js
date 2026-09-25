import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (socket) return socket;

  const rawUrl = import.meta.env?.VITE_API_URL || '';
  // If VITE_API_URL is provided with trailing slash or /api, clean it up
  const serverUrl = rawUrl ? rawUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') : window.location.origin;

  const token = localStorage.getItem('auth_token') || null;

  socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    auth: {
      token,
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    // console.log('🟢 WebSocket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    // console.log('🔴 WebSocket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    // console.warn('⚠️ WebSocket connect error:', error.message);
  });

  return socket;
}

export function updateSocketAuth(token) {
  if (socket) {
    socket.auth = { token };
    if (socket.connected) {
      socket.disconnect().connect();
    }
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
