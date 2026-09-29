/**
 * tennisliveload.com session manager
 * Manual cookie management only — no auto-login.
 * Cookie is persisted to MariaDB, disk, and env.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const prisma = require('../db/prisma');

const COOKIES_FILE = path.join(__dirname, '../tennis_cookies.json');
const ENV_FILE = path.join(__dirname, '../.env');

let _sessionCookies = (process.env.TENNIS_SESSION_COOKIES || '').trim().replace(/^\"|\"$/g, '');

function getCookies() {
  return (_sessionCookies || process.env.TENNIS_SESSION_COOKIES || '').trim().replace(/^\"|\"$/g, '');
}

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

function isConnected() {
  const cookie = getCookies();
  if (!cookie) return false;
  const msLeft = getCookieExpiryMs(cookie);
  return msLeft === -1 || msLeft > 0;
}

async function saveSession(newCookie) {
  if (!newCookie || typeof newCookie !== 'string') return;
  const trimmed = newCookie.trim();
  _sessionCookies = trimmed;
  process.env.TENNIS_SESSION_COOKIES = trimmed;

  const expiryMs = getCookieExpiryTimestamp(trimmed);

  try {
    if (prisma && typeof prisma.siteSettings?.upsert === 'function') {
      await prisma.siteSettings.upsert({
        where: { key: 'TENNIS_SESSION_COOKIES' },
        create: {
          key: 'TENNIS_SESSION_COOKIES',
          value: { cookie: trimmed, expiry: expiryMs, updatedAt: new Date().toISOString() },
          category: 'scraper',
          description: 'Active tennisliveload.com session cookie',
          isPublic: false,
        },
        update: {
          value: { cookie: trimmed, expiry: expiryMs, updatedAt: new Date().toISOString() },
        },
      });
      console.log('💾 tennisliveload: cookie saved to MariaDB');
    }
  } catch (err) {
    console.warn('⚠️  tennisliveload: failed to save cookie to DB:', err.message);
  }

  try {
    fs.writeFileSync(COOKIES_FILE, JSON.stringify({ cookies: trimmed, expiry: expiryMs }, null, 2), 'utf8');
  } catch {}

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
  } catch {}

  const msLeft = getCookieExpiryMs(trimmed);
  const hoursLeft = msLeft > 0 ? (msLeft / (1000 * 60 * 60)).toFixed(1) : 'unknown';
  console.log(`✅ tennisliveload: session updated (valid for ~${hoursLeft}h)`);
}

const ATTEMPTS_FILE = path.join(__dirname, '../tennis_login_attempts.json');

let _dailyAttemptsState = {
  date: _getTodayDateStr(),
  automatedAttempts: 0,
  emergencyAttempts: 0,
  lastAttemptAt: null,
};

function _getTodayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

async function _saveDailyAttempts() {
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

  try {
    fs.writeFileSync(ATTEMPTS_FILE, JSON.stringify(_dailyAttemptsState, null, 2), 'utf8');
  } catch {}
}

async function _loadDailyAttempts() {
  const today = _getTodayDateStr();
  try {
    if (prisma && typeof prisma.siteSettings?.findUnique === 'function') {
      const row = await prisma.siteSettings.findUnique({ where: { key: 'TENNIS_DAILY_ATTEMPTS' } });
      if (row?.value?.date === today) {
        _dailyAttemptsState = { ..._dailyAttemptsState, ...row.value };
        return;
      }
    }
  } catch {}

  try {
    if (fs.existsSync(ATTEMPTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ATTEMPTS_FILE, 'utf8'));
      if (data?.date === today) {
        _dailyAttemptsState = { ..._dailyAttemptsState, ...data };
      }
    }
  } catch {}
}

function canAutoLogin(isEmergency = false) {
  const today = _getTodayDateStr();
  if (_dailyAttemptsState.date !== today) {
    _dailyAttemptsState = {
      date: today,
      automatedAttempts: 0,
      emergencyAttempts: 0,
      lastAttemptAt: null,
    };
  }

  // STRICT RULE: Max 1 automated login per 24h!
  // The 2nd login is strictly reserved for manual emergency.
  if (!isEmergency) {
    return _dailyAttemptsState.automatedAttempts < 1;
  }
  return (_dailyAttemptsState.automatedAttempts + _dailyAttemptsState.emergencyAttempts) < 2;
}

function getLoginAttemptsStatus() {
  const today = _getTodayDateStr();
  if (_dailyAttemptsState.date !== today) {
    _dailyAttemptsState = {
      date: today,
      automatedAttempts: 0,
      emergencyAttempts: 0,
      lastAttemptAt: null,
    };
  }
  return {
    ..._dailyAttemptsState,
    totalToday: _dailyAttemptsState.automatedAttempts + _dailyAttemptsState.emergencyAttempts,
    remainingAuto: Math.max(0, 1 - _dailyAttemptsState.automatedAttempts),
    remainingTotal: Math.max(0, 2 - (_dailyAttemptsState.automatedAttempts + _dailyAttemptsState.emergencyAttempts)),
  };
}

async function loadSavedSession() {
  await _loadDailyAttempts();

  let dbCookie = null;
  try {
    if (prisma && typeof prisma.siteSettings?.findUnique === 'function') {
      const dbRow = await prisma.siteSettings.findUnique({ where: { key: 'TENNIS_SESSION_COOKIES' } });
      if (dbRow?.value?.cookie) dbCookie = String(dbRow.value.cookie).trim();
    }
  } catch {}

  const envCookie = (process.env.TENNIS_SESSION_COOKIES || '').trim().replace(/^\"|\"$/g, '');
  let fileCookie = null;
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      const fileData = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
      if (fileData?.cookies) fileCookie = String(fileData.cookies).trim();
    }
  } catch {}

  const candidates = [envCookie, dbCookie, fileCookie]
    .filter(Boolean)
    .map(c => ({ cookie: c, ts: getCookieExpiryTimestamp(c) || 0, msLeft: getCookieExpiryMs(c) }))
    .filter(c => c.msLeft === -1 || c.msLeft > 0);

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.ts - a.ts);
    const best = candidates[0].cookie;
    _sessionCookies = best;
    process.env.TENNIS_SESSION_COOKIES = best;
    if (best !== dbCookie) await saveSession(best);
    else console.log(`✅ tennisliveload: loaded valid session (${(candidates[0].msLeft / 3600000).toFixed(1)}h left)`);
  } else {
    if (canAutoLogin()) {
      console.warn('⚠️  tennisliveload: no valid session cookie found. Attempting automatic login (max 1/day)...');
      await autoLogin();
    } else {
      console.warn('⚠️  tennisliveload: no valid session cookie found and daily automated login limit reached. Update manually.');
    }
  }
}

let _loginPromise = null;
let _lastLoginAttempt = 0;

/**
 * Automated login to tennisliveload.com to refresh or restore session.
 * Features:
 * - Mutex: only 1 in-flight login at a time across all concurrent requests
 * - Strict Limit: Max 1 automated login per 24 hours (2nd reserved for emergency)
 * - Persistent attempt tracking in DB and disk
 */
