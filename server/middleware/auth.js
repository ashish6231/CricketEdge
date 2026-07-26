const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = process.env.JWT_SECRET || 'cricketedge_jwt_secret_change_in_production';

function generateToken(user) {
  return jwt.sign(
    { userId: user._id || user.id, email: user.email, role: user.role, plan: user.subscription?.planSlug },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // Check live status + single device session
    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      const user = await User.findById(decoded.userId).select('status activeToken').lean();
      if (!user || user.status === 'banned') {
        return res.status(403).json({ success: false, message: 'Account banned', code: 'ACCOUNT_BANNED' });
      }
      if (user.activeToken && user.activeToken !== token) {
        return res.status(401).json({ success: false, message: 'Logged in on another device', code: 'SESSION_REPLACED' });
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch { /* ignore */ }
  }
  next();
}

// Check if user has active Pro subscription (or is admin)
function requireProSubscription(req, res, next) {
  verifyToken(req, res, () => {
    const plan = req.user?.plan;
    const role = req.user?.role;
    if (plan === 'pro' || role === 'superadmin') {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'Pro subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
      upgradeUrl: '/subscription'
    });
  });
}

module.exports = { generateToken, verifyToken, optionalAuth, requireProSubscription, JWT_SECRET };
