const { verifyToken } = require('./auth');

function requireRole(...roles) {
  return (req, res, next) => {
    verifyToken(req, res, () => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }
      next();
    });
  };
}

const requireAdmin = requireRole('admin', 'superadmin');
const requireSuperAdmin = requireRole('superadmin');

module.exports = { requireAdmin, requireSuperAdmin, requireRole };
