const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const UserSubscription = require('../models/UserSubscription');
const User = require('../models/User');

function getRazorpay() {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || RAZORPAY_KEY_ID.startsWith('your_')) return null;
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
}

// GET /api/subscription/plans — public, returns only Pro plan
router.get('/plans', async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findOne({ slug: 'pro', isActive: true }).lean();
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not available' });
    res.json({ success: true, data: [plan] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/subscription/my — current user's subscription
router.get('/my', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('subscription queuedSubscription name email').lean();
    const history = await UserSubscription.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    res.json({ success: true, subscription: user.subscription, queuedSubscription: user.queuedSubscription, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/subscription/check-expiry — check if subscription expires in 3 days
router.get('/check-expiry', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('subscription queuedSubscription').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const now = new Date();
    const expiresAt = user.subscription?.expiresAt ? new Date(user.subscription.expiresAt) : null;
    
    if (!expiresAt || user.subscription.planSlug !== 'pro') {
      return res.json({ success: true, expiresSoon: false, daysLeft: null, queued: false });
    }

    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    const expiresSoon = daysLeft <= 3 && daysLeft >= 0;
    const hasQueued = !!user.queuedSubscription?.planSlug && user.queuedSubscription.status === 'pending';

    res.json({
      success: true,
      expiresSoon,
      daysLeft: daysLeft > 0 ? daysLeft : 0,
      expiresAt,
      queued: hasQueued,
      queuedDetails: hasQueued ? user.queuedSubscription : null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/subscription/create-order — start a Razorpay order for Pro (no plan/queue change until payment is verified)
router.post('/create-order', verifyToken, async (req, res) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(503).json({ success: false, message: 'Payment gateway not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.' });
    }

    const { billingCycle = 'monthly' } = req.body;
    if (!['monthly', 'yearly'].includes(billingCycle)) {
      return res.status(400).json({ success: false, message: 'Invalid billing cycle' });
    }

    const plan = await SubscriptionPlan.findOne({ slug: 'pro', isActive: true });
    if (!plan) return res.status(404).json({ success: false, message: 'Pro plan not found' });

    const amount = billingCycle === 'yearly' ? plan.yearlyPrice : plan.price;
    const now = new Date();

    const expiresAt = new Date(now);
    if (billingCycle === 'yearly') expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    else expiresAt.setMonth(expiresAt.getMonth() + 1);

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: `sub_${req.user.userId}_${Date.now()}`,
      notes: { userId: String(req.user.userId), planSlug: 'pro', billingCycle }
    });

    // Ledger entry created up front, in 'pending' state — nothing on the User doc changes until verify-payment succeeds
    const sub = await UserSubscription.create({
      userId: req.user.userId,
      planId: plan._id,
      planSlug: 'pro',
      amount,
      startedAt: now,
      expiresAt,
      billingCycle,
      'payment.status': 'pending',
      'payment.method': 'razorpay',
      'payment.gatewayOrderId': razorpayOrder.id,
      status: 'pending'
    });

    res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      subscriptionId: sub._id
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/subscription/verify-payment — confirm Razorpay signature, then activate or queue the plan
router.post('/verify-payment', verifyToken, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    const sub = await UserSubscription.findOne({
      userId: req.user.userId,
      'payment.gatewayOrderId': razorpay_order_id,
      'payment.status': 'pending'
    });
    if (!sub) return res.status(404).json({ success: false, message: 'Pending order not found' });

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      sub.payment.status = 'failed';
      await sub.save();
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    const now = new Date();
    sub.payment.status = 'completed';
    sub.payment.gatewayPaymentId = razorpay_payment_id;
    sub.payment.paidAt = now;
    sub.status = 'active';
    await sub.save();

    const user = await User.findById(req.user.userId);
    const hasActivePro = user.subscription?.planSlug === 'pro' &&
                         user.subscription?.status === 'active' &&
                         user.subscription?.expiresAt &&
                         new Date(user.subscription.expiresAt) > now;

    // Already on active Pro — update the existing sub record's dates and queue it
    if (hasActivePro) {
      sub.startedAt = new Date(user.subscription.expiresAt); // starts when current ends
      await sub.save();

      user.queuedSubscription = {
        planId: sub.planId,
        planSlug: 'pro',
        billingCycle: sub.billingCycle,
        amount: sub.amount,
        status: 'pending',
        purchasedAt: now
      };
      await user.save();

      return res.json({
        success: true,
        queued: true,
        message: `Payment successful! Pro plan queued — it will auto-activate when your current plan ends on ${new Date(user.subscription.expiresAt).toLocaleDateString()}.`,
        currentExpiresAt: user.subscription.expiresAt
      });
    }

    await User.findByIdAndUpdate(req.user.userId, {
      'subscription.planId': sub.planId,
      'subscription.planSlug': 'pro',
      'subscription.status': 'active',
      'subscription.startedAt': sub.startedAt,
      'subscription.expiresAt': sub.expiresAt,
      'subscription.autoRenew': true,
      $unset: { queuedSubscription: 1 }
    });

    res.json({ success: true, data: sub, message: 'Payment successful! Pro plan activated — you now have full dashboard access.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/subscription/payment-failed — client reports a failed/cancelled Razorpay checkout
router.post('/payment-failed', verifyToken, async (req, res) => {
  try {
    const { razorpay_order_id } = req.body;
    if (razorpay_order_id) {
      await UserSubscription.updateOne(
        { userId: req.user.userId, 'payment.gatewayOrderId': razorpay_order_id, 'payment.status': 'pending' },
        { 'payment.status': 'failed', status: 'cancelled' }
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
