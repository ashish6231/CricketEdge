const express = require('express');
const { rateLimit } = require('express-rate-limit');
const prisma = require('../db/prisma');
const authMiddleware = require('../middleware/auth');
// Keep route registration fail-closed even in isolated tests that replace the auth module.
const verifyToken = typeof authMiddleware.verifyToken === 'function'
  ? authMiddleware.verifyToken
  : (_req, res) => res.status(500).json({ success: false, message: 'Authentication middleware unavailable' });
const clearAuthCache = typeof authMiddleware.clearAuthCache === 'function' ? authMiddleware.clearAuthCache : () => {};
const { requireSuperAdmin } = require('../middleware/admin');
const { pagination } = require('../lib/pagination');
const { publicCache } = require('../lib/readCache');
const { createSubscriptionPayments, validatePaymentSettings, PAYMENT_SETTINGS_KEY, requestSelect } = require('../services/subscriptionPayments');
const service = createSubscriptionPayments(prisma);
const userRouter = express.Router();
const adminRouter = express.Router();

const handleError = (res, error) => res.status(error.status || 500).json({ success: false,
  message: error.status ? error.message : 'Payment requests are temporarily unavailable. Please try again.' });
function emitUser(userId, event, payload) {
  try { require('../socketInstance').getIo()?.to(`user:${userId}`).emit(event, payload); } catch {}
}

userRouter.get('/payment-settings', async (_req, res) => {
  try {
    const settings = await publicCache.remember('upi-payment-settings', () => service.getSettings());
    res.json({ success: true, data: settings.enabled ? settings : { enabled: false, qrImage: '', payeeName: '', upiId: '' } });
  } catch (error) { handleError(res, error); }
});

userRouter.get('/payment-requests', verifyToken, async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query, 10, 50);
    const where = { userId: req.user.userId };
    const [data, total] = await Promise.all([
      prisma.subscriptionPaymentRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit, select: requestSelect }),
      prisma.subscriptionPaymentRequest.count({ where }),
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { handleError(res, error); }
});

const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyGenerator: req => String(req.user.userId),
  message: { success: false, message: 'Too many payment submissions. Please contact admin or try again later.' } });
userRouter.post('/payment-requests', verifyToken, submitLimiter, async (req, res) => {
  try {
    const data = await service.submit(req.user.userId, req.body);
    try { require('../socketInstance').getIo()?.to('superadmins').emit('paymentRequestCreated', { id: data.id }); } catch {}
    res.status(201).json({ success: true, data, message: 'Payment request submitted. Your plan activates after superadmin approval.' });
  } catch (error) { handleError(res, error); }
});

adminRouter.get('/payment-settings', requireSuperAdmin, async (_req, res) => {
  try { res.set('Cache-Control', 'no-store').json({ success: true, data: await service.getSettings() }); }
  catch (error) { handleError(res, error); }
});
adminRouter.patch('/payment-settings', requireSuperAdmin, async (req, res) => {
  try {
    const data = validatePaymentSettings(req.body);
    await prisma.$transaction(async tx => {
      await tx.siteSettings.upsert({ where: { key: PAYMENT_SETTINGS_KEY }, create: {
        key: PAYMENT_SETTINGS_KEY, value: data, category: 'payments', description: 'Manual UPI subscription checkout', isPublic: false, updatedBy: req.user.userId,
      }, update: { value: data, updatedBy: req.user.userId } });
      await tx.adminAuditLog.create({ data: {
        adminId: req.user.userId, adminEmail: req.user.email, action: 'payment_settings_update', targetType: 'settings', targetId: 0, targetIdentifier: PAYMENT_SETTINGS_KEY,
        changesAfter: { enabled: data.enabled, payeeName: data.payeeName, upiId: data.upiId, qrConfigured: Boolean(data.qrImage) },
      } });
    });
    await publicCache.invalidate('upi-payment-settings');
    res.json({ success: true, data });
  } catch (error) { handleError(res, error); }
});

adminRouter.get('/payment-requests', requireSuperAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query, 20, 50);
    const status = req.query.status || 'pending';
    if (!['all', 'pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid request status' });
    const search = String(req.query.search || '').trim().slice(0, 120);
    const where = { ...(status !== 'all' ? { status } : {}), ...(search ? { OR: [{ email: { contains: search } }, { utr: { contains: search } }] } : {}) };
    const [data, total, grouped] = await Promise.all([
      prisma.subscriptionPaymentRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit,
        select: { ...requestSelect, user: { select: { name: true, subPlanSlug: true, subExpiresAt: true } }, reviewedBy: { select: { name: true } } } }),
      prisma.subscriptionPaymentRequest.count({ where }),
      prisma.subscriptionPaymentRequest.groupBy({ by: ['status'], _count: { id: true } }),
    ]);
    res.set('Cache-Control', 'no-store').json({ success: true, data, counts: Object.fromEntries(grouped.map(row => [row.status, row._count.id])), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { handleError(res, error); }
});

adminRouter.post('/payment-requests/:id/review', requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Invalid request ID' });
    const result = await service.review(id, req.user, req.body || {});
    if (result.subscription) {
      clearAuthCache();
      require('./auth').clearMeCache();
      emitUser(result.request.userId, 'planUpdate', result.subscription);
    }
    emitUser(result.request.userId, 'paymentRequestUpdate', { id, status: result.request.status });
    res.json({ success: true, data: result.request, message: result.subscription ? 'Payment approved and plan activated.' : 'Payment request rejected.' });
  } catch (error) { handleError(res, error); }
});

module.exports = { userRouter, adminRouter };
