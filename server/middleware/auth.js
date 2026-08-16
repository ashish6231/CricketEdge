const jwt = require('jsonwebtoken');
const prisma = require('../db/prisma');
const { hasProAccess } = require('../lib/subscriptionAccess');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is not set!');
  process.exit(1);
}

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, plan: user.subPlanSlug },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
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
      },
    });
    if (!user || user.status === 'banned')
      return res.status(403).json({ success: false, message: 'Account banned', code: 'ACCOUNT_BANNED' });
    if (user.status === 'suspended')
      return res.status(403).json({ success: false, message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
    if (user.activeToken && user.activeToken !== token)
      return res.status(401).json({ success: false, message: 'Logged in on another device', code: 'SESSION_REPLACED' });

    // Always prefer DB role/plan — never trust JWT claims for authorization
    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      plan: user.subPlanSlug,
    };

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try { req.user = jwt.verify(token, JWT_SECRET); } catch { /* ignore */ }
  }
  next();
}

function requireProSubscription(req, res, next) {
  verifyToken(req, res, async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { role: true, subPlanSlug: true, subStatus: true, subExpiresAt: true }
      });
      if (hasProAccess(user)) return next();
    } catch { /* fall through */ }
    return res.status(403).json({
      success: false, message: 'Pro subscription required',
      code: 'SUBSCRIPTION_REQUIRED', upgradeUrl: '/subscription'
    });
  });
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
  sanitizeUserRecord,
  JWT_SECRET,
};
