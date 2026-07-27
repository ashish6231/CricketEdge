const jwt = require('jsonwebtoken');
const prisma = require('../db/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'cricketedge_jwt_secret_change_in_production';

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
    req.user = decoded;

    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { status: true, activeToken: true } });
    if (!user || user.status === 'banned')
      return res.status(403).json({ success: false, message: 'Account banned', code: 'ACCOUNT_BANNED' });
    if (user.activeToken && user.activeToken !== token)
      return res.status(401).json({ success: false, message: 'Logged in on another device', code: 'SESSION_REPLACED' });

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
  verifyToken(req, res, () => {
    const plan = req.user?.plan;
    const role = req.user?.role;
    if (plan === 'pro' || role === 'superadmin') return next();
    return res.status(403).json({
      success: false, message: 'Pro subscription required',
      code: 'SUBSCRIPTION_REQUIRED', upgradeUrl: '/subscription'
    });
  });
}

module.exports = { generateToken, verifyToken, optionalAuth, requireProSubscription, JWT_SECRET };
