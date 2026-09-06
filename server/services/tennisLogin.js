/**
 * tennisliveload.com session manager
 * 
 * Rules:
 * 1. STRICT 1-TRY DAILY LIMIT: Only 1 automated login attempt is permitted per day.
 *    The 2nd try is strictly preserved for emergency/manual use by the user.
 * 2. AUTOMATIC PRODUCTION PERSISTENCE: When a new cookie is obtained, it is automatically
 *    persisted to:
 *    - PostgreSQL DB (SiteSettings table via Prisma) -> Survives all cloud redeploys/restarts
 *    - server/tennis_cookies.json
 *    - server/.env (if file is writable)
 *    - Runtime process.env.TENNIS_SESSION_COOKIES & in-memory session
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const prisma = require('../db/prisma');

const BASE_URL = process.env.TENNIS_BASE_URL || 'https://tennisliveload.com';
const LOGIN_URL = `${BASE_URL}/api/auth/login`;
const COOKIES_FILE = path.join(__dirname, '../tennis_cookies.json');
const ENV_FILE = path.join(__dirname, '../.env');

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

let _sessionCookies = (process.env.TENNIS_SESSION_COOKIES || '').trim();
let _reloginInProgress = null;

// Track daily automated login attempts (STRICT MAX: 1 attempt per day)
// Stored in-memory and synced with DB/file so restarts on cloud don't reset counter
let _dailyAttemptsState = {
  date: _getTodayDateStr(),
  automatedAttempts: 0,
  emergencyAttempts: 0,
  lastAttemptAt: null,
};

function _getTodayDateStr() {
  // IST Date String for consistent 24h reset in Indian Standard Time (match schedules)
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

/** Check hapi/iron cookie expiry — returns ms until expiry, or -1 if unknown */
function getCookieExpiryMs(cookie = _sessionCookies) {
  if (!cookie) return 0;
  const parts = cookie.split('*');
  if (parts.length >= 6) {
    const expiry = parseInt(parts[5], 10);
    if (!isNaN(expiry) && expiry > 0) return Math.max(0, expiry - Date.now());
  }
  return -1;
}

function getCookieExpiryTimestamp(cookie = _sessionCookies) {
  if (!cookie) return null;
  const parts = cookie.split('*');
  if (parts.length >= 6) {
    const expiry = parseInt(parts[5], 10);
    if (!isNaN(expiry) && expiry > 0) return expiry;
  }
  return null;
}

function getCookies() {
  return (_sessionCookies || process.env.TENNIS_SESSION_COOKIES || '').trim();
}

function isConnected() {
  const cookie = getCookies();
  if (!cookie) return false;
  const msLeft = getCookieExpiryMs(cookie);
  return msLeft === -1 || msLeft > 0;
}

/**
 * Persists cookie across DB, disk, env, and memory
 */
