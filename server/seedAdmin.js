const bcrypt = require('bcryptjs');
const prisma = require('./db/prisma');

const DEFAULT_PLANS = [
  {
    slug: 'free', name: 'Free Plan',
    description: 'Basic access. Upgrade to Pro for live odds, predictions, and all premium features.',
    price: 0, yearlyPrice: 0, currency: 'INR',
    features: ['Browse landing page', 'View plan details', 'Limited preview'],
    maxMarketsTracked: 0, apiCallsPerMin: 5,
    advancedAnalytics: false, bookieBookAccess: false, predictionEngine: false,
    oddsAlerts: false, telegramNotifications: false, displayOrder: 0
  },
  {
    slug: 'pro', name: 'Pro Plan',
    description: 'Full access to live odds, AI predictions, volume analysis, bookie P&L, and all premium features.',
    price: 999, yearlyPrice: 9999, currency: 'INR',
    features: [
      'Real-time Betfair odds & volume', 'AI match predictions & confidence scores',
      'Bookie P&L analysis', 'Market load & money flow', 'Back/Lay ratio tracking',
      'Price history charts', 'Odds alerts & notifications', 'Unlimited markets tracked'
    ],
    maxMarketsTracked: 9999, apiCallsPerMin: 100,
    advancedAnalytics: true, bookieBookAccess: true, predictionEngine: true,
    oddsAlerts: true, telegramNotifications: true, displayOrder: 1
  }
];

const DEFAULT_SETTINGS = [
  { key: 'siteName', value: 'CricketEdge', category: 'general', description: 'Site name displayed across platform', isPublic: true },
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

async function seedDatabase() {
  try {
    for (const plan of DEFAULT_PLANS) {
      await prisma.subscriptionPlan.upsert({ where: { slug: plan.slug }, update: plan, create: plan });
    }
    console.log('✅ Plans seeded');

    for (const setting of DEFAULT_SETTINGS) {
      await prisma.siteSettings.upsert(settingsUpsertArgs(setting));
    }
    console.log('✅ Settings seeded');

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      console.warn('⚠️  ADMIN_EMAIL and ADMIN_PASSWORD env vars not set — skipping superadmin seed');
      return;
    }
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (!existingAdmin) {
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

module.exports = { seedDatabase, DEFAULT_PLANS, DEFAULT_SETTINGS, settingsUpsertArgs };
