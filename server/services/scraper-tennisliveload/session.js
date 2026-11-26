/**
 * services/scraper-tennisliveload/session.js
 * TennisLiveLoad Session Manager
 *
 * Implements:
 * 1. Single Source of Truth: MariaDB Database (`SiteSettings` table) ONLY.
 *    - Strictly removed all reading and writing from/to .env.
 *    - Redeploys will never overwrite DB with stale env cookies.
 * 2. Instant Auto-Login on 401:
 *    - When a 401 occurs, calls https://tennisliveload.com/api/auth/login.
 *    - Captures fresh 24h cricket_live_load_session and persists to DB.
 * 3. Single-Flight Mutex:
 *    - Concurrent requests hitting 401 share 1 single in-flight login promise.
 * 4. Fixed browser fingerprint (User-Agent & headers).
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const prisma = require('../../db/prisma');
const { getRedisClient, acquireLock, refreshLock, releaseLock } = require('../../shared/redis');

const COOKIES_FILE = process.env.TLL_COOKIES_FILE || path.join(__dirname, '../../tennis_cookies.json');
const LOCK_KEY = 'scraper:tll:lock';
const LOCK_TTL_SEC = 30;

const FIXED_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let _sessionCookies = '';
let _heartbeatTimer = null;
let _isLockHolder = false;
let _consecutive401Count = 0;
let _loginPromise = null;
let _lastLoginAttemptAt = 0;
let _lastLoginError = null;
let _lastDbSyncAt = 0;

function normalizeSessionCookie(value) {
  let cookie = String(value || '').trim().replace(/^"|"$/g, '')
    .replace(/^Cookie:\s*/i, '').replace(/\\([*~])/g, '$1');
  if (!cookie) return '';
  const namedCookie = cookie.split(';').map(part => part.trim())
    .find(part => /^cricket_live_load_session=/i.test(part));
  if (namedCookie) return namedCookie;
  return `cricket_live_load_session=${cookie}`;
}

function getCookies() {
  return normalizeSessionCookie(_sessionCookies);
}

function getFixedUserAgent() {
  return FIXED_USER_AGENT;
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

/**
 * Save session ONLY to MariaDB Database (and in-memory + optional redis cache).
 * Strictly NEVER writes to .env!
 */
async function saveSession(newCookie) {
  if (!newCookie || typeof newCookie !== 'string') return;
  const trimmed = normalizeSessionCookie(newCookie);
  if (!trimmed) return;
  _sessionCookies = trimmed;
  _consecutive401Count = 0;
  _lastLoginError = null;
  _lastDbSyncAt = Date.now();

  const expiryMs = getCookieExpiryTimestamp(trimmed);

  // 1. Save to MariaDB (Single Source of Truth)
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
      console.log('💾 [TLL-Session] cookie persisted to MariaDB Database');
    }
  } catch (err) {
    console.warn('⚠️  [TLL-Session] failed to save cookie to DB:', err.message);
  }

  // 2. Cache in Redis (if available)
  try {
    const redis = getRedisClient();
    await redis.set('tll:session:cookies', trimmed, 'EX', 86400 * 2);
  } catch {}

  // 3. Non-blocking local disk backup for offline debugging
  try {
    fs.writeFileSync(COOKIES_FILE, JSON.stringify({ cookies: trimmed, expiry: expiryMs, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  } catch {}

  const msLeft = getCookieExpiryMs(trimmed);
  const hoursLeft = msLeft > 0 ? (msLeft / (1000 * 60 * 60)).toFixed(1) : 'unknown';
  console.log(`✅ [TLL-Session] session updated (valid for ~${hoursLeft}h)`);
}

async function readSessionRowFromDb({ retries = 1 } = {}) {
  if (!prisma || typeof prisma.siteSettings?.findUnique !== 'function') return { ok: false, row: null };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const row = await prisma.siteSettings.findUnique({ where: { key: 'TENNIS_SESSION_COOKIES' } });
      const cookie = row?.value?.cookie ? normalizeSessionCookie(row.value.cookie) : '';
      return { ok: true, row, cookie };
    } catch (err) {
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
      } else {
        console.warn('⚠️  [TLL-Session] failed to query DB for cookie:', err.message);
      }
    }
  }
  return { ok: false, row: null, cookie: '' };
}

/**
 * Pull any newer/different valid cookie stored in MariaDB (e.g. saved by another
 * process/deploy or via the admin panel) into memory before triggering auto-login.
 */
