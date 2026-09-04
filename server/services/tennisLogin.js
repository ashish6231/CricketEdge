/**
 * tennisliveload.com session — strictly manual cookie from env.
 * No auto-login, no stored credentials, no file persistence.
 */

const BASE_URL = process.env.TENNIS_BASE_URL || 'https://tennisliveload.com';

const FIXED_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function _browserHeaders(extraHeaders = {}) {
  return {
    'User-Agent': FIXED_USER_AGENT,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL,
    'Connection': 'keep-alive',
    ...extraHeaders,
  };
}

function getCookies() {
  return (process.env.TENNIS_SESSION_COOKIES || '').trim();
}

function isConnected() {
  return Boolean(getCookies());
}

/** Check hapi/iron cookie expiry — returns ms until expiry, or 0 if expired/unknown */
function getCookieExpiryMs() {
  const cookie = getCookies();
  if (!cookie) return 0;
  // hapi/iron format: Fe26.2*...*TIMESTAMP*...
  const parts = cookie.split('*');
  if (parts.length >= 6) {
    const expiry = parseInt(parts[5]);
    if (!isNaN(expiry) && expiry > 0) return Math.max(0, expiry - Date.now());
  }
  return -1; // unknown format, assume valid
}

function startAutoLogin() {
  console.log('ℹ️  tennisliveload: using manual cookie from TENNIS_SESSION_COOKIES env');
  // Warn if cookie expires within 3 days
  const msLeft = getCookieExpiryMs();
  if (msLeft === 0) {
    console.warn('🔴 tennisliveload: TENNIS_SESSION_COOKIES is EXPIRED — update it in env!');
  } else if (msLeft > 0) {
    const daysLeft = (msLeft / (1000 * 60 * 60 * 24)).toFixed(1);
    if (msLeft < 3 * 24 * 60 * 60 * 1000) {
      console.warn(`🟡 tennisliveload: cookie expires in ${daysLeft} days — update TENNIS_SESSION_COOKIES soon!`);
    } else {
      console.log(`✅ tennisliveload: cookie valid for ${daysLeft} more days`);
    }
  }
}

async function autoRelogin() {
  return false;
}

module.exports = { getCookies, isConnected, getCookieExpiryMs, startAutoLogin, autoRelogin, _browserHeaders };
