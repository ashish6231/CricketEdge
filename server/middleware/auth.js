const jwt = require('jsonwebtoken');
const prisma = require('../db/prisma');
const { hasProAccess } = require('../lib/subscriptionAccess');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is not set!');
  process.exit(1);
}

/** In-memory auth cache — cuts Neon hits from 3s frontend polls. */
const AUTH_CACHE_TTL_MS = 45 * 1000;
const authCache = new Map(); // token -> { expiresAt, result }

function getCachedAuth(token) {
  const entry = authCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    authCache.delete(token);
    return null;
  }
  return entry.result;
}

function setCachedAuth(token, result) {
  authCache.set(token, { expiresAt: Date.now() + AUTH_CACHE_TTL_MS, result });
  // opportunistic cleanup
  if (authCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of authCache) {
      if (now > v.expiresAt) authCache.delete(k);
    }
  }
}

/** Invalidate after login / logout / password change / session replace. */
function invalidateAuthCache(token) {
  if (token) authCache.delete(token);
}

function clearAuthCache() {
  authCache.clear();
}

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, plan: user.subPlanSlug },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function resolveBearerUser(token) {
  const cached = getCachedAuth(token);
  if (cached) return cached;

  const decoded = jwt.verify(token, JWT_SECRET);
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      activeToken: true,
      subPlanSlug: true,
      subStatus: true,
      subExpiresAt: true,
    },
  });
  if (!user || user.status === 'banned') {
    const result = { errorStatus: 403, errorBody: { success: false, message: 'Account banned', code: 'ACCOUNT_BANNED' } };
    setCachedAuth(token, result);
    return result;
  }
  if (user.status === 'suspended') {
    const result = { errorStatus: 403, errorBody: { success: false, message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' } };
    setCachedAuth(token, result);
    return result;
  }
  if (user.activeToken && user.activeToken !== token) {
    const result = {
      errorStatus: 401,
      errorBody: { success: false, message: 'Logged in on another device', code: 'SESSION_REPLACED' },
      sessionReplaced: true,
    };
    // Don't cache session-replaced long — user may re-login; short cache still ok
    setCachedAuth(token, result);
    return result;
  }
  // Always prefer DB role/plan — never trust JWT claims for authorization
  const result = {
    user: {
      userId: user.id,
      email: user.email,
      role: user.role,
      plan: user.subPlanSlug,
      subPlanSlug: user.subPlanSlug,
      subStatus: user.subStatus,
      subExpiresAt: user.subExpiresAt,
    },
  };
  setCachedAuth(token, result);
  return result;
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const result = await resolveBearerUser(token);
    if (result.user) {
      req.user = result.user;
      return next();
    }
    return res.status(result.errorStatus).json(result.errorBody);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('AUTH_DB_TIMEOUT')), ms)),
  ]);
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  const token = authHeader.split(' ')[1];
  try {
    const result = await withTimeout(resolveBearerUser(token), 4000);
    if (result.user) {
      req.user = result.user;
      return next();
    }
    if (result.sessionReplaced) return next();
    return res.status(result.errorStatus).json(result.errorBody);
  } catch {
    // DB slow/unavailable — don't block public match lists
    return next();
  }
}

function requireProSubscription(req, res, next) {
  verifyToken(req, res, () => {
    if (hasProAccess(req.user)) return next();
    return res.status(403).json({
      success: false, message: 'Pro subscription required',
      code: 'SUBSCRIPTION_REQUIRED', upgradeUrl: '/subscription'
    });
  });
}

/** Use after optionalAuth — no second DB hit when req.user already has sub fields. */
function assertProAccess(req, res) {
  const role = req.user?.role;
  if (role === 'admin' || role === 'superadmin') return true;
  if (!req.user) {
    res.status(401).json({ error: 'login_required', message: 'Live/upcoming match data requires login.' });
    return false;
  }
  if (hasProAccess(req.user)) return true;
  res.status(403).json({ success: false, message: 'Pro subscription required', code: 'SUBSCRIPTION_REQUIRED' });
  return false;
}

/** Strip secrets from a User row before sending to clients. */
function sanitizeUserRecord(user) {
  if (!user || typeof user !== 'object') return user;
  const {
    password,
    activeToken,
    otpCode,
    otpExpiresAt,
    otpPurpose,
    resetToken,
    resetTokenExpires,
    ...safe
  } = user;
  return safe;
}

module.exports = {
  generateToken,
  verifyToken,
  optionalAuth,
  requireProSubscription,
  assertProAccess,
  sanitizeUserRecord,
  invalidateAuthCache,
  clearAuthCache,
  JWT_SECRET,
};
