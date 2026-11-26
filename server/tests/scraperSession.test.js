const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

function stub(relPath, exports) {
  const id = require.resolve(relPath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

test('scraper-tennisliveload/session getCookieExpiryMs calculates ms left accurately', () => {
  stub('../db/prisma', { siteSettings: {} });
  stub('../shared/redis', {
    getRedisClient: () => ({ set: async () => 'OK' }),
    acquireLock: async () => true,
    refreshLock: async () => true,
    releaseLock: async () => true,
  });
  const session = require('../services/scraper-tennisliveload/session');
  const futureExpiry = Date.now() + 10000000;
  const mockCookie = `cricket_live_load_session=Fe26.2*1*hash*iv*cipher*${futureExpiry}*sig~2`;
  const msLeft = session.getCookieExpiryMs(mockCookie);
  assert.ok(msLeft > 9900000 && msLeft <= 10000000, `Expected ~10000000 ms left, got ${msLeft}`);

  const expiredCookie = `cricket_live_load_session=Fe26.2*1*hash*iv*cipher*1600000000000*sig~2`;
  assert.equal(session.getCookieExpiryMs(expiredCookie), 0, 'Past cookie must return 0 msLeft');
});

test('scraper-tennisliveload/session syncs newer DB cookie before hitting auto-login on 401', async (t) => {
  const tmpFile = path.join(os.tmpdir(), `tll-cookie-${Date.now()}-1.json`);
  const prevEnv = process.env.TLL_COOKIES_FILE;
  process.env.TLL_COOKIES_FILE = tmpFile;
  t.after(() => {
    if (prevEnv === undefined) delete process.env.TLL_COOKIES_FILE;
    else process.env.TLL_COOKIES_FILE = prevEnv;
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  const futureExpiry = Date.now() + 10_000_000;
  const oldCookie = `cricket_live_load_session=Fe26.2*1*old*iv*cipher*${futureExpiry}*sig`;
  const freshCookie = `cricket_live_load_session=Fe26.2*1*fresh*iv*cipher*${futureExpiry + 5000}*sig`;

  let dbCookie = oldCookie;
  let loginPostCount = 0;

  delete require.cache[require.resolve('../services/scraper-tennisliveload/session')];
  delete require.cache[require.resolve('../services/scraper-tennisliveload/adapter')];

  stub('../db/prisma', {
    siteSettings: {
      findUnique: async () => ({ value: { cookie: dbCookie, expiry: futureExpiry + 5000 } }),
      upsert: async () => ({}),
    },
  });
  stub('../shared/redis', {
    getRedisClient: () => ({ set: async () => 'OK' }),
    acquireLock: async () => true,
    refreshLock: async () => true,
    releaseLock: async () => true,
  });

  const session = require('../services/scraper-tennisliveload/session');
  const TennisLiveLoadAdapter = require('../services/scraper-tennisliveload/adapter');

  await session.loadSavedSession();
  assert.equal(session.getCookies(), oldCookie);
  assert.equal(session.getStatus().isConnected, true);

  // Another worker/admin saved a fresher cookie to MariaDB, invalidating oldCookie on TLL.
  dbCookie = freshCookie;

  const adapter = new TennisLiveLoadAdapter();
  const seenCookies = [];
  adapter.axiosInstance = {
    get: async (_url, cfg) => {
      const sent = cfg?.headers?.Cookie;
      seenCookies.push(sent);
      if (sent === oldCookie) {
        const err = new Error('HTTP 401');
        err.response = { status: 401, data: { error: 'Session expired or invalidated.' } };
        throw err;
      }
      return { status: 200, headers: {}, data: [] };
    },
    post: async () => {
      loginPostCount++;
      throw new Error('Should not hit /api/auth/login when DB already has fresh cookie');
    },
  };

  const result = await adapter._request('/api/cricket/matches');
  assert.deepEqual(result, []);
  assert.equal(loginPostCount, 0, 'Must sync fresh cookie from MariaDB without firing duplicate auto-login');
  assert.deepEqual(seenCookies, [oldCookie, freshCookie]);
  assert.equal(session.getStatus().isConnected, true);
});

test('scraper-tennisliveload/session marks status disconnected on upstream 401 until saveSession resets it', async (t) => {
  const tmpFile = path.join(os.tmpdir(), `tll-cookie-${Date.now()}-2.json`);
  const prevEnv = process.env.TLL_COOKIES_FILE;
  process.env.TLL_COOKIES_FILE = tmpFile;
  t.after(() => {
    if (prevEnv === undefined) delete process.env.TLL_COOKIES_FILE;
    else process.env.TLL_COOKIES_FILE = prevEnv;
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  const futureExpiry = Date.now() + 10_000_000;
  const expiredUpstreamCookie = `cricket_live_load_session=Fe26.2*1*bad*iv*cipher*${futureExpiry}*sig`;
  const replacementCookie = `cricket_live_load_session=Fe26.2*1*good*iv*cipher*${futureExpiry + 10000}*sig`;

  delete require.cache[require.resolve('../services/scraper-tennisliveload/session')];
  stub('../db/prisma', {
    siteSettings: {
      findUnique: async () => ({ value: { cookie: expiredUpstreamCookie } }),
      upsert: async () => ({}),
    },
  });
  stub('../shared/redis', {
    getRedisClient: () => ({ set: async () => 'OK' }),
    acquireLock: async () => true,
    refreshLock: async () => true,
    releaseLock: async () => true,
  });

  const session = require('../services/scraper-tennisliveload/session');
  await session.loadSavedSession();
  assert.equal(session.getStatus().isConnected, true);

  session.record401Failure();
  const failedStatus = session.getStatus();
  assert.equal(failedStatus.source, 'MariaDB Database');
  assert.equal(failedStatus.isConnected, false, 'Consecutive 401s must flip isConnected false despite future expiry');
  assert.equal(failedStatus.hoursLeft, '0');

  await session.saveSession(replacementCookie);
  const healedStatus = session.getStatus();
  assert.equal(healedStatus.isConnected, true);
  assert.equal(healedStatus.consecutive401s, 0);
});
