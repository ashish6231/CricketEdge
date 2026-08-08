const express = require('express');
const router = express.Router();
const { requireAdmin, requireSuperAdmin } = require('../middleware/admin');
const { PERMISSION_MATRIX, ADMIN_CAPABILITIES } = require('../lib/adminPermissions');
const prisma = require('../db/prisma');
const { grantTrialIfEligible, grantTrialToAllEligible, TRIAL_DAYS } = require('../lib/subscriptionAccess');

function parseUserId(raw) {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function lapsedProWhere(extra = {}) {
  const now = new Date();
  return {
    role: 'user',
    subscriptions: {
      some: { planSlug: 'pro', paymentStatus: 'completed' },
    },
    NOT: {
      AND: [
        { subPlanSlug: 'pro' },
        { subStatus: 'active' },
        { subExpiresAt: { gt: now } },
      ],
    },
    ...extra,
  };
}

async function fetchLapsedUsers({ page = 1, limit = 20, search = '', status = '' }) {
  const safeLimit = Math.min(+limit || 20, 100);
  const extra = {};
  if (search) extra.OR = [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }];
  if (status) extra.status = status;
  const where = lapsedProWhere(extra);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { subExpiresAt: 'desc' },
      skip: (+page - 1) * safeLimit,
      take: safeLimit,
      select: {
        id: true, name: true, email: true, role: true, status: true,
        subPlanSlug: true, subStatus: true, subExpiresAt: true, createdAt: true,
        subscriptions: {
          where: { planSlug: 'pro', paymentStatus: 'completed' },
          orderBy: { expiresAt: 'desc' },
          take: 1,
          select: { expiresAt: true, paidAt: true, amount: true, billingCycle: true, paymentMethod: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const userIds = users.map(u => u.id);
  const purchaseCounts = userIds.length
    ? await prisma.userSubscription.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, planSlug: 'pro', paymentStatus: 'completed' },
        _count: { id: true },
      })
    : [];
  const countMap = Object.fromEntries(purchaseCounts.map(c => [c.userId, c._count.id]));

  const data = users.map(({ subscriptions, ...u }) => ({
    ...u,
    lastProSub: subscriptions[0] || null,
    proPurchaseCount: countMap[u.id] || 0,
  }));

  return { data, pagination: { page: +page, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
}

async function auditLog(admin, action, targetType, targetId, targetIdentifier, changes, reason, req) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.userId, adminEmail: admin.email,
        action, targetType, targetId, targetIdentifier: targetIdentifier || '',
        changesBefore: changes?.before ?? null, changesAfter: changes?.after ?? null,
        reason: reason || '', ipAddress: req.ip || '', userAgent: req.headers['user-agent'] || ''
      }
    });
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
}

