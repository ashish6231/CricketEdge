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
const prisma = require('./db/prisma');

const app = express();
const server = http.createServer(app);

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
      console.log(`🔄 Auto-activated queued Pro for ${user.email}`);
    }

    await prisma.user.updateMany({
      where: {
        subPlanSlug: 'pro', subStatus: 'active',
        subExpiresAt: { lte: now }, queuedStatus: { not: 'pending' }
      },
      data: { subStatus: 'expired', subPlanSlug: 'free' }
    });
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
  try {
    await prisma.$connect();
    const dbHost = process.env.DATABASE_URL?.split('@')[1]?.split('?')[0];
    console.log(`✅ PostgreSQL connected: ${dbHost}`);

    const { seedDatabase } = require('./seedAdmin');
    await seedDatabase();
  } catch (e) {
    console.log('⚠️  DB seed skipped:', e.message);
  }

  server.listen(PORT, () => {
    console.log(`🏏 CricketEdge server running on port ${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} already in use.`);
      process.exit(1);
    } else throw err;
  });

  tennisLogin.startAutoLogin();
  scraper.warmup();
})();
