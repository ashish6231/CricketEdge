const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TENNIS_BASE_URL || 'https://tennisliveload.com';
const LOGIN_URL = `${BASE_URL}/api/auth/login`;
const COOKIES_FILE = path.join(__dirname, '../tennis_cookies.json');
const COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let _sessionCookies = null;
let _sessionExpiry = null;
let _storedEmail = null;
let _storedPassword = null;

function _applyCookies(raw, source) {
  const cookies = raw?.trim();
  if (!cookies) return false;
  _sessionCookies = cookies;
  _sessionExpiry = Date.now() + COOKIE_TTL_MS;
  console.log(`✅ tennisliveload: loaded session from ${source}`);
  return true;
}

// Env cookies first (Railway redeploy), then disk
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
  try { fs.writeFileSync(COOKIES_FILE, JSON.stringify({ cookies: _sessionCookies, expiry: _sessionExpiry })); } catch {}
}

function isSessionValid() {
  return !!(_sessionCookies && _sessionExpiry && Date.now() < _sessionExpiry);
}

async function _verifySession() {
  if (!_sessionCookies) return false;
  try {
    const res = await axios.get(`${BASE_URL}/api/auth/session`, {
      headers: { Cookie: _sessionCookies, Accept: 'application/json' },
      timeout: 8000,
    });
    return res.status === 200 && res.data?.isLoggedIn !== false;
  } catch {
    return false;
  }
}

async function login(email, password) {
  const res = await axios.post(LOGIN_URL, { email, password }, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
  console.log('✅ tennisliveload.com login successful');
  return { success: true };
}

function getCookies() {
  return _sessionCookies;
}

function isConnected() {
  return isSessionValid();
}

async function startAutoLogin() {
  const email = process.env.TENNIS_EMAIL;
  const password = process.env.TENNIS_PASSWORD;

  if (_sessionCookies) {
    const ok = await _verifySession();
    if (ok) {
      console.log('✅ tennisliveload: session verified, skipping login');
      _startRefreshLoop(email, password);
      return;
    }
    console.log('⚠️  tennisliveload: saved cookies invalid or expired');
  }

  if (!email || !password) {
    console.log('⚠️  TENNIS_EMAIL / TENNIS_PASSWORD not set — skipped');
    return;
  }

  _storedEmail = email;
  _storedPassword = password;

  try {
    await login(email, password);
  } catch (err) {
    const limitHit = /limit exceeded/i.test(err.message);
    if (limitHit && process.env.TENNIS_SESSION_COOKIES?.trim()) {
      _applyCookies(process.env.TENNIS_SESSION_COOKIES, 'TENNIS_SESSION_COOKIES (login limit fallback)');
      console.log('⚠️  tennisliveload: login limit hit — using env cookies without new login');
    } else {
      console.error('❌ tennisliveload login failed:', err.message);
    }
  }

  _startRefreshLoop(email, password);
}

function _startRefreshLoop(email, password) {
  _storedEmail = email || _storedEmail;
  _storedPassword = password || _storedPassword;

  setInterval(async () => {
    if (_sessionCookies) {
      const ok = await _verifySession();
      if (ok) return;
    }
    if (!_storedEmail || !_storedPassword) return;

    console.log('🔄 tennisliveload: session expired, re-logging in...');
    try {
      await login(_storedEmail, _storedPassword);
    } catch (err) {
      if (/limit exceeded/i.test(err.message) && process.env.TENNIS_SESSION_COOKIES?.trim()) {
        _applyCookies(process.env.TENNIS_SESSION_COOKIES, 'TENNIS_SESSION_COOKIES (re-login limit fallback)');
        console.log('⚠️  tennisliveload: re-login blocked by daily limit — reusing env cookies');
      } else {
        console.error('❌ tennisliveload re-login failed:', err.message);
      }
    }
  }, 60 * 60 * 1000);
}

module.exports = { login, getCookies, isConnected, startAutoLogin };
