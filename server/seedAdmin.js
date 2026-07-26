const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const SubscriptionPlan = require('./models/SubscriptionPlan');
const SiteSettings = require('./models/SiteSettings');

const DEFAULT_PLANS = [
  {
    slug: 'free',
    name: 'Free Plan',
    description: 'Basic access. Upgrade to Pro for live odds, predictions, and all premium features.',
    price: 0,
    yearlyPrice: 0,
    currency: 'INR',
    features: [
      'Browse landing page',
      'View plan details',
      'Limited preview'
    ],
    limits: {
      maxMarketsTracked: 0,
      apiCallsPerMin: 5,
      advancedAnalytics: false,
      bookieBookAccess: false,
      predictionEngine: false,
      oddsAlerts: false,
      telegramNotifications: false
    },
    displayOrder: 0
  },
  {
    slug: 'pro',
    name: 'Pro Plan',
    description: 'Full access to live odds, AI predictions, volume analysis, bookie P&L, and all premium features.',
    price: 999, // ₹999 INR
    yearlyPrice: 9999, // ₹9,999 yearly (2 months free)
    currency: 'INR',
    features: [
      'Real-time Betfair odds & volume',
      'AI match predictions & confidence scores',
      'Bookie P&L analysis',
      'Market load & money flow',
      'Back/Lay ratio tracking',
      'Price history charts',
      'Odds alerts & notifications',
      'Unlimited markets tracked'
    ],
    limits: {
      maxMarketsTracked: 9999,
      apiCallsPerMin: 100,
      advancedAnalytics: true,
      bookieBookAccess: true,
      predictionEngine: true,
      oddsAlerts: true,
      telegramNotifications: true
    },
    displayOrder: 1
  }
];

const DEFAULT_SETTINGS = [
  { key: 'siteName', value: 'CricketEdge', category: 'general', description: 'Site name displayed across platform', isPublic: true },
  { key: 'maintenanceMode', value: false, category: 'maintenance', description: 'Put site in maintenance mode', isPublic: true },
  { key: 'allowSignups', value: true, category: 'general', description: 'Allow new user registrations', isPublic: true },
  { key: 'defaultOddsFormat', value: 'decimal', category: 'general', description: 'Default odds format for new users', isPublic: true }
];

async function seedDatabase() {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cricketedge';
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    // Seed Free + Pro plans
    for (const plan of DEFAULT_PLANS) {
      await SubscriptionPlan.findOneAndUpdate({ slug: plan.slug }, plan, { upsert: true, new: true });
    }
    console.log('✅ Free + Pro plans seeded');

    // Seed site settings
    for (const setting of DEFAULT_SETTINGS) {
      await SiteSettings.findOneAndUpdate({ key: setting.key }, setting, { upsert: true, new: true });
    }
    console.log('✅ Site settings seeded');

    // Seed superadmin if not exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@cricketedge.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      const hashed = await bcrypt.hash(adminPassword, 10);
      const now = new Date();
      const proplan = await SubscriptionPlan.findOne({ slug: 'pro' }).lean();
      const superadmin = await User.create({
        email: adminEmail,
        password: hashed,
        name: 'Super Admin',
        role: 'superadmin',
        status: 'active',
        isVerified: true,
        subscription: { planId: proplan?._id, planSlug: 'pro', status: 'active', startedAt: now, expiresAt: new Date('2099-12-31') }
      });
      const UserSubscription = require('./models/UserSubscription');
      await UserSubscription.create({
        userId: superadmin._id, planId: proplan?._id, planSlug: 'pro',
        amount: 0, startedAt: now, expiresAt: new Date('2099-12-31'),
        billingCycle: 'yearly', 'payment.status': 'completed',
        'payment.method': 'wallet', 'payment.paidAt': now, status: 'active'
      });
      console.log(`✅ Super admin created: ${adminEmail} / ${adminPassword}`);
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

module.exports = { seedDatabase, DEFAULT_PLANS, DEFAULT_SETTINGS };