async function saveSession(newCookie) {
  if (!newCookie || typeof newCookie !== 'string') return;
  const trimmed = newCookie.trim();
  _sessionCookies = trimmed;
  process.env.TENNIS_SESSION_COOKIES = trimmed;

  const expiryMs = getCookieExpiryTimestamp(trimmed);

  // 1. Save to PostgreSQL Database (SiteSettings) for persistent cloud deployments
  try {
    if (prisma && typeof prisma.siteSettings?.upsert === 'function') {
      await prisma.siteSettings.upsert({
        where: { key: 'TENNIS_SESSION_COOKIES' },
        create: {
          key: 'TENNIS_SESSION_COOKIES',
          value: {
            cookie: trimmed,
            expiry: expiryMs,
            updatedAt: new Date().toISOString(),
          },
          category: 'scraper',
          description: 'Active tennisliveload.com session cookie',
          isPublic: false,
        },
        update: {
          value: {
            cookie: trimmed,
            expiry: expiryMs,
            updatedAt: new Date().toISOString(),
          },
        },
      });
      console.log('💾 tennisliveload: cookie successfully saved to PostgreSQL database (SiteSettings)');
    }
  } catch (err) {
    console.warn('⚠️  tennisliveload: failed to save cookie to DB:', err.message);
  }

  // 2. Save to server/tennis_cookies.json
  try {
    fs.writeFileSync(COOKIES_FILE, JSON.stringify({ cookies: trimmed, expiry: expiryMs }, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️  tennisliveload: could not write to tennis_cookies.json:', err.message);
  }

  // 3. Save to server/.env (if file exists)
  try {
    if (fs.existsSync(ENV_FILE)) {
      let content = fs.readFileSync(ENV_FILE, 'utf8');
      if (/^TENNIS_SESSION_COOKIES=.*/m.test(content)) {
        content = content.replace(/^TENNIS_SESSION_COOKIES=.*/m, `TENNIS_SESSION_COOKIES=${trimmed}`);
      } else {
        content += `\nTENNIS_SESSION_COOKIES=${trimmed}\n`;
      }
      fs.writeFileSync(ENV_FILE, content, 'utf8');
    }
  } catch (err) {
    console.warn('⚠️  tennisliveload: could not write to .env:', err.message);
  }

  const msLeft = getCookieExpiryMs(trimmed);
  const hoursLeft = msLeft > 0 ? (msLeft / (1000 * 60 * 60)).toFixed(1) : 'unknown';
  console.log(`✅ tennisliveload: fresh session active (valid for ~${hoursLeft}h)`);
}

/**
 * Load latest session on startup from DB -> env -> disk
 */
async function loadSavedSession() {
  const today = _getTodayDateStr();
  if (_dailyAttemptsState.date !== today) {
    _dailyAttemptsState = {
      date: today,
      automatedAttempts: 0,
      emergencyAttempts: 0,
      lastAttemptAt: null,
    };
  }

  // 1. Try PostgreSQL DB first
  try {
    if (prisma && typeof prisma.siteSettings?.findUnique === 'function') {
      const dbRow = await prisma.siteSettings.findUnique({
        where: { key: 'TENNIS_SESSION_COOKIES' },
      });
      if (dbRow?.value?.cookie) {
        const dbCookie = String(dbRow.value.cookie).trim();
        const dbExpiry = getCookieExpiryMs(dbCookie);
        // If DB has a non-expired cookie, adopt it
        if (dbExpiry > 0 || dbExpiry === -1) {
          _sessionCookies = dbCookie;
          process.env.TENNIS_SESSION_COOKIES = dbCookie;
          console.log(`✅ tennisliveload: loaded valid session from PostgreSQL (expires in ${(dbExpiry / 3600000).toFixed(1)}h)`);
          return;
        }
      }

      // Also restore daily attempts state from DB if present
      const attemptsRow = await prisma.siteSettings.findUnique({
        where: { key: 'TENNIS_DAILY_ATTEMPTS' },
      });
      if (attemptsRow?.value?.date === today) {
        _dailyAttemptsState = { ..._dailyAttemptsState, ...attemptsRow.value };
      }
    }
  } catch (e) {
    // ignore DB connection startup errors
  }

  // 2. Try env variable
  const envCookie = (process.env.TENNIS_SESSION_COOKIES || '').trim();
  if (envCookie) {
    const envExpiry = getCookieExpiryMs(envCookie);
    if (envExpiry > 0 || envExpiry === -1) {
      _sessionCookies = envCookie;
      return;
    }
  }

  // 3. Try local file
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      const fileData = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
      if (fileData?.cookies) {
        const fileExpiry = getCookieExpiryMs(fileData.cookies);
        if (fileExpiry > 0 || fileExpiry === -1) {
          _sessionCookies = fileData.cookies;
          process.env.TENNIS_SESSION_COOKIES = fileData.cookies;
          return;
        }
      }
    }
  } catch {}
}

async function _saveDailyAttemptsToDb() {
  try {
    if (prisma && typeof prisma.siteSettings?.upsert === 'function') {
      await prisma.siteSettings.upsert({
        where: { key: 'TENNIS_DAILY_ATTEMPTS' },
        create: {
          key: 'TENNIS_DAILY_ATTEMPTS',
          value: _dailyAttemptsState,
          category: 'scraper',
          description: 'Tracks daily login attempts on tennisliveload.com (max 1 auto + 1 emergency)',
          isPublic: false,
        },
        update: {
          value: _dailyAttemptsState,
        },
      });
    }
  } catch {}
}

/**
 * Check if automated login can be attempted today
 */
function canAutoLogin() {
  const today = _getTodayDateStr();
  if (_dailyAttemptsState.date !== today) {
    _dailyAttemptsState = {
      date: today,
      automatedAttempts: 0,
      emergencyAttempts: 0,
      lastAttemptAt: null,
    };
  }

  // STRICT RULE: Max 1 automated attempt per day! 2nd attempt reserved for emergency.
  return _dailyAttemptsState.automatedAttempts < 1;
}

/**
 * Login execution with upstream credentials
 */