async function syncSessionFromDb({ excludeCookie = '' } = {}) {
  const excluded = normalizeSessionCookie(excludeCookie);
  const { ok, cookie } = await readSessionRowFromDb({ retries: 0 });
  if (!ok) return false;
  _lastDbSyncAt = Date.now();
  if (!cookie) return false;
  const msLeft = getCookieExpiryMs(cookie);
  if (msLeft === 0) return false;

  const current = getCookies();
  if (cookie === current && (!excluded || cookie !== excluded)) return true;
  if (!excluded || cookie !== excluded) {
    _sessionCookies = cookie;
    _consecutive401Count = 0;
    _lastLoginError = null;
    console.log('🔄 [TLL-Session] synced newer session cookie from MariaDB Database');
    return true;
  }
  return false;
}

async function syncFromDbIfStale(maxAgeMs = 60000) {
  if (Date.now() - _lastDbSyncAt < maxAgeMs) return false;
  return syncSessionFromDb();
}

/**
 * Load session strictly from MariaDB Database.
 * If expired or missing, triggers auto-login.
 */
async function loadSavedSession() {
  const { ok: dbOk, cookie: dbCookie } = await readSessionRowFromDb({ retries: 2 });
  if (dbOk) _lastDbSyncAt = Date.now();

  // Fallback to local disk file only if DB query returned nothing
  let fileCookie = null;
  if (!dbCookie) {
    try {
      if (fs.existsSync(COOKIES_FILE)) {
        const fileData = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
        if (fileData?.cookies) fileCookie = String(fileData.cookies).trim().replace(/^"|"$/g, '');
      }
    } catch {}
  }

  const candidate = normalizeSessionCookie(dbCookie || fileCookie);
  if (candidate) {
    const msLeft = getCookieExpiryMs(candidate);
    if (msLeft === -1 || msLeft > 0) {
      _sessionCookies = candidate;
      _consecutive401Count = 0;
      if (dbCookie && dbCookie !== candidate) await saveSession(candidate);
      console.log(`✅ [TLL-Session] loaded valid session from Database (~${(msLeft > 0 ? (msLeft / 3600000).toFixed(1) : 'unknown')}h left)`);
      return true;
    }
    console.warn('⚠️  [TLL-Session] cookie in Database is expired. Triggering auto-login...');
  } else {
    console.warn('⚠️  [TLL-Session] no cookie found in Database. Triggering auto-login...');
  }

  // If DB was unreachable and file fallback had nothing valid, avoid unnecessary login churn unless allowed.
  return await autoLogin({ reason: dbOk ? 'startup_missing_or_expired' : 'startup_db_unavailable' });
}

/**
 * Automated Login Engine (Mutexed & DB-Coordinated)
 * Triggers when 401 occurs, on startup if expired/missing, or right before expiry.
 */
async function autoLogin({ reason = '401', failedCookie = '' } = {}) {
  // If already logging in, wait for existing promise
  if (_loginPromise) {
    console.log(`⏳ [TLL-Session] autoLogin already in progress (waiting on same promise, reason: ${reason})...`);
    return _loginPromise;
  }

  const failedNorm = normalizeSessionCookie(failedCookie);
  const currentNorm = getCookies();
  if (failedNorm && currentNorm && currentNorm !== failedNorm && isConnected()) {
    _consecutive401Count = 0;
    return true;
  }

  const email = process.env.TENNIS_EMAIL;
  const password = process.env.TENNIS_PASSWORD;

  if (!email || !password) {
    console.warn('⚠️  [TLL-Session] cannot auto-login: TENNIS_EMAIL or TENNIS_PASSWORD is not configured in environment.');
    _lastLoginError = 'TENNIS_EMAIL or TENNIS_PASSWORD not configured';
    return false;
  }

  // Anti-hammer: do not call login endpoint more than once every 10 seconds
  const now = Date.now();
  if (now - _lastLoginAttemptAt < 10000) {
    console.warn('⚠️  [TLL-Session] auto-login throttled (<10s since last attempt).');
    return false;
  }

  _lastLoginAttemptAt = now;

  _loginPromise = (async () => {
    try {
      // Cross-process guard: when recovering a failed cookie, check if another process already saved a fresh one.
      if (failedNorm && await syncSessionFromDb({ excludeCookie: failedNorm })) {
        console.log('♻️  [TLL-Session] reused fresh cookie already saved in MariaDB by another process.');
        return true;
      }

      console.log(`🔑 [TLL-Session] executing automated login to tennisliveload.com (reason: ${reason})...`);
      const baseUrl = (process.env.TENNIS_BASE_URL || 'https://tennisliveload.com').replace(/\/$/, '');

      const res = await axios.post(
        `${baseUrl}/api/auth/login`,
        { email, password },
        {
          headers: {
            'User-Agent': FIXED_USER_AGENT,
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
          let newCookieStr = '';
          const list = Array.isArray(setCookie) ? setCookie : [setCookie];
          for (const raw of list) {
            const firstPart = String(raw).split(';')[0].trim();
            if (/^cricket_live_load_session=/i.test(firstPart)) {
              newCookieStr = firstPart;
              break;
            }
          }

          if (newCookieStr) {
            _consecutive401Count = 0;
            _lastLoginError = null;
            await saveSession(newCookieStr);
            console.log('🎉 [TLL-Session] auto-login successful! Fresh 24h session saved to MariaDB Database.');
            return true;
          }
        }
        _lastLoginError = 'No cricket_live_load_session in set-cookie headers';
        console.warn('⚠️  [TLL-Session] login succeeded but set-cookie did not contain cricket_live_load_session');
        return false;
      }

      _lastLoginError = `HTTP ${res.status}: ${JSON.stringify(res.data || {})}`;
      console.warn(`❌ [TLL-Session] auto-login failed with HTTP ${res.status}:`, res.data);
      return false;
    } catch (err) {
      _lastLoginError = err.message;
      console.error('❌ [TLL-Session] auto-login network error:', err.message);
      return false;
    } finally {
      _loginPromise = null;
    }
  })();

  return _loginPromise;
}

function recordSuccessfulCall() {
  _consecutive401Count = 0;
}

function record401Failure() {
  _consecutive401Count++;
  return _consecutive401Count;
}

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

    if (newExpiry >= oldExpiry || !oldExpiry) {
      console.log('🔄 [TLL-Session] capturing refreshed rolling session cookie...');
      saveSession(newSessionCookie).catch(() => {});
    }
  }
}

