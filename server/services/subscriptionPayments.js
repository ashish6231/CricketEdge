const { PAID_PLAN_SLUGS, hasActiveSubscription } = require('../lib/subscriptionAccess');

const PAYMENT_SETTINGS_KEY = 'subscriptionUpiPayment';
const requestSelect = {
  id: true, userId: true, email: true, planSlug: true, planName: true, billingCycle: true,
  amount: true, currency: true, utr: true, status: true, reviewReason: true,
  reviewedAt: true, createdAt: true, subscriptionId: true,
};
const fail = (status, message) => Object.assign(new Error(message), { status });

function validatePaymentSettings(input) {
  if (!input || typeof input !== 'object') throw fail(400, 'Payment settings are required');
  const { enabled, qrImage = '', payeeName = '', upiId = '' } = input;
  if (typeof enabled !== 'boolean') throw fail(400, 'Choose whether UPI payments are enabled');
  if (typeof payeeName !== 'string' || payeeName.trim().length > 100 || typeof upiId !== 'string' || upiId.trim().length > 100) throw fail(400, 'Payee name and UPI ID must be under 100 characters');
  if (typeof qrImage !== 'string') throw fail(400, 'Upload a PNG, JPEG or WebP QR image');
  if (qrImage) {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(qrImage);
    if (!match) throw fail(400, 'Upload a PNG, JPEG or WebP QR image');
    const bytes = Buffer.from(match[2], 'base64');
    const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid || bytes.length > 512 * 1024) throw fail(400, 'QR image must be a valid PNG, JPEG or WebP under 512 KB');
  }
  if (enabled && !qrImage) throw fail(400, 'Upload a payment QR before enabling UPI payments');
  return { enabled, qrImage, payeeName: payeeName.trim(), upiId: upiId.trim() };
}

function validateSubmission(input, accountEmail) {
  const { email, utr, planSlug, billingCycle } = input || {};
  if (typeof email !== 'string' || email.trim().toLowerCase() !== accountEmail?.toLowerCase()) throw fail(400, 'Enter the email address of your signed-in CricEdge account');
  if (!PAID_PLAN_SLUGS.includes(planSlug)) throw fail(400, 'Choose CricEdge Lite or CricEdge Pro');
  if (!['monthly', 'yearly'].includes(billingCycle)) throw fail(400, 'Choose monthly or yearly billing');
  const reference = typeof utr === 'string' ? utr.trim() : '';
  if (!/^\d{12}$/.test(reference)) throw fail(400, 'Enter a valid 12-digit numeric UPI transaction ID / UTR');
  return { email: email.trim().toLowerCase(), utr: reference, planSlug, billingCycle };
}

