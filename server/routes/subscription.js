const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const prisma = require('../db/prisma');
const { expireTrialIfNeeded, expireTrialForProUpgrade, getTrialDaysLeft, isActiveTrial, refreshUserSubscriptionState } = require('../lib/subscriptionAccess');

function getRazorpay() {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || RAZORPAY_KEY_ID.startsWith('your_')) return null;
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
}

// GET /api/subscription/plans
router.get('/plans', async (req, res) => {
  try {
    const plan = await prisma.subscriptionPlan.findFirst({ where: { slug: 'pro', isActive: true } });
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not available' });
    res.json({ success: true, data: [plan] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/subscription/my
router.get('/my', verifyToken, async (req, res) => {
  try {
    let user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        subPlanSlug: true, subStatus: true, subStartedAt: true, subExpiresAt: true, subAutoRenew: true,
        queuedPlanSlug: true, queuedBillingCycle: true, queuedAmount: true, queuedStatus: true, queuedPurchasedAt: true,
        name: true, email: true, role: true
      }
    });
    user = await refreshUserSubscriptionState(prisma, req.user.userId) || user;
    const history = await prisma.userSubscription.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    res.json({
      success: true,
      subscription: {
        planSlug: user.subPlanSlug, status: user.subStatus, startedAt: user.subStartedAt,
        expiresAt: user.subExpiresAt, autoRenew: user.subAutoRenew,
        isTrial: isActiveTrial(user), trialDaysLeft: getTrialDaysLeft(user),
      },
      queuedSubscription: user.queuedPlanSlug ? { planSlug: user.queuedPlanSlug, billingCycle: user.queuedBillingCycle, amount: user.queuedAmount, status: user.queuedStatus, purchasedAt: user.queuedPurchasedAt } : null,
      history
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/subscription/check-expiry
router.get('/check-expiry', verifyToken, async (req, res) => {
  try {
    let user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { subPlanSlug: true, subStatus: true, subExpiresAt: true, queuedPlanSlug: true, queuedStatus: true, role: true }
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user = await refreshUserSubscriptionState(prisma, req.user.userId) || user;

    const now = new Date();
    const expiresAt = user.subExpiresAt ? new Date(user.subExpiresAt) : null;

    if (user.subPlanSlug === 'trial' && expiresAt) {
      const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
      return res.json({
        success: true,
        isTrial: true,
        expiresSoon: daysLeft <= 3 && daysLeft >= 0,
        daysLeft: daysLeft > 0 ? daysLeft : 0,
        expiresAt,
        queued: false,
      });
    }

    if (!expiresAt || user.subPlanSlug !== 'pro')
      return res.json({ success: true, expiresSoon: false, daysLeft: null, queued: false, isTrial: false });

    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    res.json({
      success: true,
      expiresSoon: daysLeft <= 3 && daysLeft >= 0,
      daysLeft: daysLeft > 0 ? daysLeft : 0,
      expiresAt,
      queued: user.queuedPlanSlug && user.queuedStatus === 'pending',
      queuedDetails: user.queuedPlanSlug ? { planSlug: user.queuedPlanSlug, status: user.queuedStatus } : null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/subscription/create-order
router.post('/create-order', verifyToken, async (req, res) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay)
      return res.status(503).json({ success: false, message: 'Payment gateway not configured.' });

    const { billingCycle = 'monthly' } = req.body;
    if (!['monthly', 'yearly'].includes(billingCycle))
      return res.status(400).json({ success: false, message: 'Invalid billing cycle' });

    const plan = await prisma.subscriptionPlan.findFirst({ where: { slug: 'pro', isActive: true } });
    if (!plan) return res.status(404).json({ success: false, message: 'Pro plan not found' });

    const amount = billingCycle === 'yearly' ? plan.yearlyPrice : plan.price;
    const now = new Date();
    const expiresAt = new Date(now);
    if (billingCycle === 'yearly') expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    else expiresAt.setMonth(expiresAt.getMonth() + 1);

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `sub_${req.user.userId}_${Date.now()}`,
      notes: { userId: String(req.user.userId), planSlug: 'pro', billingCycle }
    });

    const sub = await prisma.userSubscription.create({
      data: {
        userId: req.user.userId, planId: plan.id, planSlug: 'pro',
        amount, startedAt: now, expiresAt, billingCycle,
        paymentStatus: 'pending', paymentMethod: 'razorpay',
        gatewayOrderId: razorpayOrder.id, status: 'pending'
      }
    });

    res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      subscriptionId: sub.id
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/subscription/verify-payment
router.post('/verify-payment', verifyToken, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });

    const sub = await prisma.userSubscription.findFirst({
      where: { userId: req.user.userId, gatewayOrderId: razorpay_order_id, paymentStatus: 'pending' }
    });
    if (!sub) return res.status(404).json({ success: false, message: 'Pending order not found' });

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await prisma.userSubscription.update({ where: { id: sub.id }, data: { paymentStatus: 'failed' } });
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    const now = new Date();
    await prisma.userSubscription.update({
      where: { id: sub.id },
      data: { paymentStatus: 'completed', gatewayPaymentId: razorpay_payment_id, paidAt: now, status: 'active' }
    });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    const hasActivePro = user.subPlanSlug === 'pro' && user.subStatus === 'active' &&
                         user.subExpiresAt && new Date(user.subExpiresAt) > now;

    if (hasActivePro) {
      await prisma.userSubscription.update({
        where: { id: sub.id },
        data: { startedAt: new Date(user.subExpiresAt) }
      });
      await prisma.user.update({
        where: { id: user.id },
        data: {
          queuedPlanId: sub.planId, queuedPlanSlug: 'pro',
          queuedBillingCycle: sub.billingCycle, queuedAmount: sub.amount,
          queuedStatus: 'pending', queuedPurchasedAt: now
        }
      });
      return res.json({
        success: true, queued: true,
        message: `Payment successful! Pro plan queued — it will auto-activate when your current plan ends on ${new Date(user.subExpiresAt).toLocaleDateString()}.`,
        currentExpiresAt: user.subExpiresAt
      });
    }

    await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        subPlanId: sub.planId, subPlanSlug: 'pro', subStatus: 'active',
        subStartedAt: sub.startedAt, subExpiresAt: sub.expiresAt, subAutoRenew: true,
        queuedPlanId: null, queuedPlanSlug: null, queuedBillingCycle: null,
        queuedAmount: null, queuedStatus: null, queuedPurchasedAt: null
      }
    });

    await expireTrialForProUpgrade(prisma, req.user.userId, now);
    await prisma.userSubscription.updateMany({
      where: {
        userId: req.user.userId,
        status: 'active',
        id: { not: sub.id },
        planSlug: { not: 'pro' },
      },
      data: { status: 'expired', cancelledAt: now, cancelReason: 'Upgraded to Pro' },
    });

    res.json({ success: true, data: sub, message: 'Payment successful! Pro plan activated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/subscription/payment-failed
router.post('/payment-failed', verifyToken, async (req, res) => {
  try {
    const { razorpay_order_id } = req.body;
    if (razorpay_order_id) {
      await prisma.userSubscription.updateMany({
        where: { userId: req.user.userId, gatewayOrderId: razorpay_order_id, paymentStatus: 'pending' },
        data: { paymentStatus: 'failed', status: 'cancelled' }
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
