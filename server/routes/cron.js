const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');

// Called by Vercel Cron every hour: "0 * * * *"
// Secured with CRON_SECRET env var
router.get('/activate-subscriptions', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const now = new Date();

    const expiredWithQueued = await prisma.user.findMany({
      where: {
        subPlanSlug: 'pro', subStatus: 'active',
        subExpiresAt: { lte: now }, queuedStatus: 'pending'
      }
    });

    for (const user of expiredWithQueued) {
      const newExpiresAt = new Date();
      if (user.queuedBillingCycle === 'yearly') newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);
      else newExpiresAt.setMonth(newExpiresAt.getMonth() + 1);

      await prisma.userSubscription.updateMany({
        where: { userId: user.id, planSlug: 'pro', status: 'active' },
        data: { startedAt: now, expiresAt: newExpiresAt, paidAt: now }
      });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          subPlanId: user.queuedPlanId, subPlanSlug: 'pro', subStatus: 'active',
          subStartedAt: now, subExpiresAt: newExpiresAt, subAutoRenew: true,
          queuedPlanId: null, queuedPlanSlug: null, queuedBillingCycle: null,
          queuedAmount: null, queuedStatus: null, queuedPurchasedAt: null
        }
      });
    }

    await prisma.user.updateMany({
      where: {
        subPlanSlug: 'pro', subStatus: 'active',
        subExpiresAt: { lte: now }, queuedStatus: { not: 'pending' }
      },
      data: { subStatus: 'expired', subPlanSlug: 'free' }
    });

    res.json({ success: true, activated: expiredWithQueued.length });
  } catch (err) {
    console.error('❌ Cron error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
