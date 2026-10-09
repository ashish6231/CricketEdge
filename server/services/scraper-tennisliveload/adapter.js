/**
 * services/scraper-tennisliveload/adapter.js
 * TennisLiveLoad Source Adapter
 * Extends SourceAdapter to fetch matches, odds, snapshots, sessions, and tosses.
 */

const axios = require('axios');
const SourceAdapter = require('../../shared/adapter');
const session = require('./session');
const { createNormalizedMatch, createNormalizedOdds } = require('../../shared/schema');

const BASE_URL = (process.env.TENNIS_BASE_URL || 'https://tennisliveload.com').replace(/\/$/, '');

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

const _rawProxy = (process.env.SCRAPER_PROXY || '').trim();
const PROXY_URL = _rawProxy && _rawProxy.startsWith('http') ? _rawProxy : null;

let HttpsProxyAgent = null;
if (PROXY_URL) {
  try {
    const proxyModule = require('https-proxy-agent');
    HttpsProxyAgent = proxyModule.HttpsProxyAgent || proxyModule;
  } catch (err) {
    console.warn('[TennisLiveLoad] Warning: Failed to load https-proxy-agent, falling back to direct connection:', err.message);
  }
}

class TennisLiveLoadAdapter extends SourceAdapter {
  constructor() {
    super('tennisliveload');
    this.session = session;
    let agent;
    if (PROXY_URL && HttpsProxyAgent) {
      try {
        agent = new HttpsProxyAgent(PROXY_URL);
      } catch (err) {
        console.warn('[TennisLiveLoad] Warning: Failed to initialize HttpsProxyAgent:', err.message);
      }
    }
    this.axiosInstance = axios.create({
      timeout: 10000,
      httpAgent: agent,
      httpsAgent: agent,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  }

  _getHeaders() {
    const cookies = this.session.getCookies();
    return {
      'User-Agent': this.session.getFixedUserAgent(),
      'Referer': BASE_URL + '/',
      'Origin': BASE_URL,
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...(cookies ? { 'Cookie': cookies } : {}),
    };
  }

  async _request(endpoint, params = null, method = 'GET', _isRetry = false) {
    if (!this.session.getCookies()) {
      await this.session.loadSavedSession();
    }
    const url = `${BASE_URL}${endpoint}`;
    try {
      const config = { headers: this._getHeaders() };
      const resp = method === 'GET'
        ? await this.axiosInstance.get(url, { ...config, params })
        : await this.axiosInstance.post(url, params, config);

      this.session.recordSuccessfulCall();

      // LoadxBet rolling cookie renewal on every response if set-cookie header present
      if (resp.headers && resp.headers['set-cookie']) {
        this.session.saveRefreshedCookies?.(resp.headers['set-cookie']);
      }

      return resp.data;
    } catch (err) {
      if (err.response) {
        const status = err.response.status;
        if (status === 401) {
          const count = this.session.record401Failure();
          console.warn(`⚠️  [TLL-Adapter] 401 on ${endpoint} (consecutive failure #${count})`);

          // Instant self-healing auto-login on 401 (retry once)
          if (!_isRetry) {
            console.log(`🔄 [TLL-Adapter] 401 encountered! Triggering instant auto-login for ${endpoint}...`);
            const ok = await this.session.autoLogin({ reason: `401 on ${endpoint}` });
            if (ok) {
              console.log(`✅ [TLL-Adapter] Auto-login succeeded! Retrying ${endpoint} with fresh cookie...`);
              return await this._request(endpoint, params, method, true);
            } else {
              console.warn(`❌ [TLL-Adapter] Auto-login failed during 401 recovery on ${endpoint}.`);
            }
          }
        }
        return { error: `HTTP ${status}`, upstreamStatus: status };
      }
      return { error: err.message };
    }
  }

  async getMatches() {
    const data = await this._request(ENDPOINTS.CRICKET_MATCHES);
    if (!Array.isArray(data) && !Array.isArray(data?.matches)) {
      return [];
    }
    const list = Array.isArray(data) ? data : data.matches;
    return list.map(m => createNormalizedMatch({ ...m, source: 'tennisliveload' }));
  }

  async getOdds(matchId) {
    const data = await this._request(ENDPOINTS.LIVE_ODDS, { matchId });
    if (!data || data.error) return null;
    return createNormalizedOdds(matchId, data);
  }

  async getSnapshot(matchId) {
    const data = await this._request(ENDPOINTS.CRICKET_SNAPSHOT, { matchId });
    if (!data || data.error) return null;
    return data;
  }

  async getTossMatches() {
    return this._request(ENDPOINTS.TOSS_MATCHES);
  }

  async getTossSnapshot(matchId) {
    return this._request(ENDPOINTS.TOSS_SNAPSHOT, { matchId });
  }

  async getSessionMatches() {
    return this._request(ENDPOINTS.SESSION_MATCHES);
  }

  async getSessionTrades(matchId) {
    return this._request(ENDPOINTS.SESSION_TRADES, { matchId });
  }

  async getTennisMatches() {
    return this._request(ENDPOINTS.TENNIS_MATCHES);
  }

  async getTennisSnapshot(matchId) {
    return this._request(ENDPOINTS.TENNIS_SNAPSHOT, { matchId });
  }

  async isHealthy() {
    return this.session.isConnected();
  }
}

module.exports = TennisLiveLoadAdapter;
