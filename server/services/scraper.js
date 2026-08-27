/**
 * tennisliveload.com API Scraper
 * Auto-relogin on 401 — cookie expire hote hi khud login karke nayi cookie le leta hai.
 */

const axios = require('axios');
const tennisLogin = require('./tennisLogin');

const BASE_URL = process.env.TENNIS_BASE_URL || 'https://tennisliveload.com';

const ENDPOINTS = {
  CRICKET_MATCHES:  '/api/cricket/matches',
  CRICKET_SNAPSHOT: '/api/cricket/snapshot',
  SESSION_MATCHES:  '/api/session/matches',
  SESSION_TRADES:   '/api/session/trades',
  TENNIS_MATCHES:   '/api/tennis/matches',
  TENNIS_SNAPSHOT:  '/api/tennis/snapshot',
  TOSS_MATCHES:     '/api/toss/matches',
  TOSS_SNAPSHOT:    '/api/toss/snapshot',
  LIVE_ODDS:        '/api/live-odds',
  AUTH_LOGIN:       '/api/auth/login',
};

const SNAPSHOT_CACHE_TTL = 5000;  // 5s global cache for snapshots
const LIST_CACHE_TTL = 15000;     // 15s global cache for match lists
const STALE_CACHE_MAX_AGE = 30 * 60 * 1000; // Serve stale data up to 30 min if upstream down

// ──── Single consistent browser fingerprint ────
const FIXED_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function _formatUpstreamError(errPayload) {
  const raw = errPayload?.error || errPayload?.message || 'Service temporarily unavailable';
  if (/530|1033|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timed out/i.test(String(raw))) {
    return 'Live match data is temporarily unavailable. Please try again in a few minutes.';
  }
  return String(raw).replace(/tennisliveload\.com/gi, 'live feed');
}

// ──── HTTP Client with auto-relogin on 401 ────
function _getHeaders() {
  const cookies = tennisLogin.getCookies() || '';
  return {
    'User-Agent': FIXED_USER_AGENT,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/json',
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL,
    'Connection': 'keep-alive',
    ...(cookies ? { 'Cookie': cookies } : {}),
  };
}

async function _callApi(endpoint, params = null, method = 'GET', _isRetry = false) {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const config = { headers: _getHeaders(), timeout: 15000 };
    const resp = method === 'GET'
      ? await axios.get(url, { ...config, params })
      : await axios.post(url, params, config);
    return resp.data;
  } catch (err) {
    if (err.response) {
      const status = err.response.status;

      // ──── Upstream 401 Handler ────
      if (status === 401 && !_isRetry) {
        if (process.env.TENNIS_AUTO_LOGIN === 'true') {
          console.log(`🔑 scraper: got 401 on ${endpoint} — triggering auto-relogin...`);
          const ok = await tennisLogin.autoRelogin();
          if (ok) {
            console.log(`🔄 scraper: retrying ${endpoint} with fresh cookie...`);
            return _callApi(endpoint, params, method, true);
          }
        } else {
          console.warn(`⚠️  scraper: got 401 on ${endpoint} — manual cookie expired. Please update TENNIS_SESSION_COOKIES.`);
        }
      }

      return {
        error: _formatUpstreamError({ error: `HTTP ${status}` }),
        upstreamStatus: status,
      };
    }
    if (err.code === 'ECONNABORTED') return { error: _formatUpstreamError({ error: 'Request timed out' }) };
    return { error: _formatUpstreamError({ error: err.message }) };
  }
}

// ──── Login / Logout ────

async function login(email, password) {
  try {
    await tennisLogin.login(email, password);
    return { status: 'logged_in', email };
  } catch (err) {
    if (err.response?.status === 429) return { error: 'Rate limited — thodi der baad try karo', status_code: 429 };
    if (err.response?.status === 401) return { error: err.response.data?.error || 'Invalid credentials' };
    return { error: err.message };
  }
}

function logout() {
  tennisLogin._sessionCookies = null;
  tennisLogin._connected = false;
}

function isLoggedIn() {
  return tennisLogin.isConnected();
}

function getAuthState() {
  return { isLoggedIn: tennisLogin.isConnected() };
}

// ──── Cache & Deduplication ────
const _cache = {};
const _inFlight = {};

function _cacheGet(key, maxAge) {
  const e = _cache[key];
  if (e && (Date.now() - e.ts) < maxAge) return e.data;
  return null;
}

