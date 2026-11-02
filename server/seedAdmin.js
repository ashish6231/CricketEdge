const { normalizeGmailEmail, GMAIL_REQUIRED_MESSAGE } = require('./shared/accountEmail.mjs');
const bcrypt = require('bcryptjs');
const prisma = require('./db/prisma');

const DEFAULT_PLANS = [
  {
    slug: 'free', name: 'Free Plan',
    description: 'Free access to completed match details. Subscribe for live and upcoming markets.',
    price: 0, yearlyPrice: 0, currency: 'INR',
    features: ['Browse landing page', 'View plan details', 'Limited preview'],
    maxMarketsTracked: 0, apiCallsPerMin: 5,
    advancedAnalytics: false, bookieBookAccess: false, predictionEngine: false,
    oddsAlerts: false, telegramNotifications: false, displayOrder: 0
  },
  {
    slug: 'lite', name: 'CricEdge Lite',
    description: 'Your complete cricket companion — Cricket, Toss and Session markets.',
    price: 699, yearlyPrice: 6999, currency: 'INR',
    features: ['Live & upcoming Cricket matches', 'Toss markets & predictions', 'Session markets', 'Bookie P&L and volume analysis', 'Back/Lay ratios & price history'],
    maxMarketsTracked: 9999, apiCallsPerMin: 100,
    advancedAnalytics: true, bookieBookAccess: true, predictionEngine: true,
    oddsAlerts: true, telegramNotifications: true, displayOrder: 1
  },
  {
    slug: 'pro', name: 'CricEdge Pro',
    description: 'Cricket, Toss and Tennis with every premium feature included.',
    price: 999, yearlyPrice: 9999, currency: 'INR',
    features: [
      'Everything in CricEdge Lite', 'Live & upcoming Tennis matches',
      'Tennis odds & market flow', 'All predictions and analytics', 'Unlimited markets tracked'
    ],
    maxMarketsTracked: 9999, apiCallsPerMin: 100,
    advancedAnalytics: true, bookieBookAccess: true, predictionEngine: true,
    oddsAlerts: true, telegramNotifications: true, displayOrder: 2
  }
];

const DEFAULT_SETTINGS = [
  { key: 'siteName', value: 'CricEdge', category: 'general', description: 'Site name displayed across platform', isPublic: true },
  { key: 'maintenanceMode', value: false, category: 'maintenance', description: 'Put site in maintenance mode', isPublic: true },
  { key: 'signupMode', value: 'admin_only', category: 'general', description: 'Who can create accounts: admin_only | public | both', isPublic: true },
  { key: 'allowSignups', value: false, category: 'general', description: 'Allow new user registrations', isPublic: true },
  { key: 'defaultOddsFormat', value: 'decimal', category: 'general', description: 'Default odds format for new users', isPublic: true },
  { key: 'trialEnabled', value: true, category: 'trial', description: 'Allow granting free trials to new/eligible users', isPublic: false },
  { key: 'trialDurationValue', value: 30, category: 'trial', description: 'Free trial duration magnitude', isPublic: false },
  { key: 'trialDurationUnit', value: 'minutes', category: 'trial', description: 'Free trial duration unit: minutes | hours | days', isPublic: false },
];

function settingsUpsertArgs(setting) {
  return {
    where: { key: setting.key },
    create: setting,
    update: {
      description: setting.description,
      category: setting.category,
      isPublic: setting.isPublic,
    },
  };
}

async function seedSubscriptionPlans() {
  const versionKey = 'membershipTiersVersion';
  const configured = await prisma.siteSettings.findUnique({ where: { key: versionKey } });
  for (const plan of DEFAULT_PLANS) {
    const { price, yearlyPrice, ...metadata } = plan;
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: { ...metadata, ...(!configured ? { price, yearlyPrice } : {}) },
      create: plan,
    });
  }
  await prisma.subscriptionPlan.updateMany({ where: { slug: { in: ['cricket', 'cricket_tennis', 'cricket_toss'] } }, data: { isActive: false } });
  await prisma.siteSettings.upsert({ where: { key: versionKey }, create: { key: versionKey, value: 1, category: 'general', description: 'Lite and Pro plans initialized', isPublic: false }, update: {} });
}

async function seedDatabase() {
  try {
    await seedSubscriptionPlans();
    console.log('✅ Plans seeded');

    for (const setting of DEFAULT_SETTINGS) {
      await prisma.siteSettings.upsert(settingsUpsertArgs(setting));
    }
    console.log('✅ Settings seeded');

    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      console.warn('⚠️  ADMIN_EMAIL and ADMIN_PASSWORD env vars not set — skipping superadmin seed');
      return;
    }
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (!existingAdmin) {
      if (!normalizeGmailEmail(adminEmail)) {
        console.warn(`⚠️  Superadmin seed skipped: ${GMAIL_REQUIRED_MESSAGE}`);
        return;
      }
      const hashed = await bcrypt.hash(adminPassword, 10);
      const now = new Date();
      const proPlan = await prisma.subscriptionPlan.findUnique({ where: { slug: 'pro' } });

      const superadmin = await prisma.user.create({
        data: {
          email: adminEmail, password: hashed, name: 'Super Admin',
          role: 'superadmin', status: 'active', isVerified: true,
          subPlanId: proPlan?.id, subPlanSlug: 'pro', subStatus: 'active',
          subStartedAt: now, subExpiresAt: new Date('2099-12-31')
        }
      });

      if (proPlan) {
        await prisma.userSubscription.create({
          data: {
            userId: superadmin.id, planId: proPlan.id, planSlug: 'pro',
            amount: 0, startedAt: now, expiresAt: new Date('2099-12-31'),
            billingCycle: 'yearly', paymentStatus: 'completed',
            paymentMethod: 'wallet', paidAt: now, status: 'active'
          }
        });
      }
      console.log(`✅ Super admin created: ${adminEmail}`);
    } else {
      console.log('ℹ️ Admin already exists');
    }

    console.log('Seeding complete!');
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}

if (require.main === module) {
  seedDatabase().then(() => process.exit(0));
}

module.exports = { seedDatabase, seedSubscriptionPlans, DEFAULT_PLANS, DEFAULT_SETTINGS, settingsUpsertArgs };
