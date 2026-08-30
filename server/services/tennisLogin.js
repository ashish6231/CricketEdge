const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TENNIS_BASE_URL || 'https://tennisliveload.com';
const LOGIN_URL = `${BASE_URL}/api/auth/login`;
const COOKIES_FILE = path.join(__dirname, '../tennis_cookies.json');
const COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ──── Single consistent browser fingerprint (anti-detection) ────
const FIXED_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

let _sessionCookies = null;
let _sessionExpiry = null;
let _storedEmail = null;
let _storedPassword = null;

// ──── Auto-Relogin State ────
let _reloginInProgress = null; // Promise when relogin is happening (dedup)
let _lastLoginAttempt = 0;
const LOGIN_COOLDOWN_MS = 10 * 60 * 1000; // Wait 10 min between login attempts (daily limit = 2)
let _loginAttemptsToday = 0;
let _loginAttemptResetDate = new Date().toDateString();

function _resetDailyCounterIfNeeded() {
  const today = new Date().toDateString();
  if (today !== _loginAttemptResetDate) {
    _loginAttemptsToday = 0;
    _loginAttemptResetDate = today;
    console.log('🔄 tennisliveload: daily login counter reset');
  }
}

function _applyCookies(raw, source) {
  const cookies = raw?.trim();
  if (!cookies) return false;
  _sessionCookies = cookies;
  _sessionExpiry = Date.now() + COOKIE_TTL_MS;
  console.log(`✅ tennisliveload: loaded session from ${source}`);
  return true;
}

// Load: disk first (contains freshest rolled cookie), fallback to env
let _loaded = false;
try {
  if (fs.existsSync(COOKIES_FILE)) {
    const saved = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    if (saved.cookies && saved.expiry && Date.now() < saved.expiry) {
      _sessionCookies = saved.cookies;
      _sessionExpiry = saved.expiry;
      _loaded = true;
      console.log('✅ tennisliveload: loaded saved rolling session from disk');
    }
  }
} catch {}

if (!_loaded) {
  _applyCookies(process.env.TENNIS_SESSION_COOKIES, 'TENNIS_SESSION_COOKIES env');
}

function _persist() {
  try { 
    fs.writeFileSync(COOKIES_FILE, JSON.stringify({ cookies: _sessionCookies, expiry: _sessionExpiry })); 
    process.env.TENNIS_SESSION_COOKIES = _sessionCookies;
  } catch {}
}

/**
 * Capture and merge any rolling cookies from upstream response headers
 */
