const test = require('node:test');
const assert = require('node:assert/strict');
const { createSubscriptionPayments, validatePaymentSettings, validateSubmission, subscriptionEnd } = require('../services/subscriptionPayments');
const { hasFeatureAccess } = require('../lib/subscriptionAccess');

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const clone = value => structuredClone(value);

function fakePrisma(overrides = {}) {
  const state = {
    settings: { enabled: true, qrImage: PNG, payeeName: 'CricEdge', upiId: 'cricedge@upi' },
    plans: {
      lite: { id: 2, slug: 'lite', name: 'CricEdge Lite', price: 699, yearlyPrice: 6999, currency: 'INR', isActive: true },
      pro: { id: 3, slug: 'pro', name: 'CricEdge Pro', price: 999, yearlyPrice: 9999, currency: 'INR', isActive: true },
    },
    users: { 7: { id: 7, email: 'member@example.com', name: 'Member', role: 'user', status: 'active', subPlanSlug: 'free', subStatus: 'none', subExpiresAt: null } },
    requests: [], subscriptions: [], audits: [], ...overrides,
  };

  const apiFor = working => ({
    siteSettings: { findUnique: async () => ({ value: working.settings }) },
    subscriptionPlan: { findUnique: async ({ where }) => working.plans[where.slug] || null },
    user: {
      findUnique: async ({ where }) => working.users[where.id] ? clone(working.users[where.id]) : null,
      update: async ({ where, data }) => (working.users[where.id] = { ...working.users[where.id], ...clone(data) }),
    },
    subscriptionPaymentRequest: {
      count: async ({ where }) => working.requests.filter(row => row.userId === where.userId && row.status === where.status).length,
      create: async ({ data }) => {
        if (working.requests.some(row => row.utr === data.utr)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        const row = { id: working.requests.length + 1, status: 'pending', reviewReason: '', reviewedAt: null, subscriptionId: null, createdAt: new Date(), ...clone(data) };
        working.requests.push(row); return clone(row);
      },
      findUnique: async ({ where }) => { const row = working.requests.find(item => item.id === where.id); return row ? clone(row) : null },
      updateMany: async ({ where, data }) => {
        const row = working.requests.find(item => item.id === where.id && item.status === where.status);
        if (!row) return { count: 0 };
        Object.assign(row, clone(data)); return { count: 1 };
      },
      update: async ({ where, data }) => { const row = working.requests.find(item => item.id === where.id); Object.assign(row, clone(data)); return clone(row) },
    },
    userSubscription: {
      updateMany: async ({ where, data }) => { working.subscriptions.filter(item => item.userId === where.userId && item.status === where.status).forEach(item => Object.assign(item, clone(data))); return { count: 0 } },
      create: async ({ data }) => { const row = { id: working.subscriptions.length + 100, ...clone(data) }; working.subscriptions.push(row); return clone(row) },
    },
    adminAuditLog: { create: async ({ data }) => { if (working.failAudit) throw new Error('audit unavailable'); working.audits.push(clone(data)); return data } },
    $queryRaw: async () => [{ id: 7 }],
  });
  const prisma = apiFor(state);
  prisma.$transaction = async callback => {
    const working = clone(state);
    const result = await callback(apiFor(working));
    Object.keys(state).forEach(key => { state[key] = working[key] });
    return result;
  };
  return { prisma, state };
}

test('QR settings accept supported image data and reject unsafe values', () => {
  assert.equal(validatePaymentSettings({ enabled: true, qrImage: PNG, payeeName: ' CricEdge ', upiId: ' pay@upi ' }).payeeName, 'CricEdge');
  assert.throws(() => validatePaymentSettings({ enabled: true, qrImage: '' }), /Upload a payment QR/);
  assert.throws(() => validatePaymentSettings({ enabled: true, qrImage: 'https://example.com/qr.png' }), /PNG, JPEG or WebP/);
  assert.throws(() => validatePaymentSettings({ enabled: true, qrImage: 'data:image/png;base64,PHN2Zz4=' }), /valid PNG/);
});

test('payment submission is tied to the signed-in email, price and normalized UTR', async () => {
  const { prisma, state } = fakePrisma();
  const service = createSubscriptionPayments(prisma);
  const request = await service.submit(7, { email: 'MEMBER@example.com', planSlug: 'lite', billingCycle: 'monthly', amount: 699, utr: ' 123456789012 ' });
  assert.equal(request.utr, '123456789012');
  assert.equal(request.amount, 699);
  assert.equal(state.users[7].subPlanSlug, 'free', 'submission must not activate access');
  assert.equal(state.subscriptions.length, 0);
  await assert.rejects(() => service.submit(7, { email: 'member@example.com', planSlug: 'pro', billingCycle: 'monthly', amount: 999, utr: '234567890123' }), /already have a request/);
  await assert.rejects(() => service.submit(7, { email: 'other@example.com', planSlug: 'lite', billingCycle: 'monthly', amount: 699, utr: '345678901234' }), /signed-in CricEdge account/);
});

test('server plan price cannot be overridden by the browser', async () => {
  const { prisma, state } = fakePrisma();
  const service = createSubscriptionPayments(prisma);
  await assert.rejects(() => service.submit(7, { email: 'member@example.com', planSlug: 'pro', billingCycle: 'monthly', amount: 1, utr: '456789012345' }), /pricing has changed/);
  assert.equal(state.requests.length, 0);
});

test('active users cannot buy the same plan twice or downgrade Pro to Lite', async () => {
  const activeUser = plan => ({ id: 7, email: 'member@example.com', name: 'Member', role: 'user', status: 'active', subPlanSlug: plan, subStatus: 'active', subExpiresAt: new Date('2099-01-01') });
  const pro = fakePrisma({ users: { 7: activeUser('pro') } });
  const proService = createSubscriptionPayments(pro.prisma);
  await assert.rejects(() => proService.submit(7, { email: 'member@example.com', planSlug: 'pro', billingCycle: 'monthly', amount: 999, utr: '789012345678' }), /already active/);
  await assert.rejects(() => proService.submit(7, { email: 'member@example.com', planSlug: 'lite', billingCycle: 'monthly', amount: 699, utr: '890123456789' }), /included in your Pro/);
  assert.equal(pro.state.requests.length, 0);

  const lite = fakePrisma({ users: { 7: activeUser('lite') } });
  const liteService = createSubscriptionPayments(lite.prisma);
  await assert.rejects(() => liteService.submit(7, { email: 'member@example.com', planSlug: 'lite', billingCycle: 'monthly', amount: 699, utr: '901234567890' }), /already active/);
  const upgrade = await liteService.submit(7, { email: 'member@example.com', planSlug: 'pro', billingCycle: 'monthly', amount: 999, utr: '012345678901' });
  assert.equal(upgrade.planSlug, 'pro');
});

test('superadmin approval activates the requested plan exactly once', async () => {
  const { prisma, state } = fakePrisma({ requests: [{
    id: 41, userId: 7, email: 'member@example.com', planId: 3, planSlug: 'pro', planName: 'CricEdge Pro', billingCycle: 'monthly', amount: 999,
    currency: 'INR', utr: '987654321012', status: 'pending', reviewReason: '', reviewedAt: null, subscriptionId: null, createdAt: new Date('2026-11-02T10:00:00Z'),
  }] });
  const service = createSubscriptionPayments(prisma);
  const now = new Date('2026-11-02T12:00:00Z');
  const result = await service.review(41, { userId: 1, email: 'owner@example.com', role: 'superadmin' }, { action: 'approve', reason: 'Verified in bank' }, now);
  assert.equal(result.request.status, 'approved');
  assert.equal(state.users[7].subPlanSlug, 'pro');
  assert.equal(state.users[7].subStatus, 'active');
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.subscriptions[0].paymentMethod, 'upi_manual');
  assert.equal(state.subscriptions[0].gatewayPaymentId, '987654321012');
  assert.equal(state.requests[0].subscriptionId, state.subscriptions[0].id);
  assert.equal(state.audits.length, 1);
  for (const feature of ['cricket', 'toss', 'session', 'tennis']) assert.equal(hasFeatureAccess(state.users[7], feature, now), true);
  await assert.rejects(() => service.review(41, { userId: 1, role: 'superadmin' }, { action: 'approve' }, now), /already been reviewed/);
  assert.equal(state.subscriptions.length, 1);
});

