const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAdmin, requireSuperAdmin } = require('../middleware/admin');

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

const User = require('../models/User');
const UserSubscription = require('../models/UserSubscription');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const AdminAuditLog = require('../models/AdminAuditLog');
const SiteSettings = require('../models/SiteSettings');
const PromoCode = require('../models/PromoCode');

const memoryStore = require('../memoryStore');

async function auditLog(admin, action, targetType, targetId, targetIdentifier, changes, reason, req) {
  if (!isMongoConnected()) return;
  try {
    await AdminAuditLog.create({
      adminId: admin.userId,
      adminEmail: admin.email,
      action, targetType, targetId, targetIdentifier,
      changes,
      reason: reason || '',
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
}

// ==================== DASHBOARD STATS ====================
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) {
      const users = memoryStore.users;
      return res.json({
        success: true,
        data: {
          stats: {
            totalUsers: users.length,
            proSubscribers: users.filter(u => u.subscription?.planSlug === 'pro').length,
            freeUsers: users.filter(u => u.subscription?.planSlug !== 'pro').length,
            activeUsers: users.filter(u => u.status === 'active').length,
            bannedUsers: users.filter(u => u.status === 'banned').length
          },
          recent: { users: users.slice(-5).reverse() }
        }
      });
    }

    const [totalUsers, proSubscribers, freeUsers, activeUsers, bannedUsers, recentUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ 'subscription.planSlug': 'pro' }),
      User.countDocuments({ 'subscription.planSlug': { $ne: 'pro' } }),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ status: 'banned' }),
      User.find().sort({ createdAt: -1 }).limit(5).select('name email role status subscription createdAt').lean()
    ]);

    res.json({
      success: true,
      data: {
        stats: { totalUsers, proSubscribers, freeUsers, activeUsers, bannedUsers },
        recent: { users: recentUsers }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== USERS MANAGEMENT ====================
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role = '', status = '' } = req.query;
    if (!isMongoConnected()) {
      let users = memoryStore.users;
      if (search) users = users.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));
      if (role) users = users.filter(u => u.role === role);
      if (status) users = users.filter(u => u.status === status);
      const start = (page - 1) * limit;
      const paginated = users.slice(start, start + +limit);
      return res.json({ success: true, data: paginated, pagination: { page: +page, limit: +limit, total: users.length, pages: Math.ceil(users.length / limit) } });
    }

    const filter = {};
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    if (role) filter.role = role;
    if (status) filter.status = status;
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit).select('-password -otp -resetToken').lean(),
      User.countDocuments(filter)
    ]);
    res.json({ success: true, data: users, pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total / +limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) {
      const user = memoryStore.users.find(u => u._id === req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      return res.json({ success: true, data: { user, subscriptions: [] } });
    }
    const user = await User.findById(req.params.id).select('-password -otp -resetToken').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const subscriptions = await UserSubscription.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).lean();
    res.json({ success: true, data: { user, subscriptions } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/users/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status, reason } = req.body;
    if (!isMongoConnected()) {
      const idx = memoryStore.users.findIndex(u => u._id === req.params.id);
      if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });
      if (memoryStore.users[idx].role !== 'user') return res.status(403).json({ success: false, message: 'Cannot modify an admin or superadmin' });
      memoryStore.users[idx].status = status;
      return res.json({ success: true, data: memoryStore.users[idx] });
    }
    const before = await User.findById(req.params.id).select('status role').lean();
    if (!before) return res.status(404).json({ success: false, message: 'User not found' });
    if (before.role !== 'user') return res.status(403).json({ success: false, message: 'Cannot modify an admin or superadmin' });
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }).select('-password');
    const action = status === 'banned' ? 'user_ban' : status === 'suspended' ? 'user_suspend' : 'user_unsuspend';
    await auditLog(req.user, action, 'user', user._id, user.email, { before: { status: before.status }, after: { status } }, reason, req);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== CREATE ADMIN (superadmin only) ====================