async function autoLogin({ isEmergency = false } = {}) {
  if (_loginPromise) {
    return _loginPromise;
  }

  const email = process.env.TENNIS_EMAIL;
  const password = process.env.TENNIS_PASSWORD;

  if (!email || !password) {
    console.warn('⚠️  tennisliveload: cannot auto-login because TENNIS_EMAIL or TENNIS_PASSWORD is not configured in .env');
    return false;
  }

  if (!canAutoLogin(isEmergency)) {
    console.warn(`🛑 tennisliveload: Login blocked! Daily limit protected. (Used ${_dailyAttemptsState.automatedAttempts} auto, ${_dailyAttemptsState.emergencyAttempts} emergency). Max 2 allowed per 24h.`);
    return false;
  }

  const now = Date.now();
  if (now - _lastLoginAttempt < 60000) {
    console.warn('⚠️  tennisliveload: auto-login throttled (recent attempt within 60s)');
    return false;
  }

  _lastLoginAttempt = now;
  if (isEmergency) {
    _dailyAttemptsState.emergencyAttempts++;
  } else {
    _dailyAttemptsState.automatedAttempts++;
  }
  _dailyAttemptsState.lastAttemptAt = new Date().toISOString();
  await _saveDailyAttempts();

  _loginPromise = (async () => {
    try {
      console.log(`🔑 tennisliveload: attempting ${isEmergency ? 'EMERGENCY' : 'AUTOMATED'} login (try ${_dailyAttemptsState.automatedAttempts + _dailyAttemptsState.emergencyAttempts}/2 today)...`);
      const baseUrl = (process.env.TENNIS_BASE_URL || 'https://tennisliveload.com').replace(/\/$/, '');
      const res = await axios.post(
        `${baseUrl}/api/auth/login`,
        { email, password },
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': `${baseUrl}/login`,
            'Origin': baseUrl,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
          validateStatus: () => true,
        }
      );

      if (res.status === 200) {
        const setCookie = res.headers['set-cookie'];
        if (setCookie && setCookie.length) {
          let cookieString = '';
          for (const raw of (Array.isArray(setCookie) ? setCookie : [setCookie])) {
            const firstPart = String(raw).split(';')[0].trim();
            if (/^cricket_live_load_session=/i.test(firstPart)) {
              cookieString = firstPart;
              break;
            }
          }
          if (cookieString) {
            _consecutive401Count = 0;
            await saveSession(cookieString);
            console.log('🎉 tennisliveload: auto-login successful! Fresh rolling session captured.');
            return true;
          }
        }
      }
      console.warn(`❌ tennisliveload: auto-login failed with HTTP ${res.status}:`, res.data);
      return false;
    } catch (err) {
      console.error('❌ tennisliveload: auto-login request error:', err.message);
      return false;
    } finally {
      _loginPromise = null;
    }
  })();

  return _loginPromise;
}

