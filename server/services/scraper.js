/**
 * tennisliveload.com API Scraper
 * All requests route through SCRAPER_PROXY if set — keeps outgoing IP fixed across deploys.
 */

const axios = require('axios');
const http = require('http');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const tennisLogin = require('./tennisLogin');

const BASE_URL = process.env.TENNIS_BASE_URL || 'https://tennisliveload.com';

// ──── Proxy setup ────
// Set SCRAPER_PROXY in env: http://user:pass@host:port  or  socks5://user:pass@host:port
const PROXY_URL = process.env.SCRAPER_PROXY || null;

function _makeAgents() {
  if (PROXY_URL) {
    const agent = new HttpsProxyAgent(PROXY_URL);
    console.log(`🔀 scraper: routing via proxy ${PROXY_URL.replace(/:([^:@]+)@/, ':***@')}`);
    return { httpAgent: agent, httpsAgent: agent };
  }
  return {
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 10, timeout: 60000 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10, timeout: 60000 }),
  };
}

const { httpAgent, httpsAgent } = _makeAgents();

const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 12000,
});

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

const SNAPSHOT_FRESH_TTL  = 2000;          // 2s fresh cache
const SNAPSHOT_SWR_TTL    = 8000;          // up to 8s serve stale + background revalidate
const LIST_FRESH_TTL      = 5000;          // 5s fresh match list
const LIST_SWR_TTL        = 30000;         // up to 30s serve stale match list + background revalidate
const STALE_CACHE_MAX_AGE = 6 * 60 * 60 * 1000; // 6 hours stale fallback if upstream down

// ──── Single consistent browser fingerprint ────
// IMPORTANT: Same UA + same headers har request mein — session consistency ke liye
const FIXED_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...(cookies ? { 'Cookie': cookies } : {}),
  };
}

async function _callApi(endpoint, params = null, method = 'GET') {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const config = { headers: _getHeaders() };
    const resp = method === 'GET'
      ? await axiosInstance.get(url, { ...config, params })
      : await axiosInstance.post(url, params, config);
    return resp.data;
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      if (status === 401) {
        console.warn(`⚠️  scraper: 401 on ${endpoint} — cookie expired. Update TENNIS_SESSION_COOKIES in env.`);
      }
      return { error: _formatUpstreamError({ error: `HTTP ${status}` }), upstreamStatus: status };
    }
    if (err.code === 'ECONNABORTED') return { error: _formatUpstreamError({ error: 'Request timed out' }) };
    return { error: _formatUpstreamError({ error: err.message }) };
  }
}

// ──── Login / Logout ────
// Removed — strictly using manual cookie from TENNIS_SESSION_COOKIES env

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
  
  // 1. Instant return if fresh (< 2s)
  const fresh = _cacheGet(key, SNAPSHOT_FRESH_TTL);
  if (fresh) return fresh;

  // 2. SWR: Instant return if within SWR window (< 8s) + background refresh
  const swr = _cacheGet(key, SNAPSHOT_SWR_TTL);
  if (swr && !swr.error) {
    if (!_inFlight[key]) {
      _inFlight[key] = _callApi(endpoint, { matchId })
        .then(data => {
          if (data && !data.error) _cacheSet(key, data);
          delete _inFlight[key];
          return data;
        })
        .catch(() => {
          delete _inFlight[key];
        });
    }
    return swr;
  }
  
  if (_inFlight[key]) return _inFlight[key];
  
  _inFlight[key] = _callApi(endpoint, { matchId })
    .then(data => {
      if (data && !data.error) _cacheSet(key, data);
      else {
        const stale = _cacheGetStale(key);
        if (stale) {
          delete _inFlight[key];
          return stale;
        }
      }
      delete _inFlight[key];
      return data;
    })
    .catch(err => {
      delete _inFlight[key];
      const stale = _cacheGetStale(key);
      if (stale) return stale;
      return { error: err.message || 'API Error' };
    });
    
  return _inFlight[key];
}

async function _cachedList(key, fn, freshTtl = LIST_FRESH_TTL, swrTtl = LIST_SWR_TTL) {
  // 1. Instant return if fresh (< 5s)
  const fresh = _cacheGet(key, freshTtl);
  if (fresh !== null && !(typeof fresh === 'object' && fresh.error)) return fresh;

  // 2. SWR: Instant return if within SWR window (< 30s) + background refresh
  const swr = _cacheGet(key, swrTtl);
  if (swr !== null && !(typeof swr === 'object' && swr.error)) {
    if (!_inFlight[key]) {
      _inFlight[key] = fn()
        .then(data => {
          if (data && !(typeof data === 'object' && data.error)) {
            _cacheSet(key, data);
          }
          delete _inFlight[key];
          return data;
        })
        .catch(() => {
          delete _inFlight[key];
        });
    }
    return swr;
  }
  
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
        delete _inFlight[key];
        return stale;
      }
      delete _inFlight[key];
      return data;
    })
    .catch(err => {
      delete _inFlight[key];
      const stale = _cacheGetStale(key);
      if (stale !== null) return stale;
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

// ──── Session Keep-Alive ────
// Keep-alive ping disabled — frontend polls every 3-5s which keeps session alive naturally.
// Extra pings from server side cause concurrent session access which triggers invalidation.
let _keepAliveTimer = null;

function startSessionKeepAlive() {
  console.log('ℹ️  tennisliveload: keep-alive disabled — frontend polling keeps session alive');
}

function stopSessionKeepAlive() {
  if (_keepAliveTimer) {
    clearInterval(_keepAliveTimer);
    _keepAliveTimer = null;
  }
}

async function pingSession() {}

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
  isLoggedIn, getAuthState,
  getAllCricketMatches, getAllTennisMatches, getAllSessionMatches, getAllTossMatches,
  getCricketSnapshot, getTennisSnapshot, getSessionTrades, getTossSnapshot,
  getLiveOdds, getCricketFullData, warmup,
  startSessionKeepAlive, stopSessionKeepAlive, pingSession,
};