async function executeLogin({ isEmergency = false } = {}) {
  const email = process.env.TENNIS_EMAIL;
  const password = process.env.TENNIS_PASSWORD;

  if (!email || !password) {
    throw new Error('TENNIS_EMAIL or TENNIS_PASSWORD missing in env');
  }

  const today = _getTodayDateStr();
  if (_dailyAttemptsState.date !== today) {
    _dailyAttemptsState.date = today;
    _dailyAttemptsState.automatedAttempts = 0;
    _dailyAttemptsState.emergencyAttempts = 0;
  }

  if (!isEmergency && _dailyAttemptsState.automatedAttempts >= 1) {
    throw new Error('Daily automated login limit (1 try) already used. 2nd try is reserved for emergency.');
  }

  if (isEmergency && (_dailyAttemptsState.automatedAttempts + _dailyAttemptsState.emergencyAttempts) >= 2) {
    throw new Error('All 2 daily tries have been used today. Upstream will block further logins.');
  }

  // Record attempt before request to prevent double-spending on timeout/crash
  if (isEmergency) {
    _dailyAttemptsState.emergencyAttempts++;
  } else {
    _dailyAttemptsState.automatedAttempts++;
  }
  _dailyAttemptsState.lastAttemptAt = new Date().toISOString();
  await _saveDailyAttemptsToDb();

  console.log(`🔑 tennisliveload: attempting login (${isEmergency ? 'EMERGENCY TRY #2' : 'AUTOMATED TRY #1'})...`);

  try {
    const res = await axios.post(
      LOGIN_URL,
      { email, password },
      {
        headers: _browserHeaders({ 'Content-Type': 'application/json' }),
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    if (res.status === 429) {
      throw new Error(res.data?.error || res.data?.message || 'Daily login limit exceeded upstream');
    }

    if (res.status === 401) {
      throw new Error(res.data?.error || res.data?.message || 'Invalid credentials');
    }

    if (res.status !== 200) {
      throw new Error(`Login failed with HTTP ${res.status}: ${JSON.stringify(res.data || {})}`);
    }

    const setCookie = res.headers['set-cookie'];
    if (!setCookie || !setCookie.length) {
      throw new Error('Login succeeded but no set-cookie header received');
    }

    // Extract cookie
    let cookieString = setCookie.map(c => c.split(';')[0]).join('; ');
    if (!cookieString.includes('cricket_live_load_session=')) {
      const match = cookieString.match(/(cricket_live_load_session=Fe26\.2[^\s;]+)/);
      if (match) cookieString = match[1];
    }

    await saveSession(cookieString);
    return { success: true, cookies: cookieString };
  } catch (err) {
    console.error('❌ tennisliveload: login attempt failed:', err.message);
    throw err;
  }
}

/**
 * Called on 401 from scraper: Uses the single daily automated attempt
 */
async function autoRelogin() {
  // If relogin is already running, deduplicate callers
  if (_reloginInProgress) {
    return _reloginInProgress;
  }

  if (!canAutoLogin()) {
    console.warn('⚠️  tennisliveload: 1 automated login already used today. 2nd try is reserved for manual/emergency use.');
    return false;
  }

  _reloginInProgress = (async () => {
    try {
      const res = await executeLogin({ isEmergency: false });
      return Boolean(res?.success);
    } catch (err) {
      return false;
    } finally {
      _reloginInProgress = null;
    }
  })();

  return _reloginInProgress;
}

/**
 * Explicit trigger for the 2nd emergency try (via admin API)
 */
async function triggerEmergencyLogin() {
  return executeLogin({ isEmergency: true });
}

/**
 * Manual update: user pastes cookie directly from browser
 */
async function updateCookiesManually(rawCookie) {
  if (!rawCookie || typeof rawCookie !== 'string') return false;
  await saveSession(rawCookie.trim());
  return true;
}

/**
 * Status report for Admin UI / logs
 */
function getStatus() {
  const cookie = getCookies();
  const msLeft = getCookieExpiryMs(cookie);
  const expiryTimestamp = getCookieExpiryTimestamp(cookie);
  const hoursLeft = msLeft > 0 ? (msLeft / (1000 * 60 * 60)).toFixed(1) : (msLeft === 0 ? '0 (Expired)' : 'Unknown');

  return {
    isConnected: isConnected(),
    hoursLeft,
    msLeft,
    expiryTimestamp,
    dailyAttemptsDate: _dailyAttemptsState.date,
    automatedAttemptsUsed: _dailyAttemptsState.automatedAttempts,
    emergencyAttemptsUsed: _dailyAttemptsState.emergencyAttempts,
    maxAutomatedAttempts: 1,
    emergencyTryAvailable: (_dailyAttemptsState.automatedAttempts + _dailyAttemptsState.emergencyAttempts) < 2,
    hasCredentials: Boolean(process.env.TENNIS_EMAIL && process.env.TENNIS_PASSWORD),
  };
}

/**
 * Startup checks
 */
async function startAutoLogin() {
  await loadSavedSession();
  const status = getStatus();

  console.log(`ℹ️  tennisliveload session status: ${status.isConnected ? 'CONNECTED' : 'EXPIRED/DISCONNECTED'} (${status.hoursLeft}h left)`);
  console.log(`ℹ️  tennisliveload daily attempts: ${status.automatedAttemptsUsed}/1 automated used | Emergency try available: ${status.emergencyTryAvailable}`);

  // If cookie is expired on boot and automated attempt is available, run the 1 try
  if (!status.isConnected && canAutoLogin() && status.hasCredentials) {
    console.log('🔄 tennisliveload: cookie is expired on startup — using daily automated try (1/1)...');
    try {
      await autoRelogin();
    } catch {}
  }
}

module.exports = {
  getCookies,
  isConnected,
  getCookieExpiryMs,
  getCookieExpiryTimestamp,
  saveSession,
  loadSavedSession,
  canAutoLogin,
  autoRelogin,
  triggerEmergencyLogin,
  updateCookiesManually,
  getStatus,
  startAutoLogin,
  _browserHeaders,
};