test('Lite approval grants Cricket, Toss and Session but keeps Tennis locked', async () => {
  const { prisma, state } = fakePrisma({ requests: [{
    id: 42, userId: 7, email: 'member@example.com', planId: 2, planSlug: 'lite', planName: 'CricEdge Lite', billingCycle: 'monthly', amount: 699,
    currency: 'INR', utr: '876543210123', status: 'pending', reviewReason: '', reviewedAt: null, subscriptionId: null, createdAt: new Date('2026-11-02T10:00:00Z'),
  }] });
  const now = new Date('2026-11-02T12:00:00Z');
  await createSubscriptionPayments(prisma).review(42, { userId: 1, email: 'owner@example.com', role: 'superadmin' }, { action: 'approve' }, now);
  assert.equal(state.users[7].subPlanSlug, 'lite');
  for (const feature of ['cricket', 'toss', 'session']) assert.equal(hasFeatureAccess(state.users[7], feature, now), true);
  assert.equal(hasFeatureAccess(state.users[7], 'tennis', now), false);
});

test('rejection never changes subscription access and requires a reason', async () => {
  const request = { id: 8, userId: 7, email: 'member@example.com', planId: 2, planSlug: 'lite', planName: 'CricEdge Lite', billingCycle: 'yearly', amount: 6999, currency: 'INR', utr: '567890123456', status: 'pending', reviewReason: '', reviewedAt: null, subscriptionId: null, createdAt: new Date() };
  const { prisma, state } = fakePrisma({ requests: [request] });
  const service = createSubscriptionPayments(prisma);
  await assert.rejects(() => service.review(8, { userId: 1, role: 'superadmin' }, { action: 'reject', reason: '' }), /short rejection reason/);
  await service.review(8, { userId: 1, email: 'owner@example.com', role: 'superadmin' }, { action: 'reject', reason: 'UTR not found' });
  assert.equal(state.requests[0].status, 'rejected');
  assert.equal(state.users[7].subPlanSlug, 'free');
  assert.equal(state.subscriptions.length, 0);
});