function _cacheGetStale(key, maxAge = STALE_CACHE_MAX_AGE) {
  const e = _cache[key];
  if (!e || (Date.now() - e.ts) > maxAge) return null;
  if (typeof e.data === 'object' && e.data?.error) return null;
  return e.data;
}

function _cacheSet(key, data) {
  _cache[key] = { data, ts: Date.now() };
}

async function _cachedCall(endpoint, matchId) {
  const key = `${endpoint}:${matchId}`;
  const cached = _cacheGet(key, SNAPSHOT_CACHE_TTL);
  if (cached) return cached;
  
  if (_inFlight[key]) return _inFlight[key];
  
  _inFlight[key] = _callApi(endpoint, { matchId })
    .then(data => {
      if (data && !data.error) _cacheSet(key, data);
      else {
        // If upstream failed, serve stale cache if available
        const stale = _cacheGetStale(key);
        if (stale) {
          console.warn(`⚠️  upstream error for ${key}, serving stale cache`);
          delete _inFlight[key];
          return stale;
        }
      }
      delete _inFlight[key];
      return data;
    })
    .catch(err => {
      delete _inFlight[key];
      return { error: err.message || 'API Error' };
    });
    
  return _inFlight[key];
}

async function _cachedList(key, fn, ttl = LIST_CACHE_TTL) {
  const cached = _cacheGet(key, ttl);
  if (cached !== null) return cached;
  
  if (_inFlight[key]) return _inFlight[key];
  
  _inFlight[key] = fn()
    .then(data => {
      if (data && !(typeof data === 'object' && data.error)) {
        _cacheSet(key, data);
        delete _inFlight[key];
        return data;
      }
      const stale = _cacheGetStale(key);
      if (stale !== null) {
        console.warn(`⚠️  upstream failed for ${key}, serving stale cache`);
        delete _inFlight[key];
        return stale;
      }
      delete _inFlight[key];
      return data;
    })
    .catch(err => {
      delete _inFlight[key];
      return { error: err.message || 'API Error' };
    });
    
  return _inFlight[key];
}

// ──── Public API Functions ────

const getAllCricketMatches  = () => _cachedList('cricket_matches', () => _callApi(ENDPOINTS.CRICKET_MATCHES));
const getAllTennisMatches   = () => _cachedList('tennis_matches',  () => _callApi(ENDPOINTS.TENNIS_MATCHES));
const getAllSessionMatches  = () => _cachedList('session_matches', () => _callApi(ENDPOINTS.SESSION_MATCHES));
const getAllTossMatches     = () => _cachedList('toss_matches',    () => _callApi(ENDPOINTS.TOSS_MATCHES));

const getCricketSnapshot   = (matchId) => _cachedCall(ENDPOINTS.CRICKET_SNAPSHOT, matchId);
const getTennisSnapshot    = (matchId) => _cachedCall(ENDPOINTS.TENNIS_SNAPSHOT,  matchId);
const getSessionTrades     = (matchId) => _cachedCall(ENDPOINTS.SESSION_TRADES,   matchId);
const getTossSnapshot      = (matchId) => _cachedCall(ENDPOINTS.TOSS_SNAPSHOT,    matchId);
const getLiveOdds          = (matchId) => _cachedCall(ENDPOINTS.LIVE_ODDS, matchId);

async function getCricketFullData(includeSnapshots = true) {
  const matches = await getAllCricketMatches();
  const result = {
    total_matches: Array.isArray(matches) ? matches.length : 0,
    scraped_at: new Date().toISOString(),
    matches: [],
  };
  if (!Array.isArray(matches)) return result;
  for (const match of matches) {
    const matchData = { match_info: match };
    if (includeSnapshots) {
      const snapshot = await getCricketSnapshot(match.matchId);
      if (!snapshot?.error) matchData.snapshot = snapshot;
      else matchData.snapshot_error = snapshot.error;
    }
    result.matches.push(matchData);
  }
  return result;
}

// Warmup on startup
async function warmup() {
  try {
    await Promise.all([
      getAllCricketMatches(),
      getAllTennisMatches(),
      getAllTossMatches(),
      getAllSessionMatches(),
    ]);
  } catch {}
}

module.exports = {
  login, logout, isLoggedIn, getAuthState,
  getAllCricketMatches, getAllTennisMatches, getAllSessionMatches, getAllTossMatches,
  getCricketSnapshot, getTennisSnapshot, getSessionTrades, getTossSnapshot,
  getLiveOdds, getCricketFullData, warmup,
};
