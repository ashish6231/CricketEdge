/**
 * tennisliveload.com API Scraper
 * All requests route through SCRAPER_PROXY if set — keeps outgoing IP fixed across deploys.
 *
 * This module handles:
 *   - Raw HTTP calls with correct cookie/headers
 *   - Auto-relogin on 401
 *   - Proxy routing
 *
 * Data caching is handled by dataCache.js (centralized background poller).
 * The fetch* functions below are called by dataCache, NOT by routes directly.
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

async function _callApi(endpoint, params = null, method = 'GET', _isRetry = false) {
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
        if (!_isRetry && tennisLogin.canAutoLogin()) {
          console.log(`🔑 scraper: 401 on ${endpoint} — using daily automated login try (1/1)...`);
          const ok = await tennisLogin.autoRelogin();
          if (ok) {
            console.log(`🔄 scraper: retrying ${endpoint} with freshly acquired session cookie...`);
            return _callApi(endpoint, params, method, true);
          }
        }
        console.warn(`⚠️  scraper: 401 on ${endpoint} — cookie expired. 2nd login try is reserved for emergency / manual update.`);
        try { tennisLogin.invalidateCookie(tennisLogin.getCookies()); } catch {}
      }
      return { error: _formatUpstreamError({ error: `HTTP ${status}` }), upstreamStatus: status };
    }
    if (err.code === 'ECONNABORTED') return { error: _formatUpstreamError({ error: 'Request timed out' }) };
    return { error: _formatUpstreamError({ error: err.message }) };
  }
}

// ──── Login / Logout ────

function isLoggedIn() {
  return tennisLogin.isConnected();
}

function getAuthState() {
  return { isLoggedIn: tennisLogin.isConnected() };
}

// ──── Raw Fetch Functions (called by dataCache.js background poller) ────

const fetchCricketMatches  = () => _callApi(ENDPOINTS.CRICKET_MATCHES);
const fetchTennisMatches   = () => _callApi(ENDPOINTS.TENNIS_MATCHES);
const fetchSessionMatches  = () => _callApi(ENDPOINTS.SESSION_MATCHES);
const fetchTossMatches     = () => _callApi(ENDPOINTS.TOSS_MATCHES);

const fetchCricketSnapshot = (matchId) => _callApi(ENDPOINTS.CRICKET_SNAPSHOT, { matchId });
const fetchTennisSnapshot  = (matchId) => _callApi(ENDPOINTS.TENNIS_SNAPSHOT, { matchId });
const fetchSessionTrades   = (matchId) => _callApi(ENDPOINTS.SESSION_TRADES, { matchId });
const fetchTossSnapshot    = (matchId) => _callApi(ENDPOINTS.TOSS_SNAPSHOT, { matchId });
const fetchLiveOdds        = (matchId) => _callApi(ENDPOINTS.LIVE_ODDS, { matchId });

// ──── Backward-Compatible Delegating Functions ────
let _dataCache = null;
function _getDataCache() {
  if (!_dataCache) {
    try { _dataCache = require('./dataCache'); } catch {}
  }
  return _dataCache;
}

const getAllCricketMatches = () => {
  const dc = _getDataCache();
  return Promise.resolve(dc ? dc.getCricketMatches() : fetchCricketMatches());
};
const getAllTennisMatches = () => {
  const dc = _getDataCache();
  return Promise.resolve(dc ? dc.getTennisMatches() : fetchTennisMatches());
};
const getAllSessionMatches = () => {
  const dc = _getDataCache();
  return Promise.resolve(dc ? dc.getSessionMatches() : fetchSessionMatches());
};
const getAllTossMatches = () => {
  const dc = _getDataCache();
  return Promise.resolve(dc ? dc.getTossMatches() : fetchTossMatches());
};

const getCricketSnapshot = (matchId) => {
  const dc = _getDataCache();
  return dc ? dc.getCricketSnapshot(matchId) : fetchCricketSnapshot(matchId);
};
const getTennisSnapshot = (matchId) => {
  const dc = _getDataCache();
  return dc ? dc.getTennisSnapshot(matchId) : fetchTennisSnapshot(matchId);
};
const getSessionTrades = (matchId) => {
  const dc = _getDataCache();
  return dc ? dc.getSessionTrades(matchId) : fetchSessionTrades(matchId);
};
const getTossSnapshot = (matchId) => {
  const dc = _getDataCache();
  return dc ? dc.getTossSnapshot(matchId) : fetchTossSnapshot(matchId);
};
const getLiveOdds = (matchId) => {
  const dc = _getDataCache();
  return dc ? dc.getLiveOdds(matchId) : fetchLiveOdds(matchId);
};

const getCricketFullData = (includeSnapshots = true) => {
  const dc = _getDataCache();
  return dc ? dc.getCricketFullData(includeSnapshots) : Promise.resolve({ total_matches: 0, matches: [] });
};

function startSessionKeepAlive() {}
function stopSessionKeepAlive() {}
async function warmup() {}
async function pingSession() {}

module.exports = {
  isLoggedIn,
  getAuthState,
  // Raw fetch functions for dataCache
  fetchCricketMatches,
  fetchTennisMatches,
  fetchSessionMatches,
  fetchTossMatches,
  fetchCricketSnapshot,
  fetchTennisSnapshot,
  fetchSessionTrades,
  fetchTossSnapshot,
  fetchLiveOdds,
  // Legacy / convenience cached methods
  getAllCricketMatches,
  getAllTennisMatches,
  getAllSessionMatches,
  getAllTossMatches,
  getCricketSnapshot,
  getTennisSnapshot,
  getSessionTrades,
  getTossSnapshot,
  getLiveOdds,
  getCricketFullData,
  startSessionKeepAlive,
  stopSessionKeepAlive,
  warmup,
  pingSession,
};

