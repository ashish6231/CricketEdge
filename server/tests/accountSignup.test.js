const test = require('node:test');
const assert = require('node:assert/strict');

function stub(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
let created = [], lookups = [], currentUser = null, existingUser = null;
const prisma = {
  user: {
    async findUnique(query) { lookups.push(query); return existingUser; },
    async create({ data }) { currentUser = { id: 123, ...data }; created.push(currentUser); return currentUser; },
    async update({ data }) { return { ...currentUser, ...data }; },
  },
  adminAuditLog: { async create() {} },
};
stub('../db/prisma', prisma);
stub('bcryptjs', { hash: async () => 'offline-password-hash' });
stub('nodemailer', { createTransport: () => ({ verify() {} }) });
stub('../middleware/auth', {
  generateToken: () => 'offline-token', clearAuthCache() {}, invalidateAuthCache() {},
  optionalAuth(_req, _res, next) { next(); }, sanitizeUserRecord: user => user,
});
stub('../services/socketService', { notifySessionReplaced() {} });
stub('../lib/subscriptionAccess', {
  grantTrialToNewUser: async () => ({ user: currentUser, granted: false }),
  getTrialConfig: async () => ({ label: 'Trial' }), getTrialMinutesLeft: () => 0,
  isActiveTrial: () => false, syncUserTrialState: async () => ({ user: currentUser || existingUser }),
});
const realSettings = require('../lib/siteSettings');
stub('../lib/siteSettings', { ...realSettings, areSignupsAllowed: async () => true });
let googlePayload;
stub('google-auth-library', { OAuth2Client: class {
  async verifyIdToken() { return { getPayload: () => googlePayload }; }
} });
const auth = require('../routes/auth');
const admin = require('../routes/admin');
const handler = (router, path) => router.stack.find(layer => layer.route?.path === path && layer.route.methods.post).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
function reset() { created = []; lookups = []; currentUser = null; existingUser = null; }

test('register and both admin creation APIs reject malformed or non-Gmail addresses before database writes', async () => {
  for (const [router, path] of [[auth, '/register'], [admin, '/users'], [admin, '/admins']]) {
    for (const email of ["'@bhnnbvnmm", '@gmail.com', 'user@yahoo.com', 'user@gmail.com.evil', { address: 'user@gmail.com' }]) {
      reset();
      const res = response();
      await handler(router, path)({ body: { name: 'User', email, password: 'password123' } }, res);
      assert.equal(res.statusCode, 400, path);
      assert.equal(res.body.code, 'GMAIL_REQUIRED');
      assert.equal(created.length, 0);
      assert.equal(lookups.length, 0);
    }
  }
});

test('valid normalized Gmail addresses can register and be created by an admin', async () => {
  for (const [router, path] of [[auth, '/register'], [admin, '/users'], [admin, '/admins']]) {
    reset();
    const res = response();
    await handler(router, path)({ body: { name: 'User', email: ' User.Name@GMAIL.COM ', password: 'password123' },
      user: { userId: 1, email: 'admin@gmail.com' }, headers: {} }, res);
    assert.equal(res.statusCode, 200, path);
    assert.equal(res.body.success, true);
    assert.equal(created[0].email, 'user.name@gmail.com');
  }
});

test('Google token signup enforces Gmail for new accounts', async () => {
  for (const email of ['new@example.com', 'new@gmail.com.evil', ' New.User@GMAIL.COM ']) {
    reset();
    googlePayload = { sub: 'verified-google-user', email, name: 'User' };
    const res = response();
    await handler(auth, '/google/verify')({ body: { credential: 'offline-test-token' } }, res);
    if (email.includes('GMAIL.COM')) {
      assert.equal(res.statusCode, 200);
      assert.equal(created[0].email, 'new.user@gmail.com');
    } else {
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.code, 'GMAIL_REQUIRED');
      assert.equal(created.length, 0);
    }
  }
});

test('legacy Google redirect signup applies the same policy', async () => {
  let verify;
  stub('passport', { serializeUser() {}, deserializeUser() {}, use(strategy) { verify = strategy.verify; } });
  stub('passport-google-oauth20', { Strategy: class { constructor(_options, callback) { this.verify = callback; } } });
  process.env.GOOGLE_CLIENT_ID = 'offline-client';
  process.env.GOOGLE_CLIENT_SECRET = 'offline-secret';
  require('../config/passport');
  for (const email of ['new@example.com', 'New.User@GMAIL.COM']) {
    reset();
    let result;
    await verify(null, null, { id: 'offline-user', emails: [{ value: email }], photos: [], displayName: 'User' },
      (error, user, info) => { assert.equal(error, null); result = { user, info }; });
    if (email.includes('GMAIL.COM')) {
      assert.equal(result.user.email, 'new.user@gmail.com');
    } else {
      assert.equal(result.user, false);
      assert.equal(result.info.code, 'GMAIL_REQUIRED');
      assert.equal(created.length, 0);
    }
  }
});