router.post('/admins', requireSuperAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required' });
    const bcrypt = require('bcryptjs');
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email and password required' });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const now = new Date();
    const plan = await SubscriptionPlan.findOne({ slug: 'pro' }).lean();
    const hashed = await bcrypt.hash(password, 12);

    const admin = await User.create({
      name, email: email.toLowerCase(), password: hashed,
      authProvider: 'local', isVerified: true,
      role: 'admin',
      status: 'active',
      subscription: {
        planId: plan?._id,
        planSlug: 'pro',
        status: 'active',
        startedAt: now,
        expiresAt: new Date('2099-12-31'),
        autoRenew: true
      }
    });

    // Ledger entry — permanent pro, no payment
    await UserSubscription.create({
      userId: admin._id,
      planId: plan?._id,
      planSlug: 'pro',
      amount: 0,
      startedAt: now,
      expiresAt: new Date('2099-12-31'),
      billingCycle: 'yearly',
      'payment.status': 'completed',
      'payment.method': 'wallet',
      'payment.paidAt': now,
      status: 'active'
    });

    await auditLog(req.user, 'user_verify', 'user', admin._id, admin.email,
      { after: { role: 'admin', planSlug: 'pro' } }, 'Admin created by superadmin', req);

    res.json({ success: true, data: admin });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/users/:id/role', requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin', 'superadmin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'role must be user, admin or superadmin' });
    }
    if (!isMongoConnected()) {
      const idx = memoryStore.users.findIndex(u => u._id === req.params.id);
      if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });
      memoryStore.users[idx].role = role;
      return res.json({ success: true, data: memoryStore.users[idx] });
    }
    const before = await User.findById(req.params.id).select('role').lean();
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    await auditLog(req.user, 'user_verify', 'user', user._id, user.email, { before: { role: before.role }, after: { role } }, 'Role changed by admin', req);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── CHANGE USER PLAN (free ↔ pro) ───
router.patch('/users/:id/plan', requireAdmin, async (req, res) => {
  try {
    const { planSlug, reason, durationMonths } = req.body;
    if (!['free', 'pro'].includes(planSlug)) {
      return res.status(400).json({ success: false, message: 'planSlug must be free or pro' });
    }

    const calcExpiry = (existingExpiry) => {
      if (planSlug !== 'pro') return null;
      const months = parseInt(durationMonths) || 1;
      const base = existingExpiry && new Date(existingExpiry) > new Date() ? new Date(existingExpiry) : new Date();
      base.setMonth(base.getMonth() + months);
      return base;
    };

    if (!isMongoConnected()) {
      const idx = memoryStore.users.findIndex(u => u._id === req.params.id);
      if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });
      memoryStore.users[idx].subscription = {
        ...memoryStore.users[idx].subscription,
        planSlug,
        status: 'active',
        startedAt: new Date(),
        expiresAt: calcExpiry(memoryStore.users[idx].subscription?.expiresAt)
      };
      return res.json({ success: true, data: memoryStore.users[idx] });
    }

    const before = await User.findById(req.params.id).select('subscription role').lean();
    if (!before) return res.status(404).json({ success: false, message: 'User not found' });
    if (before.role !== 'user') return res.status(403).json({ success: false, message: 'Cannot modify an admin or superadmin' });

    const now = new Date();
    const expiresAt = calcExpiry(before.subscription?.expiresAt);

    // Find existing active subscription record and UPDATE it (no new entry)
    const existingSub = await UserSubscription.findOne({ userId: req.params.id, status: 'active' });
    const plan = await SubscriptionPlan.findOne({ slug: planSlug }).lean();

    if (existingSub) {
      await UserSubscription.findByIdAndUpdate(existingSub._id, {
        planId: plan?._id,
        planSlug,
        amount: 0,
        startedAt: now,
        expiresAt: planSlug === 'pro' ? expiresAt : new Date('2099-12-31'),
        billingCycle: 'yearly',
        'payment.status': 'completed',
        'payment.method': 'wallet',
        'payment.paidAt': now,
        status: 'active',
        cancelReason: ''
      });
    } else {
      await UserSubscription.create({
        userId: req.params.id,
        planId: plan?._id,
        planSlug,
        amount: 0,
        startedAt: now,
        expiresAt: planSlug === 'pro' ? expiresAt : new Date('2099-12-31'),
        billingCycle: 'yearly',
        'payment.status': 'completed',
        'payment.method': 'wallet',
        'payment.paidAt': now,
        status: 'active'
      });
    }

    const user = await User.findByIdAndUpdate(req.params.id, {
      'subscription.planId': plan?._id,
      'subscription.planSlug': planSlug,
      'subscription.status': 'active',
      'subscription.startedAt': now,
      'subscription.expiresAt': expiresAt
    }, { new: true }).select('-password');

    await auditLog(req.user, 'user_verify', 'user', user._id, user.email, {
      before: { planSlug: before.subscription?.planSlug },
      after: { planSlug }
    }, reason || `Plan changed to ${planSlug} by admin`, req);

    // Notify user in real-time if they are online
    const { getIo } = require('../socketInstance');
    const io = getIo();
    if (io) {
      io.to(`user:${req.params.id}`).emit('planUpdate', {
        planSlug,
        status: 'active',
        expiresAt: user.subscription?.expiresAt
      });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== PLANS (Single Pro Plan) ====================
router.get('/plans', requireAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) {
      const { DEFAULT_PLANS } = require('../seedAdmin');
      return res.json({ success: true, data: DEFAULT_PLANS });
    }
    const plans = await SubscriptionPlan.find().sort({ displayOrder: 1 }).lean();
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/plans', requireSuperAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required for this operation' });
    const plan = await SubscriptionPlan.findOneAndUpdate(
      { slug: req.body.slug },
      { ...req.body, createdBy: req.user.userId },
      { upsert: true, new: true }
    );
    await auditLog(req.user, 'plan_create', 'plan', plan._id, plan.slug, { after: plan.toObject() }, '', req);
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/plans/:id', requireSuperAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required for this operation' });
    const before = await SubscriptionPlan.findById(req.params.id).lean();
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    await auditLog(req.user, 'plan_update', 'plan', plan._id, plan.slug, { before, after: plan.toObject() }, '', req);
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== COUPONS ====================
router.get('/coupons', requireAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.json({ success: true, data: [] });
    const coupons = await PromoCode.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/coupons', requireAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required for this operation' });
    const coupon = await PromoCode.create({ ...req.body, createdBy: req.user.userId });
    await auditLog(req.user, 'coupon_create', 'coupon', coupon._id, coupon.code, { after: coupon.toObject() }, '', req);
    res.json({ success: true, data: coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/coupons/:id', requireAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required for this operation' });
    const coupon = await PromoCode.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== SETTINGS ====================
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) {
      const { DEFAULT_SETTINGS } = require('../seedAdmin');
      return res.json({ success: true, data: DEFAULT_SETTINGS.map(s => ({ ...s, _id: s.key, updatedAt: new Date() })) });
    }
    const settings = await SiteSettings.find().sort({ category: 1, key: 1 }).lean();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/settings/:key', requireSuperAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required for this operation' });
    const before = await SiteSettings.findOne({ key: req.params.key }).lean();
    const setting = await SiteSettings.findOneAndUpdate(
      { key: req.params.key },
      { value: req.body.value, updatedBy: req.user.userId },
      { new: true, upsert: true }
    );
    await auditLog(req.user, 'settings_update', 'settings', setting._id, setting.key, { before, after: setting.toObject() }, req.body.reason, req);
    res.json({ success: true, data: setting });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== AUDIT LOGS ====================
router.get('/audit-logs', requireAdmin, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.json({ success: true, data: [], pagination: { total: 0 } });
    const { page = 1, limit = 50, action = '', adminId = '' } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (adminId) filter.adminId = adminId;
    const [logs, total] = await Promise.all([
      AdminAuditLog.find(filter).sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit).populate('adminId', 'name email').lean(),
      AdminAuditLog.countDocuments(filter)
    ]);
    res.json({ success: true, data: logs, pagination: { page: +page, limit: +limit, total } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