function saveRefreshedCookies(setCookieHeader) {
  if (!setCookieHeader) return;
  const cookieList = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  if (!cookieList.length) return;

  const currentMap = new Map();
  if (_sessionCookies) {
    _sessionCookies.split(';').forEach(c => {
      const parts = c.trim().split('=');
      if (parts[0]) currentMap.set(parts[0], parts.slice(1).join('='));
    });
  }

  let updated = false;
  cookieList.forEach(raw => {
    const firstPart = raw.split(';')[0];
    const [name, ...valParts] = firstPart.trim().split('=');
    if (name && valParts.length) {
      const val = valParts.join('=');
      if (currentMap.get(name) !== val) {
        currentMap.set(name, val);
        updated = true;
      }
    }
  });

  if (updated) {
    const merged = Array.from(currentMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    _sessionCookies = merged;
    _sessionExpiry = Date.now() + COOKIE_TTL_MS;
    _persist();
    console.log('🔄 tennisliveload: captured and saved rolling refreshed cookie');
  }
}

function isSessionValid() {
  return !!(_sessionCookies && _sessionExpiry && Date.now() < _sessionExpiry);
}

function getCookies() {
  return _sessionCookies;
}

function updateCookies(newCookies) {
  if (!newCookies) return;
  _applyCookies(newCookies, 'manual update');
  _persist();
}

function isConnected() {
  return isSessionValid();
}

// ──── Login with same browser fingerprint ────
async function login(email, password) {
  const res = await axios.post(LOGIN_URL, { email, password }, {
    headers: _browserHeaders({ 'Content-Type': 'application/json' }),
    timeout: 10000,
    validateStatus: () => true,
  });

  if (res.status === 429) throw new Error(res.data?.error || 'Daily login limit exceeded');
  if (res.status === 401) throw new Error(res.data?.error || 'Invalid credentials');
  if (res.status !== 200) throw new Error(`Login failed: ${res.status}`);

  const setCookie = res.headers['set-cookie'];
  if (setCookie) {
    _sessionCookies = setCookie.map(c => c.split(';')[0]).join('; ');
  }

  _sessionExpiry = Date.now() + COOKIE_TTL_MS;
  _persist();
  console.log('✅ tennisliveload.com login successful — fresh cookie saved');
  return { success: true };
}

// ──── AUTO-RELOGIN (Disabled when using manual cookies) ────
async function autoRelogin() {
  const autoLoginEnabled = process.env.TENNIS_AUTO_LOGIN === 'true';
  if (!autoLoginEnabled) {
    console.log('ℹ️  tennisliveload: auto-login disabled — strictly using manual cookies');
    return false;
  }

  // If relogin is already in progress, wait for that one
  if (_reloginInProgress) {
    return _reloginInProgress;
  }

  // Cooldown — don't spam login attempts
  const now = Date.now();
  if ((now - _lastLoginAttempt) < LOGIN_COOLDOWN_MS) {
    console.log(`⏳ tennisliveload: login cooldown active, waiting ${Math.round((LOGIN_COOLDOWN_MS - (now - _lastLoginAttempt)) / 1000)}s`);
    return false;
  }

  // Daily limit check
  _resetDailyCounterIfNeeded();
  if (_loginAttemptsToday >= 2) {
    console.log('⚠️  tennisliveload: daily login limit reached, skipping');
    return false;
  }

  if (!_storedEmail || !_storedPassword) {
    console.log('⚠️  tennisliveload: no credentials stored, cannot auto-relogin');
    return false;
  }

  _reloginInProgress = (async () => {
    _lastLoginAttempt = Date.now();
    _loginAttemptsToday++;
    console.log(`🔄 tennisliveload: auto-relogin attempt #${_loginAttemptsToday} today...`);

    try {
      await login(_storedEmail, _storedPassword);
      console.log('✅ tennisliveload: auto-relogin SUCCESS — new cookie active');
      return true;
    } catch (err) {
      console.error('❌ tennisliveload: auto-relogin failed:', err.message);
      return false;
    } finally {
      _reloginInProgress = null;
    }
  })();

  return _reloginInProgress;
}

// ──── Startup ────
async function startAutoLogin() {
  const autoLoginEnabled = process.env.TENNIS_AUTO_LOGIN === 'true';

  // If we have cookies from env/disk, strictly use them
  if (_sessionCookies) {
    console.log('✅ tennisliveload: using manual session cookies (auto-login disabled)');
    return;
  }

  if (!autoLoginEnabled) {
    console.log('ℹ️  tennisliveload: manual cookie mode active — set TENNIS_SESSION_COOKIES in env');
    return;
  }

  const email = process.env.TENNIS_EMAIL;
  const password = process.env.TENNIS_PASSWORD;
  _storedEmail = email;
  _storedPassword = password;

  if (!email || !password) {
    console.log('⚠️  TENNIS_EMAIL / TENNIS_PASSWORD not set — skipped');
    return;
  }

  try {
    _lastLoginAttempt = Date.now();
    _loginAttemptsToday++;
    await login(email, password);
  } catch (err) {
    console.error('❌ tennisliveload: startup login failed:', err.message);
  }
}

module.exports = { login, getCookies, isConnected, startAutoLogin, autoRelogin, saveRefreshedCookies, updateCookies };