function subscriptionEnd(start, billingCycle) {
  const result = new Date(start);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + (billingCycle === 'yearly' ? 12 : 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function createSubscriptionPayments(prisma) {
  async function getSettings() {
    const row = await prisma.siteSettings.findUnique({ where: { key: PAYMENT_SETTINGS_KEY } });
    return row?.value ? validatePaymentSettings(row.value) : { enabled: false, qrImage: '', payeeName: '', upiId: '' };
  }

  async function submit(userId, input) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: {
      id: true, email: true, role: true, status: true, subPlanSlug: true, subStatus: true, subExpiresAt: true,
    } });
    if (!user || user.status !== 'active') throw fail(403, 'An active CricEdge account is required');
    const fields = validateSubmission(input, user.email);
    if (hasActiveSubscription(user)) {
      if (user.subPlanSlug === fields.planSlug) throw fail(409, `${fields.planSlug === 'pro' ? 'CricEdge Pro' : 'CricEdge Lite'} is already active on your account`);
      if (user.subPlanSlug === 'pro' && fields.planSlug === 'lite') throw fail(409, 'CricEdge Lite is already included in your Pro plan');
    }
    const settings = await getSettings();
    if (!settings.enabled || !settings.qrImage) throw fail(409, 'UPI payments are not available yet. Please contact our admin.');
    const plan = await prisma.subscriptionPlan.findUnique({ where: { slug: fields.planSlug } });
    if (!plan?.isActive) throw fail(400, 'This plan is not available');
    const amount = fields.billingCycle === 'yearly' ? plan.yearlyPrice : plan.price;
    if (!Number.isInteger(amount) || amount <= 0 || plan.currency !== 'INR') throw fail(409, 'Payment details are being updated. Please contact our admin.');
    if (Number(input.amount) !== amount) throw fail(409, 'Plan pricing has changed. Please contact admin if you have already paid.');
    try {
      return await prisma.$transaction(async tx => {
        // Serialize submissions per account and enforce one pending request.
        await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
        if (await tx.subscriptionPaymentRequest.count({ where: { userId, status: 'pending' } })) throw fail(409, 'You already have a request awaiting review. Check your payment requests below.');
        return tx.subscriptionPaymentRequest.create({ data: { ...fields, userId, planId: plan.id, planName: plan.name, amount, currency: 'INR' }, select: requestSelect });
      });
    } catch (error) {
      if (error.code === 'P2002') throw fail(409, 'This transaction ID has already been submitted. Please check your requests or contact admin.');
      throw error;
    }
  }

  async function review(id, reviewer, { action, reason = '' }, now = new Date()) {
    if (reviewer?.role !== 'superadmin') throw fail(403, 'Superadmin access required');
    if (!['approve', 'reject'].includes(action)) throw fail(400, 'Choose approve or reject');
    if (typeof reason !== 'string' || reason.trim().length > 500) throw fail(400, 'Review note must be under 500 characters');
    if (action === 'reject' && reason.trim().length < 3) throw fail(400, 'Add a short rejection reason for the user');
    return prisma.$transaction(async tx => {
      const payment = await tx.subscriptionPaymentRequest.findUnique({ where: { id } });
      if (!payment) throw fail(404, 'Payment request not found');
      if (payment.status !== 'pending') throw fail(409, 'This request has already been reviewed');
      const claimed = await tx.subscriptionPaymentRequest.updateMany({ where: { id, status: 'pending' }, data: {
        status: action === 'approve' ? 'approved' : 'rejected', reviewedById: reviewer.userId, reviewedAt: now, reviewReason: reason.trim(),
      } });
      if (claimed.count !== 1) throw fail(409, 'This request has already been reviewed');
      let user;
      if (action === 'approve') {
        if (!PAID_PLAN_SLUGS.includes(payment.planSlug)) throw fail(409, 'The requested plan is no longer supported');
        await tx.$queryRaw`SELECT id FROM User WHERE id = ${payment.userId} FOR UPDATE`;
        user = await tx.user.findUnique({ where: { id: payment.userId } });
        if (!user || user.status !== 'active' || user.email.toLowerCase() !== payment.email.toLowerCase()) throw fail(409, 'The target account is inactive or its email has changed. Review the account before approving.');
        const renewing = user.subPlanSlug === payment.planSlug && user.subStatus === 'active' && user.subExpiresAt && new Date(user.subExpiresAt) > now;
        const expiresAt = subscriptionEnd(renewing ? user.subExpiresAt : now, payment.billingCycle);
        await tx.userSubscription.updateMany({ where: { userId: payment.userId, status: 'active' }, data: { status: 'expired', cancelledAt: now, cancelReason: 'Replaced by approved UPI payment' } });
        const subscription = await tx.userSubscription.create({ data: {
          userId: payment.userId, planId: payment.planId, planSlug: payment.planSlug,
          amount: payment.amount, currency: payment.currency, billingCycle: payment.billingCycle,
          startedAt: now, expiresAt, status: 'active', paymentStatus: 'completed', paymentMethod: 'upi_manual',
          gatewayPaymentId: payment.utr, gatewayOrderId: `upi_request_${id}`, paidAt: now,
        } });
        user = await tx.user.update({ where: { id: payment.userId }, data: {
          subPlanId: payment.planId, subPlanSlug: payment.planSlug, subStatus: 'active', subStartedAt: now, subExpiresAt: expiresAt, subAutoRenew: false,
          queuedPlanId: null, queuedPlanSlug: null, queuedBillingCycle: null, queuedAmount: null, queuedStatus: null, queuedPurchasedAt: null,
        } });
        await tx.subscriptionPaymentRequest.update({ where: { id }, data: { subscriptionId: subscription.id } });
      }
      await tx.adminAuditLog.create({ data: {
        adminId: reviewer.userId, adminEmail: reviewer.email || '', action: `payment_${action}`, targetType: 'payment_request', targetId: id,
        targetIdentifier: payment.email, changesBefore: { status: 'pending' },
        changesAfter: { status: action === 'approve' ? 'approved' : 'rejected', planSlug: payment.planSlug, amount: payment.amount }, reason: reason.trim(),
      } });
      return { request: await tx.subscriptionPaymentRequest.findUnique({ where: { id }, select: requestSelect }),
        subscription: user ? { planSlug: user.subPlanSlug, status: user.subStatus, expiresAt: user.subExpiresAt } : null };
    }, { timeout: 10000 });
  }
  return { getSettings, submit, review };
}

module.exports = { createSubscriptionPayments, validatePaymentSettings, validateSubmission, subscriptionEnd, PAYMENT_SETTINGS_KEY, requestSelect };