// ==================== DASHBOARD ====================
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const [totalUsers, proSubscribers, lapsedProUsers, freeUsers, activeUsers, bannedUsers, recentUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { subPlanSlug: 'pro', subStatus: 'active', subExpiresAt: { gt: new Date() } } }),
      prisma.user.count({ where: lapsedProWhere() }),
      prisma.user.count({ where: { subPlanSlug: { not: 'pro' } } }),
      prisma.user.count({ where: { status: 'active' } }),
      prisma.user.count({ where: { status: 'banned' } }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' }, take: 5,
        select: { id: true, name: true, email: true, role: true, status: true, subPlanSlug: true, createdAt: true }
      })
    ]);
    res.json({ success: true, data: { stats: { totalUsers, proSubscribers, lapsedProUsers, freeUsers, activeUsers, bannedUsers }, recent: { users: recentUsers } } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== USERS ====================
router.get('/users', requireAdmin, async (req, res) => {
  try {
    if (req.query.segment === 'lapsed') {
      const result = await fetchLapsedUsers(req.query);
      return res.json({ success: true, ...result });
    }

    const { page = 1, limit = 20, search = '', role = '', status = '', plan = '' } = req.query;
    const safeLimit = Math.min(+limit || 20, 100);
    const where = {};
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }];
    if (role) where.role = role;
    if (status) where.status = status;
    if (plan) where.subPlanSlug = plan;

    const orderBy = plan === 'pro' ? { subExpiresAt: 'asc' } : { createdAt: 'desc' };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, orderBy,
        skip: (+page - 1) * safeLimit, take: safeLimit,
        select: { id: true, name: true, email: true, role: true, status: true, subPlanSlug: true, subStatus: true, subExpiresAt: true, createdAt: true }
      }),
      prisma.user.count({ where })
    ]);
    res.json({ success: true, data: users, pagination: { page: +page, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Alias for Former Pro tab (same handler as GET /users?segment=lapsed)
router.get('/lapsed-users', requireAdmin, async (req, res) => {
  try {
    const result = await fetchLapsedUsers(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/users/:id/subscriptions', requireAdmin, async (req, res) => {
  try {
    const userId = parseUserId(req.params.id);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const subscriptions = await prisma.userSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, planSlug: true, amount: true, currency: true, discountAmount: true, couponCode: true,
        startedAt: true, expiresAt: true, billingCycle: true, paymentStatus: true, paymentMethod: true,
        gatewayOrderId: true, gatewayPaymentId: true, paidAt: true, status: true,
        cancelledAt: true, cancelReason: true, createdAt: true,
      },
    });
    res.json({ success: true, data: { user, subscriptions } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseUserId(req.params.id);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, status: true, subPlanSlug: true, subStatus: true, subExpiresAt: true, createdAt: true, avatar: true, phone: true, isVerified: true, lastLoginAt: true }
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const subscriptions = await prisma.userSubscription.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: { user, subscriptions } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/users/:id/status', requireAdmin, async (req, res) => {
  try {
    const userId = parseUserId(req.params.id);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });
    const { status, reason } = req.body;
    if (!['active', 'banned', 'suspended'].includes(status))
      return res.status(400).json({ success: false, message: 'status must be active, banned, or suspended' });
    const before = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, role: true } });
    if (!before) return res.status(404).json({ success: false, message: 'User not found' });
    if (before.role === 'superadmin') return res.status(403).json({ success: false, message: 'Cannot modify a superadmin' });
    if (before.role === 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ success: false, message: 'Only superadmin can modify an admin' });

    const user = await prisma.user.update({ where: { id: userId }, data: { status } });
    const action = status === 'banned' ? 'user_ban' : status === 'suspended' ? 'user_suspend' : 'user_unsuspend';
    await auditLog(req.user, action, 'user', user.id, user.email, { before: { status: before.status }, after: { status } }, reason, req);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== PERMISSIONS & ADMINS ====================
router.get('/permissions', requireAdmin, (req, res) => {
  res.json({
    success: true,
    data: {
      role: req.user.role,
      matrix: PERMISSION_MATRIX,
      capabilities: ADMIN_CAPABILITIES[req.user.role] || [],
    },
  });
});

router.get('/admins', requireSuperAdmin, async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['admin', 'superadmin'] } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, name: true, email: true, role: true, status: true,
        subPlanSlug: true, subExpiresAt: true, createdAt: true, lastLoginAt: true,
      },
    });
    res.json({ success: true, data: admins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== CREATE ADMIN ====================
router.post('/admins', requireSuperAdmin, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'name, email and password required' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const now = new Date();
    const hashed = await bcrypt.hash(password, 12);

    const admin = await prisma.user.create({
      data: {
        name, email: email.toLowerCase(), password: hashed,
        authProvider: 'local', isVerified: true, role: 'admin', status: 'active',
        subPlanSlug: 'free', subStatus: 'active', subStartedAt: now, subAutoRenew: false,
      },
    });

    await auditLog(req.user, 'admin_create', 'user', admin.id, admin.email, { after: { role: 'admin' } }, 'Admin account created', req);
    const { password: _pw, ...safeAdmin } = admin;
    res.json({ success: true, data: safeAdmin });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/users/:id/role', requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseUserId(req.params.id);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });
    const { role } = req.body;
    if (!['user', 'admin'].includes(role))
      return res.status(400).json({ success: false, message: 'role must be user or admin' });

    const before = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
    if (!before) return res.status(404).json({ success: false, message: 'User not found' });
    if (before.role === 'superadmin') return res.status(403).json({ success: false, message: 'Cannot modify a superadmin' });

    const user = await prisma.user.update({ where: { id: userId }, data: { role } });
    await auditLog(req.user, role === 'admin' ? 'admin_create' : 'admin_demote', 'user', user.id, user.email, { before: { role: before.role }, after: { role } }, 'Role changed by superadmin', req);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GRANT TRIAL TO ONE USER ───
router.post('/users/:id/grant-trial', requireAdmin, async (req, res) => {
  try {
    const userId = parseUserId(req.params.id);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });
    const force = req.body?.force === true;

    const result = await grantTrialIfEligible(prisma, userId, { force });
    if (!result.user) return res.status(404).json({ success: false, message: 'User not found' });

    if (!result.granted) {
      const messages = {
        not_user: 'Cannot grant trial to admin accounts',
        inactive: 'User account is not active',
        already_pro: 'User already has Pro',
        trial_active: 'User already has an active trial',
        trial_used: 'User already used their trial. Use force to re-grant.',
        invalid_plan: 'User plan is not eligible for trial',
      };
      return res.status(400).json({ success: false, message: messages[result.reason] || 'Trial not granted', reason: result.reason });
    }

    await auditLog(req.user, 'plan_change', 'user', result.user.id, result.user.email,
      { before: { planSlug: 'free' }, after: { planSlug: 'trial' } },
      force ? 'Trial re-granted by admin' : 'Trial granted by admin', req);

    res.json({
      success: true,
      message: `${TRIAL_DAYS}-day trial granted`,
      data: { id: result.user.id, subPlanSlug: result.user.subPlanSlug, subExpiresAt: result.user.subExpiresAt },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GRANT TRIAL TO ALL ELIGIBLE EXISTING USERS ───
router.post('/grant-trial-all', requireAdmin, async (req, res) => {
  try {
    const { eligible, granted } = await grantTrialToAllEligible(prisma);
    await auditLog(req.user, 'plan_change', 'system', null, null,
      { before: {}, after: { granted, eligible } },
      `Bulk trial grant: ${granted}/${eligible} users`, req);
    res.json({
      success: true,
      message: `Trial granted to ${granted} of ${eligible} eligible users`,
      data: { eligible, granted },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── CHANGE USER PLAN (subscription only — never changes role) ───
router.patch('/users/:id/plan', requireAdmin, async (req, res) => {
  try {
    const userId = parseUserId(req.params.id);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });
    const { planSlug, reason, durationMonths } = req.body;
    if (!['free', 'pro'].includes(planSlug))
      return res.status(400).json({ success: false, message: 'planSlug must be free or pro' });

    const before = await prisma.user.findUnique({ where: { id: userId }, select: { subPlanSlug: true, subExpiresAt: true, role: true } });
    if (!before) return res.status(404).json({ success: false, message: 'User not found' });
    if (before.role !== 'user') return res.status(403).json({ success: false, message: 'Cannot modify an admin or superadmin' });

    const now = new Date();
    const months = parseInt(durationMonths) || 1;
    let expiresAt = null;
    if (planSlug === 'pro') {
      const base = before.subExpiresAt && new Date(before.subExpiresAt) > now ? new Date(before.subExpiresAt) : now;
      expiresAt = new Date(base);
      expiresAt.setMonth(expiresAt.getMonth() + months);
    }

    const plan = await prisma.subscriptionPlan.findFirst({ where: { slug: planSlug } });

    const existingSub = await prisma.userSubscription.findFirst({ where: { userId, status: 'active' } });
    const subData = {
      planId: plan?.id, planSlug, amount: 0,
      startedAt: now, expiresAt: planSlug === 'pro' ? expiresAt : new Date('2099-12-31'),
      billingCycle: 'yearly', paymentStatus: 'completed',
      paymentMethod: 'wallet', paidAt: now, status: 'active', cancelReason: ''
    };

    if (existingSub) {
      await prisma.userSubscription.update({ where: { id: existingSub.id }, data: subData });
    } else {
      await prisma.userSubscription.create({ data: { userId, ...subData } });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { subPlanId: plan?.id, subPlanSlug: planSlug, subStatus: 'active', subStartedAt: now, subExpiresAt: expiresAt }
    });

    await auditLog(req.user, 'plan_change', 'user', user.id, user.email, { before: { planSlug: before.subPlanSlug }, after: { planSlug } }, reason || `Plan changed to ${planSlug} by admin`, req);

    const { getIo } = require('../socketInstance');
    const io = getIo();
    if (io) io.to(`user:${userId}`).emit('planUpdate', { planSlug, status: 'active', expiresAt: user.subExpiresAt });

    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== PLANS ====================
router.get('/plans', requireAdmin, async (req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({ orderBy: { displayOrder: 'asc' } });
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/plans', requireSuperAdmin, async (req, res) => {
  try {
    const { slug, name, description, price, yearlyPrice, currency, features, isActive, displayOrder,
            maxMarketsTracked, apiCallsPerMin, advancedAnalytics, bookieBookAccess,
            predictionEngine, oddsAlerts, telegramNotifications } = req.body;
    if (!slug || !name || price === undefined || yearlyPrice === undefined)
      return res.status(400).json({ success: false, message: 'slug, name, price, yearlyPrice required' });
    const data = { slug, name, description, price, yearlyPrice, currency, features, isActive,
                   displayOrder, maxMarketsTracked, apiCallsPerMin, advancedAnalytics,
                   bookieBookAccess, predictionEngine, oddsAlerts, telegramNotifications,
                   createdBy: req.user.userId };
    const plan = await prisma.subscriptionPlan.upsert({
      where: { slug },
      update: data,
      create: data
    });
    await auditLog(req.user, 'plan_create', 'plan', plan.id, plan.slug, { after: plan }, '', req);
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/plans/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { name, description, price, yearlyPrice, currency, features, isActive, displayOrder,
            maxMarketsTracked, apiCallsPerMin, advancedAnalytics, bookieBookAccess,
            predictionEngine, oddsAlerts, telegramNotifications } = req.body;
    const data = Object.fromEntries(Object.entries({ name, description, price, yearlyPrice, currency,
      features, isActive, displayOrder, maxMarketsTracked, apiCallsPerMin, advancedAnalytics,
      bookieBookAccess, predictionEngine, oddsAlerts, telegramNotifications
    }).filter(([, v]) => v !== undefined));
    const before = await prisma.subscriptionPlan.findUnique({ where: { id: +req.params.id } });
    const plan = await prisma.subscriptionPlan.update({ where: { id: +req.params.id }, data });
    await auditLog(req.user, 'plan_update', 'plan', plan.id, plan.slug, { before, after: plan }, '', req);
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== COUPONS ====================
router.get('/coupons', requireAdmin, async (req, res) => {
  try {
    const coupons = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/coupons', requireSuperAdmin, async (req, res) => {
  try {
    const { code, description, discountType, discountValue, maxDiscount, applicablePlans,
            usageLimit, perUserLimit, validFrom, validUntil, isActive } = req.body;
    if (!code || !discountType || discountValue === undefined || !validFrom || !validUntil)
      return res.status(400).json({ success: false, message: 'code, discountType, discountValue, validFrom, validUntil required' });
    const coupon = await prisma.promoCode.create({
      data: { code, description, discountType, discountValue, maxDiscount, applicablePlans,
              usageLimit, perUserLimit, validFrom, validUntil, isActive, createdBy: req.user.userId }
    });
    await auditLog(req.user, 'coupon_create', 'coupon', coupon.id, coupon.code, { after: coupon }, '', req);
    res.json({ success: true, data: coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/coupons/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { description, discountType, discountValue, maxDiscount, applicablePlans,
            usageLimit, perUserLimit, validFrom, validUntil, isActive } = req.body;
    const data = Object.fromEntries(Object.entries({ description, discountType, discountValue,
      maxDiscount, applicablePlans, usageLimit, perUserLimit, validFrom, validUntil, isActive
    }).filter(([, v]) => v !== undefined));
    const coupon = await prisma.promoCode.update({ where: { id: +req.params.id }, data });
    res.json({ success: true, data: coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== SETTINGS ====================
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const settings = await prisma.siteSettings.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] });
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/settings/:key', requireSuperAdmin, async (req, res) => {
  try {
    const before = await prisma.siteSettings.findUnique({ where: { key: req.params.key } });
    const setting = await prisma.siteSettings.upsert({
      where: { key: req.params.key },
      update: { value: req.body.value, updatedBy: req.user.userId },
      create: { key: req.params.key, value: req.body.value, updatedBy: req.user.userId }
    });
    await auditLog(req.user, 'settings_update', 'settings', setting.id, setting.key, { before, after: setting }, req.body.reason, req);
    res.json({ success: true, data: setting });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== SUBSCRIPTION LOGS ====================
router.get('/subscription-logs', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', paymentStatus = '', planSlug = '', status = '' } = req.query;
    const safeLimit = Math.min(+limit || 50, 100);
    const where = {};
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (planSlug) where.planSlug = planSlug;
    if (status) where.status = status;
    if (search) {
      where.user = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [logs, total] = await Promise.all([
      prisma.userSubscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (+page - 1) * safeLimit,
        take: safeLimit,
        select: {
          id: true, planSlug: true, amount: true, currency: true, discountAmount: true, couponCode: true,
          startedAt: true, expiresAt: true, billingCycle: true, paymentStatus: true, paymentMethod: true,
          gatewayOrderId: true, gatewayPaymentId: true, paidAt: true, status: true,
          cancelledAt: true, cancelReason: true, createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.userSubscription.count({ where }),
    ]);
    res.json({ success: true, data: logs, pagination: { page: +page, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== AUDIT LOGS ====================
router.get('/audit-logs', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, action = '', adminId = '' } = req.query;
    const safeLimit = Math.min(+limit || 50, 100);
    const where = {};
    if (action) where.action = action;
    if (adminId) where.adminId = +adminId;

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (+page - 1) * safeLimit, take: safeLimit,
        include: { admin: { select: { name: true, email: true } } }
      }),
      prisma.adminAuditLog.count({ where })
    ]);
    res.json({ success: true, data: logs, pagination: { page: +page, limit: safeLimit, total } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
