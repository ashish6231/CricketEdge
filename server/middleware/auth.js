const jwt = require('jsonwebtoken');
const prisma = require('../db/prisma');
const { hasProAccess } = require('../lib/subscriptionAccess');
const { getSiteModeSync } = require('../lib/siteSettings');

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
    { expiresIn: '3650d' } // Never expires on its own — persists until manual logout or 2nd device login
  );
}

async function resolveBearerUser(token) {
  const cached = getCachedAuth(token);
  if (cached) return cached;

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (jwtErr) {
    return { errorStatus: 401, errorBody: { success: false, message: 'Invalid or expired token', code: 'INVALID_TOKEN' } };
  }

  let user;
  try {
    user = await prisma.user.findUnique({
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
        telegramId: true,
        telegramUsername: true,
      },
    });
  } catch (dbErr) {
    console.error('⚠️ DB error during resolveBearerUser:', dbErr.message);
    // Transient DB error: return 503 instead of 401 so client does not wipe user session!
    return { errorStatus: 503, errorBody: { success: false, message: 'Auth service temporarily unavailable', code: 'AUTH_UNAVAILABLE' } };
  }

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
  // Single-session enforcement: only the latest token is valid
  if (user.activeToken && user.activeToken !== token) {
    const result = { errorStatus: 401, errorBody: { success: false, message: 'Aapka account kisi doosre device par login ho gaya hai. Please dubara login karein.', code: 'SESSION_REPLACED' } };
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
      telegramId: user.telegramId,
      telegramUsername: user.telegramUsername,
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
    return res.status(500).json({ success: false, message: 'Server auth error' });
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
    return res.status(result.errorStatus).json(result.errorBody);
  } catch {
    // DB slow/unavailable — don't block public match lists
    return next();
  }
}

function requireProSubscription(req, res, next) {
  verifyToken(req, res, () => {
    const role = req.user?.role;
    if (role === 'admin' || role === 'superadmin') return next();
    if (getSiteModeSync() === 'free') return next();
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
  if (getSiteModeSync() === 'free') return true;
  if (hasProAccess(req.user)) return true;
  res.status(403).json({ success: false, message: 'Pro subscription required', code: 'SUBSCRIPTION_REQUIRED' });
  return false;
}

/** Check compulsory Telegram membership for protected data */
async function assertTelegramMembership(req, res, next) {
  const telegramService = require('../services/telegramService');
  if (!telegramService.GATE_ENABLED) return next();

  // Admin bypass
  const role = req.user?.role;
  if (role === 'admin' || role === 'superadmin') return next();

  // If user is logged in: Check if account has Telegram linked & is in the group
  if (req.user) {
    const telegramId = req.user.telegramId;
    if (!telegramId) {
      return res.status(403).json({
        success: false,
        error: 'telegram_required',
        code: 'TELEGRAM_NOT_LINKED',
        message: 'CricEdge website use karne ke liye please hamara official Telegram channel @cricedge_online join karein.',
        groupUrl: `https://t.me/${telegramService.CHAT_ID.replace('@', '')}`,
        userId: req.user.userId,
      });
    }

    const check = await telegramService.checkMembership(telegramId);
    if (!check.isMember) {
      return res.status(403).json({
        success: false,
        error: 'telegram_required',
        code: 'LEFT_GROUP',
        message: 'Aapne @cricedge_online Telegram channel chhod diya hai! Dobara join karein tabhi access milega.',
        groupUrl: `https://t.me/${telegramService.CHAT_ID.replace('@', '')}`,
        userId: req.user.userId,
      });
    }

    return next();
  }

  // If visitor is NOT logged in: do NOT block.
  // Telegram linking and group membership is checked AFTER the user logs in.
  return next();
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
  assertTelegramMembership,
  sanitizeUserRecord,
  invalidateAuthCache,
  clearAuthCache,
  JWT_SECRET,
};
