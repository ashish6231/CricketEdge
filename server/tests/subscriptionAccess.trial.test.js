const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getTrialConfig,
  grantTrialIfEligible,
  grantTrialToNewUser,
} = require('../lib/subscriptionAccess');

function eligibleUser(overrides = {}) {
  return {
    id: 1,
    role: 'user',
    status: 'active',
    subPlanSlug: 'free',
    subStatus: 'active',
    subExpiresAt: null,
    subPlanId: null,
    subStartedAt: null,
    subAutoRenew: false,
    ...overrides,
  };
}

function createFakePrisma({ settings = [], user = eligibleUser() } = {}) {
  const state = {
    settings: settings.map((row) => ({ ...row })),
    user: { ...user },
    subscriptions: [],
    plan: { id: 1, slug: 'pro' },
  };

  return {
    state,
    siteSettings: {
      findMany: async ({ where } = {}) => {
        const keys = where?.key?.in;
        if (!keys) return state.settings.map((row) => ({ ...row }));
        return state.settings.filter((row) => keys.includes(row.key)).map((row) => ({ ...row }));
      },
    },
    user: {
      findUnique: async ({ where }) => {
        if (!state.user || state.user.id !== where.id) return null;
        return { ...state.user };
      },
      update: async ({ where, data }) => {
        if (!state.user || state.user.id !== where.id) return null;
        Object.assign(state.user, data);
        return { ...state.user };
      },
    },
    userSubscription: {
      create: async ({ data }) => {
        const row = { id: state.subscriptions.length + 1, ...data };
        state.subscriptions.push(row);
        return { ...row };
      },
      count: async ({ where }) => {
        return state.subscriptions.filter((s) => {
          if (where.userId != null && s.userId !== where.userId) return false;
          if (where.planSlug != null && s.planSlug !== where.planSlug) return false;
          return true;
        }).length;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const s of state.subscriptions) {
          if (where.userId != null && s.userId !== where.userId) continue;
          if (where.status && s.status !== where.status) continue;
          if (where.planSlug && s.planSlug !== where.planSlug) continue;
          Object.assign(s, data);
          count++;
        }
        return { count };
      },
    },
    subscriptionPlan: {
      findFirst: async ({ where }) => {
        if (where?.slug === state.plan.slug) return { ...state.plan };
        return null;
      },
    },
  };
}

test('getTrialConfig falls back to 30-minute defaults when settings rows are missing', async () => {
  const prisma = createFakePrisma({ settings: [] });
  const cfg = await getTrialConfig(prisma);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.value, 30);
  assert.equal(cfg.unit, 'minutes');
  assert.equal(cfg.minutes, 30);
  assert.equal(cfg.label, '30-minute');
});

test('grantTrialIfEligible returns trial_disabled and does not grant when trialEnabled is false', async () => {
  const prisma = createFakePrisma({
    settings: [
      { key: 'trialEnabled', value: false },
      { key: 'trialDurationValue', value: 30 },
      { key: 'trialDurationUnit', value: 'minutes' },
    ],
  });

  const result = await grantTrialIfEligible(prisma, 1);

  assert.equal(result.granted, false);
  assert.equal(result.reason, 'trial_disabled');
  assert.equal(result.user.subPlanSlug, 'free');
  assert.equal(prisma.state.subscriptions.length, 0);
});

test('grantTrialIfEligible uses configured duration (2 hours) for expiry', async () => {
  const now = new Date('2026-08-17T00:00:00.000Z');
  const prisma = createFakePrisma({
    settings: [
      { key: 'trialEnabled', value: true },
      { key: 'trialDurationValue', value: 2 },
      { key: 'trialDurationUnit', value: 'hours' },
    ],
  });

  const result = await grantTrialIfEligible(prisma, 1, { now });

  assert.equal(result.granted, true);
  assert.equal(result.user.subPlanSlug, 'trial');
  assert.equal(new Date(result.user.subExpiresAt).toISOString(), '2026-08-17T02:00:00.000Z');
});

test('grantTrialIfEligible defaults to 30 minutes when settings rows are missing', async () => {
  const now = new Date('2026-08-17T00:00:00.000Z');
  const prisma = createFakePrisma({ settings: [] });

  const result = await grantTrialIfEligible(prisma, 1, { now });

  assert.equal(result.granted, true);
  assert.equal(new Date(result.user.subExpiresAt).toISOString(), '2026-08-17T00:30:00.000Z');
});

test('grantTrialToNewUser returns trial_disabled result and does not grant when disabled', async () => {
  const prisma = createFakePrisma({
    settings: [{ key: 'trialEnabled', value: false }],
  });

  const result = await grantTrialToNewUser(prisma, 1);

  assert.equal(result.granted, false);
  assert.equal(result.reason, 'trial_disabled');
  assert.equal(result.user.subPlanSlug, 'free');
  assert.equal(prisma.state.subscriptions.length, 0);
});

test('disable does not revoke an already-active trial', async () => {
  const expiresAt = new Date('2026-08-17T12:00:00.000Z');
  const now = new Date('2026-08-17T10:00:00.000Z');
  const prisma = createFakePrisma({
    settings: [{ key: 'trialEnabled', value: false }],
    user: eligibleUser({
      subPlanSlug: 'trial',
      subStatus: 'active',
      subExpiresAt: expiresAt,
    }),
  });

  const result = await grantTrialIfEligible(prisma, 1, { now });

  assert.equal(result.granted, false);
  assert.equal(result.reason, 'trial_active');
  assert.equal(result.user.subPlanSlug, 'trial');
  assert.equal(new Date(result.user.subExpiresAt).toISOString(), expiresAt.toISOString());
});
