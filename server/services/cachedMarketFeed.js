const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');

// Read-only client for manual backfills and the standalone capture worker.
// Deliberately does not import the session manager, which can auto-login.
function createCachedMarketFeed({ getCookie, http = axios } = {}) {
  const baseURL = (process.env.TENNIS_BASE_URL || 'https://tennisliveload.com').replace(/\/$/, '');
  let rejectedCookie = null;
  async function request(endpoint, params) {
    let cookie = (getCookie ? getCookie() : '') || process.env.TENNIS_SESSION_COOKIES || '';
    if (!cookie) {
      try { cookie = JSON.parse(fs.readFileSync(path.join(__dirname, '../tennis_cookies.json'), 'utf8')).cookies || ''; }
      catch { /* Missing cache is reported without logging in. */ }
    }
    if (typeof cookie !== 'string' || !cookie.trim()) return { error: 'Cached market session unavailable' };
    const expiry = parseInt(cookie.split('*')[5], 10);
    if (expiry > 0 && expiry <= Date.now()) return { error: 'Cached market session expired' };
    if (cookie === rejectedCookie) return { error: 'Cached market session rejected; waiting for a refreshed session' };
    try {
      const response = await http.get(`${baseURL}${endpoint}`, { params, timeout: 12000,
        headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json', Origin: baseURL, Referer: `${baseURL}/` } });
      return response.data;
    } catch (error) {
      if ([401, 403].includes(error.response?.status)) rejectedCookie = cookie;
      return { error: error.response ? `Market feed HTTP ${error.response.status}` : 'Market feed unavailable' };
    }
  }
  return { getCricketMatches: () => request('/api/cricket/matches'),
    getCricketSnapshot: matchId => request('/api/cricket/snapshot', { matchId }),
    getTossSnapshot: matchId => request('/api/toss/snapshot', { matchId }) };
}
module.exports = { createCachedMarketFeed };