test('approval rolls back access and request status if any transaction step fails', async () => {
  const request = { id: 9, userId: 7, email: 'member@example.com', planId: 2, planSlug: 'lite', planName: 'CricEdge Lite', billingCycle: 'monthly', amount: 699, currency: 'INR', utr: '678901234567', status: 'pending', reviewReason: '', reviewedAt: null, subscriptionId: null, createdAt: new Date() };
  const { prisma, state } = fakePrisma({ requests: [request], failAudit: true });
  await assert.rejects(() => createSubscriptionPayments(prisma).review(9, { userId: 1, email: 'owner@example.com', role: 'superadmin' }, { action: 'approve' }), /audit unavailable/);
  assert.equal(state.requests[0].status, 'pending');
  assert.equal(state.users[7].subPlanSlug, 'free');
  assert.equal(state.subscriptions.length, 0);
});

test('approval is superadmin-only and month-end renewal is clamped correctly', async () => {
  for (const utr of ['12345678901', '1234567890123', '12345678901A', 'bad-id!']) {
    assert.throws(() => validateSubmission({ email: 'x@y.com', utr, planSlug: 'lite', billingCycle: 'monthly' }, 'x@y.com'), /12-digit numeric/);
  }
  assert.equal(subscriptionEnd(new Date('2027-01-31T12:00:00Z'), 'monthly').toISOString(), '2027-02-28T12:00:00.000Z');
  assert.equal(subscriptionEnd(new Date('2028-02-29T12:00:00Z'), 'yearly').toISOString(), '2029-02-28T12:00:00.000Z');
  const { prisma } = fakePrisma({ requests: [] });
  await assert.rejects(() => createSubscriptionPayments(prisma).review(1, { role: 'admin' }, { action: 'approve' }), /Superadmin access/);
});
