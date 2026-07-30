const axios = require('axios');
const prisma = require('../db/prisma');

const BASE_URL = process.env.TENNIS_BASE_URL || 'https://tennisliveload.com';
const LOGIN_URL = `${BASE_URL}/api/auth/login`;
const SETTINGS_KEY = 'tennisSession';

let _sessionCookies = null;
let _sessionExpiry = null;
let _storedEmail = null;
let _storedPassword = null;

async function _loadFromDb() {
  try {
    const row = await prisma.siteSettings.findUnique({ where: { key: SETTINGS_KEY } });
    if (row?.value) {
      const saved = row.value;
      if (saved.cookies && saved.expiry && Date.now() < saved.expiry) {
        _sessionCookies = saved.cookies;
        _sessionExpiry = saved.expiry;
        console.log('✅ tennisliveload: loaded saved session from DB');
        return true;
      }
    }
  } catch {}
  return false;
}

async function _persist() {
  try {
    const data = { cookies: _sessionCookies, expiry: _sessionExpiry };
    await prisma.siteSettings.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: data },
      create: { key: SETTINGS_KEY, value: data, category: 'internal', description: 'Tennis session cookies' }
    });
  } catch {}
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

  _sessionExpiry = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
  await _persist();
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

  await _loadFromDb();

  if (isSessionValid()) {
    const ok = await _verifySession();
    if (ok) {
      console.log('✅ tennisliveload: session verified, skipping login');
      return;
    }
    console.log('⚠️  tennisliveload: saved session invalid, will retry later');
    return;
  }

  try {
    await login(email, password);
  } catch (err) {
    console.error('❌ tennisliveload login failed:', err.message);
  }
}

// Called by cron or on-demand to refresh if expired
async function refreshIfNeeded() {
  if (!_storedEmail) {
    _storedEmail = process.env.TENNIS_EMAIL;
    _storedPassword = process.env.TENNIS_PASSWORD;
  }
  if (!_storedEmail || !_storedPassword) return;

  if (!isSessionValid()) {
    await _loadFromDb();
  }
  if (isSessionValid()) return;

  try {
    await login(_storedEmail, _storedPassword);
  } catch (err) {
    console.error('❌ tennisliveload re-login failed:', err.message);
  }
}

module.exports = { login, getCookies, isConnected, startAutoLogin, refreshIfNeeded };
