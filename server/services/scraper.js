const axios = require('axios');
const tennisLogin = require('./tennisLogin');

const BASE_URL = 'https://tennisliveload.com';

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
};

const CACHE_TTL  = 15 * 1000;
const LIST_TTL   = 60 * 1000;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

function _getHeaders() {
  const cookies = tennisLogin.getCookies() || '';
  return {
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/json',
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL,
    'Connection': 'keep-alive',
    ...(cookies ? { 'Cookie': cookies } : {}),
  };
}

async function _callApi(endpoint, params = null, method = 'GET') {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const config = { headers: _getHeaders(), timeout: 15000 };
    const resp = method === 'GET'
      ? await axios.get(url, { ...config, params })
      : await axios.post(url, params, config);
    return resp.data;
  } catch (err) {
    if (err.response) return { error: `HTTP ${err.response.status}`, message: err.message };
    if (err.code === 'ECONNABORTED') return { error: 'Request timed out' };
    return { error: err.message };
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
}

function isLoggedIn() {
  return tennisLogin.isConnected();
}

function getAuthState() {
  return { isLoggedIn: tennisLogin.isConnected() };
}

// ──── Simple Cache (in-memory, per-request reuse) ────
const _cache = {};

function _cacheGet(key, maxAge = CACHE_TTL) {
  const e = _cache[key];
  if (e && (Date.now() - e.ts) < maxAge) return e.data;
  return null;
}

function _cacheSet(key, data) {
  _cache[key] = { data, ts: Date.now() };
}

async function _cachedCall(endpoint, matchId) {
  const key = `${endpoint}:${matchId}`;
  const cached = _cacheGet(key);
  if (cached) return cached;
  const data = await _callApi(endpoint, { matchId });
  if (data && !data.error) _cacheSet(key, data);
  return data;
}

async function _cachedList(key, fn, ttl = LIST_TTL) {
  const cached = _cacheGet(key, ttl);
  if (cached !== null) return cached;
  const data = await fn();
  if (data && !(typeof data === 'object' && data.error)) _cacheSet(key, data);
  return data;
}

// ──── Public API ────
const getAllCricketMatches  = () => _cachedList('cricket_matches', () => _callApi(ENDPOINTS.CRICKET_MATCHES));
const getAllTennisMatches   = () => _cachedList('tennis_matches',  () => _callApi(ENDPOINTS.TENNIS_MATCHES));
const getAllSessionMatches  = () => _cachedList('session_matches', () => _callApi(ENDPOINTS.SESSION_MATCHES));
const getAllTossMatches     = () => _cachedList('toss_matches',    () => _callApi(ENDPOINTS.TOSS_MATCHES));

const getCricketSnapshot   = (matchId) => _cachedCall(ENDPOINTS.CRICKET_SNAPSHOT, matchId);
const getTennisSnapshot    = (matchId) => _cachedCall(ENDPOINTS.TENNIS_SNAPSHOT,  matchId);
const getSessionTrades     = (matchId) => _cachedCall(ENDPOINTS.SESSION_TRADES,   matchId);
const getTossSnapshot      = (matchId) => _cachedCall(ENDPOINTS.TOSS_SNAPSHOT,    matchId);
const getLiveOdds          = (matchId) => _callApi(ENDPOINTS.LIVE_ODDS, { matchId });

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
