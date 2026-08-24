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

// Load: env cookies first, then disk
if (!_applyCookies(process.env.TENNIS_SESSION_COOKIES, 'TENNIS_SESSION_COOKIES env')) {
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      const saved = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
      if (saved.cookies && saved.expiry && Date.now() < saved.expiry) {
        _sessionCookies = saved.cookies;
        _sessionExpiry = saved.expiry;
        console.log('✅ tennisliveload: loaded saved session from disk');
      }
    }
  } catch {}
}

function _persist() {
  try { 
    fs.writeFileSync(COOKIES_FILE, JSON.stringify({ cookies: _sessionCookies, expiry: _sessionExpiry })); 
    // Also update env variable in memory so fallback always has latest
    process.env.TENNIS_SESSION_COOKIES = _sessionCookies;
  } catch {}
}

function isSessionValid() {
  return !!(_sessionCookies && _sessionExpiry && Date.now() < _sessionExpiry);
}

function getCookies() {
  return _sessionCookies;
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

// ──── AUTO-RELOGIN: Called when any API call gets 401 ────
// This is the magic — when scraper detects 401, it calls this.
// Multiple concurrent 401s will all wait on the same Promise (dedup).
async function autoRelogin() {
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
  if (_loginAttemptsToday >= 3) {
    console.log('⚠️  tennisliveload: daily login limit reached (3 attempts), skipping');
    return false;
  }

  if (!_storedEmail || !_storedPassword) {
    console.log('⚠️  tennisliveload: no credentials stored, cannot auto-relogin');
    return false;
  }

  // Start relogin — all concurrent callers will await this same promise
  _reloginInProgress = (async () => {
    _lastLoginAttempt = Date.now();
    _loginAttemptsToday++;
    console.log(`🔄 tennisliveload: auto-relogin attempt #${_loginAttemptsToday} today...`);

    try {
      await login(_storedEmail, _storedPassword);
      console.log('✅ tennisliveload: auto-relogin SUCCESS — new cookie active');
      return true;
    } catch (err) {
      if (/limit exceeded/i.test(err.message)) {
        console.log('⚠️  tennisliveload: login limit hit by upstream');
        // Mark that we've hit the upstream limit, stop trying today
        _loginAttemptsToday = 10; // effectively disable for today
      } else {
        console.error('❌ tennisliveload: auto-relogin failed:', err.message);
      }
      return false;
    } finally {
      _reloginInProgress = null;
    }
  })();

  return _reloginInProgress;
}

// ──── Startup ────
async function startAutoLogin() {
  const email = process.env.TENNIS_EMAIL;
  const password = process.env.TENNIS_PASSWORD;

  _storedEmail = email;
  _storedPassword = password;

  // If we have cookies, just use them — don't verify, don't login
  if (_sessionCookies) {
    console.log('✅ tennisliveload: using existing cookies (will auto-relogin on 401)');
    _startRetryLoop();
    return;
  }

  // No cookies at all — must login
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

  _startRetryLoop();
}

// ──── Background retry loop ────
// If cookie is dead AND auto-relogin failed (daily limit), keep trying every 2 hours.
// The daily limit resets at midnight, so eventually it will work.
function _startRetryLoop() {
  setInterval(async () => {
    // Only retry if we don't have a working cookie
    if (_sessionCookies) return; // We have cookies, they'll be validated on use

    _resetDailyCounterIfNeeded();
    if (_loginAttemptsToday >= 3) return; // Still over limit

    console.log('🔄 tennisliveload: background retry — attempting login...');
    await autoRelogin();
  }, 2 * 60 * 60 * 1000); // Every 2 hours
}

module.exports = { login, getCookies, isConnected, startAutoLogin, autoRelogin };
