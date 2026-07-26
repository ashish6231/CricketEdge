require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscription');
const adminRoutes = require('./routes/admin');
const cricketRoutes = require('./routes/cricket');
const { verifyToken } = require('./middleware/auth');
const tennisLogin = require('./services/tennisLogin');
const scraper = require('./services/scraper');

const app = express();
const server = http.createServer(app);

// ─── MONGODB ───
let mongoConnected = false;
try {
  const mongoose = require('mongoose');
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cricketedge';
  mongoose.connect(MONGO_URI)
    .then(async () => {
      mongoConnected = true;
      console.log('✅ MongoDB connected');
      try {
        const { seedDatabase } = require('./seedAdmin');
        await seedDatabase();
      } catch (e) {
        console.log('⚠️  Seed skipped:', e.message);
      }
    })
    .catch(err => console.log('⚠️  MongoDB not available:', err.message));
} catch {
  console.log('⚠️  MongoDB not installed');
}

// ─── MIDDLEWARE ───
app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'cricketedge_session_secret_dev',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

try {
  const passport = require('./config/passport');
  app.use(passport.initialize());
  app.use(passport.session());
} catch {
  console.log('⚠️  Passport not configured');
}

// ─── ROUTES ───
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', cricketRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/user/subscription', verifyToken, (req, res) => {
  res.json({ success: true, userId: req.user.userId, plan: req.user.plan || 'free' });
});

// ─── SUBSCRIPTION AUTO-ACTIVATION (every 1 hour) ───
setInterval(async () => {
  if (!mongoConnected) return;
  try {
    const now = new Date();
    const User = require('./models/User');
    const UserSubscription = require('./models/UserSubscription');

    const expiredUsers = await User.find({
      'subscription.planSlug': 'pro',
      'subscription.status': 'active',
      'subscription.expiresAt': { $lte: now },
      'queuedSubscription.status': 'pending'
    });

    for (const user of expiredUsers) {
      const q = user.queuedSubscription;
      const now2 = new Date();
      const newExpiresAt = new Date(now2);
      if (q.billingCycle === 'yearly') newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);
      else newExpiresAt.setMonth(newExpiresAt.getMonth() + 1);

      await UserSubscription.findOneAndUpdate(
        { userId: user._id, planSlug: 'pro', status: 'active' },
        { startedAt: now2, expiresAt: newExpiresAt, 'payment.paidAt': now2 }
      );
      await User.findByIdAndUpdate(user._id, {
        'subscription.planId': q.planId,
        'subscription.planSlug': 'pro',
        'subscription.status': 'active',
        'subscription.startedAt': now2,
        'subscription.expiresAt': newExpiresAt,
        'subscription.autoRenew': true,
        $unset: { queuedSubscription: 1 }
      });
      console.log(`🔄 Auto-activated queued Pro for ${user.email}`);
    }

    await User.updateMany(
      {
        'subscription.planSlug': 'pro',
        'subscription.status': 'active',
        'subscription.expiresAt': { $lte: now },
        $or: [{ queuedSubscription: { $exists: false } }, { 'queuedSubscription.status': { $ne: 'pending' } }]
      },
      { 'subscription.status': 'expired', 'subscription.planSlug': 'free' }
    );
  } catch (err) {
    console.error('❌ Subscription auto-activation error:', err.message);
  }
}, 60 * 60 * 1000);

// Serve frontend
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 5000;

(async () => {
  server.listen(PORT, () => {
    console.log(`🏏 CricketEdge auth server running on port ${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} already in use.`);
      process.exit(1);
    } else throw err;
  });

  // Auto-login to tennisliveload in background
  tennisLogin.startAutoLogin();

  // Warmup scraper cache
  scraper.warmup();
})();