async function acquireSingletonLock(timeoutMs = 60000) {
  const pid = `${process.pid}-${Date.now()}`;
  const start = Date.now();

  console.log('🔒 [TLL-Session] acquiring singleton scraper lock...');
  while (Date.now() - start < timeoutMs) {
    const acquired = await acquireLock(LOCK_KEY, LOCK_TTL_SEC, pid);
    if (acquired) {
      _isLockHolder = true;
      console.log('👑 [TLL-Session] singleton lock acquired! Active scraper process:', pid);

      // Setup heartbeat to refresh lock every 10s
      if (_heartbeatTimer) clearInterval(_heartbeatTimer);
      _heartbeatTimer = setInterval(async () => {
        if (_isLockHolder) {
          await refreshLock(LOCK_KEY, LOCK_TTL_SEC, pid);
        }
      }, 10000);

      // Clean release on shutdown
      const cleanup = async () => {
        if (_isLockHolder) {
          console.log('👋 [TLL-Session] releasing singleton lock on shutdown...');
          _isLockHolder = false;
          if (_heartbeatTimer) clearInterval(_heartbeatTimer);
          await releaseLock(LOCK_KEY, pid);
        }
      };

      process.once('SIGTERM', async () => {
        await cleanup();
        process.exit(0);
      });
      process.once('SIGINT', async () => {
        await cleanup();
        process.exit(0);
      });

      return true;
    }

    // Wait 1s and retry
    await new Promise(r => setTimeout(r, 1000));
  }

  console.warn('⚠️  [TLL-Session] could not acquire singleton lock within timeout. Running in standby.');
  return false;
}

function isSingletonLeader() {
  return _isLockHolder;
}

function getStatus() {
  const cookie = getCookies();
  const msLeft = getCookieExpiryMs(cookie);
  const expiryTimestamp = getCookieExpiryTimestamp(cookie);
  const connected = isConnected() && _consecutive401Count === 0;
  const hoursLeft = _consecutive401Count > 0
    ? '0'
    : msLeft > 0 ? (msLeft / (1000 * 60 * 60)).toFixed(1) : (msLeft === 0 ? '0 (Expired)' : 'Unknown');

  return {
    isConnected: connected,
    hoursLeft,
    msLeft: connected ? msLeft : 0,
    expiryTimestamp,
    hasCredentials: Boolean(process.env.TENNIS_EMAIL && process.env.TENNIS_PASSWORD),
    consecutive401s: _consecutive401Count,
    source: 'MariaDB Database',
    lastLoginAttemptAt: _lastLoginAttemptAt ? new Date(_lastLoginAttemptAt).toISOString() : null,
    lastLoginError: _lastLoginError,
    // Compat for AdminSettings.jsx UI metrics:
    automatedAttemptsUsed: 0,
    emergencyTryAvailable: true,
  };
}

module.exports = {
  getCookies,
  getFixedUserAgent,
  isConnected,
  getCookieExpiryMs,
  getCookieExpiryTimestamp,
  saveSession,
  syncSessionFromDb,
  syncFromDbIfStale,
  loadSavedSession,
  autoLogin,
  saveRefreshedCookies,
  recordSuccessfulCall,
  record401Failure,
  acquireSingletonLock,
  isSingletonLeader,
  getStatus,
};
