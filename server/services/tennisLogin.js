const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TENNIS_BASE_URL || 'https://tennisliveload.com';
const LOGIN_URL = `${BASE_URL}/api/auth/login`;
const COOKIES_FILE = path.join(__dirname, '../tennis_cookies.json');

let _sessionCookies = null;
let _sessionExpiry = null;
let _storedEmail = null;
let _storedPassword = null;

// Load persisted cookies on startup
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

function _persist() {
  try { fs.writeFileSync(COOKIES_FILE, JSON.stringify({ cookies: _sessionCookies, expiry: _sessionExpiry })); } catch {}
}

function isSessionValid() {
  return !!(_sessionCookies && _sessionExpiry && Date.now() < _sessionExpiry);
}

// Verify session is actually valid by calling a lightweight API
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

  _sessionExpiry = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
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

  if (!email || !password) {
    console.log('⚠️  TENNIS_EMAIL / TENNIS_PASSWORD not set — skipped');
    return;
  }

  _storedEmail = email;
  _storedPassword = password;

  // If we have cookies, verify they still work on the actual site
  if (isSessionValid()) {
    const ok = await _verifySession();
    if (ok) {
      console.log('✅ tennisliveload: session verified, skipping login');
      _startRefreshLoop();
      return;
    }
    console.log('⚠️  tennisliveload: saved session invalid, re-logging in...');
  }

  try {
    await login(email, password);
  } catch (err) {
    console.error('❌ tennisliveload login failed:', err.message);
  }

  _startRefreshLoop();
}

function _startRefreshLoop() {
  // Check every hour — re-login only if session actually expired/invalid
  setInterval(async () => {
    if (isSessionValid()) return;
    console.log('🔄 tennisliveload: session expired, re-logging in...');
    try {
      await login(_storedEmail, _storedPassword);
    } catch (err) {
      console.error('❌ tennisliveload re-login failed:', err.message);
    }
  }, 60 * 60 * 1000);
}

module.exports = { login, getCookies, isConnected, startAutoLogin };
