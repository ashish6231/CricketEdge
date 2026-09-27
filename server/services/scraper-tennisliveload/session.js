/**
 * services/scraper-tennisliveload/session.js
 * TennisLiveLoad Singleton Session Manager
 *
 * Implements:
 * 1. Redis Singleton Lock with graceful deploy handoff (prevents multi-device ban)
 * 2. Rolling Session Token persistence (LoadxBet technique: extends +24h on every scrape)
 * 3. Multi-layer storage (Redis -> PostgreSQL -> File -> Process memory)
 * 4. Fixed browser fingerprint (User-Agent & headers)
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../../db/prisma');
const { getRedisClient, acquireLock, refreshLock, releaseLock } = require('../../shared/redis');

const COOKIES_FILE = path.join(__dirname, '../../tennis_cookies.json');
const ENV_FILE = path.join(__dirname, '../../.env');
const LOCK_KEY = 'scraper:tll:lock';
const LOCK_TTL_SEC = 30;

const FIXED_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let _sessionCookies = (process.env.TENNIS_SESSION_COOKIES || '').trim().replace(/^\"|\"$/g, '');
let _heartbeatTimer = null;
let _isLockHolder = false;
let _consecutive401Count = 0;

function getCookies() {
  return (_sessionCookies || process.env.TENNIS_SESSION_COOKIES || '').trim().replace(/^\"|\"$/g, '');
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

async function saveSession(newCookie) {
  if (!newCookie || typeof newCookie !== 'string') return;
  const trimmed = newCookie.trim();
  _sessionCookies = trimmed;
  process.env.TENNIS_SESSION_COOKIES = trimmed;

  const expiryMs = getCookieExpiryTimestamp(trimmed);

  // 1. Save to Redis
  try {
    const redis = getRedisClient();
    await redis.set('tll:session:cookies', trimmed, 'EX', 86400 * 2);
  } catch {}

  // 2. Save to PostgreSQL
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
      // console.log('💾 tennisliveload: cookie saved to PostgreSQL');
    }
  } catch {}

  // 3. Save to disk file
  try {
    fs.writeFileSync(COOKIES_FILE, JSON.stringify({ cookies: trimmed, expiry: expiryMs }, null, 2), 'utf8');
  } catch {}

  // 4. Save to .env
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
  console.log(`✅ [TLL-Session] updated (valid for ~${hoursLeft}h)`);
}

async function loadSavedSession() {
  let redisCookie = null;
  try {
    const redis = getRedisClient();
    redisCookie = await redis.get('tll:session:cookies');
  } catch {}

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

  const candidates = [redisCookie, envCookie, dbCookie, fileCookie]
    .filter(Boolean)
    .map(c => ({ cookie: c, ts: getCookieExpiryTimestamp(c) || 0, msLeft: getCookieExpiryMs(c) }))
    .filter(c => c.msLeft === -1 || c.msLeft > 0);

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.ts - a.ts);
    const best = candidates[0].cookie;
    _sessionCookies = best;
    process.env.TENNIS_SESSION_COOKIES = best;
    if (best !== dbCookie) await saveSession(best);
    else console.log(`✅ [TLL-Session] loaded valid session (${(candidates[0].msLeft / 3600000).toFixed(1)}h left)`);
  } else {
    console.warn('⚠️  [TLL-Session] no valid session cookie found. Update manually via admin panel.');
  }
}

/**
 * Capture rolling session cookie on upstream response (LoadxBet technique)
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

    if (newExpiry >= oldExpiry || !oldExpiry) {
      console.log('🔄 [TLL-Session] capturing refreshed rolling session cookie...');
      saveSession(newSessionCookie).catch(() => {});
    }
  }
}

function recordSuccessfulCall() {
  _consecutive401Count = 0;
}

function record401Failure() {
  _consecutive401Count++;
  return _consecutive401Count;
}

/**
 * Acquire the singleton scraper lock with graceful handoff during deploys.
 * If another container is running, this process waits until the old container terminates.
 */
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

module.exports = {
  getCookies,
  getFixedUserAgent,
  isConnected,
  getCookieExpiryMs,
  getCookieExpiryTimestamp,
  saveSession,
  loadSavedSession,
  saveRefreshedCookies,
  recordSuccessfulCall,
  record401Failure,
  acquireSingletonLock,
  isSingletonLeader,
};