let _consecutive401Count = 0;

function recordSuccessfulCall() {
  _consecutive401Count = 0;
}

function record401Failure() {
  _consecutive401Count++;
  return _consecutive401Count;
}

/**
 * Automatically capture rolling session cookies from upstream response headers
 * and persist them to DB and disk so the session never expires.
 */
function saveRefreshedCookies(setCookieHeader) {
  if (!setCookieHeader) return;
  const cookieList = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  if (!cookieList.length) return;

  let newSessionCookie = null;
  for (const raw of cookieList) {
    const firstPart = String(raw).split(';')[0].trim();
    if (/^cricket_live_load_session=/i.test(firstPart)) {
      newSessionCookie = firstPart;
      break;
    }
  }

  if (!newSessionCookie) return;

  const current = getCookies();
  if (current !== newSessionCookie) {
    const oldExpiry = getCookieExpiryTimestamp(current) || 0;
    const newExpiry = getCookieExpiryTimestamp(newSessionCookie) || 0;

    // Only update if new cookie is fresher
    if (newExpiry >= oldExpiry || !oldExpiry) {
      console.log('🔄 tennisliveload: capturing refreshed rolling session cookie...');
      saveSession(newSessionCookie).catch(err => {
        console.warn('⚠️  tennisliveload: error saving refreshed rolling cookie:', err.message);
      });
    }
  }
}

async function invalidateCookie(badCookie) {
  if (!badCookie) return;
  const current = getCookies();
  const cleaned = String(badCookie).replace(/^Cookie:\s*/i, '').trim();
  if (current && (current === cleaned || cleaned.includes(current) || current.includes(cleaned))) {
    console.warn(`⚠️  tennisliveload: cookie marked expired (${_consecutive401Count} consecutive 401s). Update manually via admin panel.`);
    _sessionCookies = '';
    process.env.TENNIS_SESSION_COOKIES = '';
    try {
      if (prisma && typeof prisma.siteSettings?.delete === 'function') {
        await prisma.siteSettings.delete({ where: { key: 'TENNIS_SESSION_COOKIES' } }).catch(() => {});
      }
    } catch {}
  }
}

async function updateCookiesManually(rawCookie) {
  if (!rawCookie || typeof rawCookie !== 'string') return false;
  _consecutive401Count = 0;
  await saveSession(rawCookie.trim());
  return true;
}

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

module.exports = {
  getCookies,
  isConnected,
  getCookieExpiryMs,
  getCookieExpiryTimestamp,
  saveSession,
  saveRefreshedCookies,
  recordSuccessfulCall,
  record401Failure,
  loadSavedSession,
  autoLogin,
  canAutoLogin,
  getLoginAttemptsStatus,
  getStatus,
  invalidateCookie,
  updateCookiesManually,
};
