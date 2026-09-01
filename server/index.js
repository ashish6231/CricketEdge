require('dotenv').config();

const fs = require('fs');
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscription');
const adminRoutes = require('./routes/admin');
const cricketRoutes = require('./routes/cricket');
const { verifyToken } = require('./middleware/auth');
const tennisLogin = require('./services/tennisLogin');
const scraper = require('./services/scraper');
const prisma = require('./db/prisma');
const { setIo } = require('./socketInstance');
const { getAllowedOrigins } = require('./lib/publicUrl');
const { startTossCaptureWorker } = require('./services/tossCaptureWorker');
const { startMatchCaptureWorker } = require('./services/matchCaptureWorker');
const { expireAllTrials } = require('./lib/subscriptionAccess');

const allowedOrigins = getAllowedOrigins();

const app = express();
// Railway/Vercel sit behind a reverse proxy — required for rate-limit + sessions
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new (require('socket.io').Server)(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(null, false);
    },
    credentials: true,
  },
});
setIo(io);
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    const { JWT_SECRET } = require('./middleware/auth');
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    socket.join(`user:${decoded.userId}`);
    next();
  } catch { next(new Error('Invalid token')); }
});

// ─── MIDDLEWARE ───
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    // Do not throw — Express would turn this into HTTP 500
    return cb(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '50kb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Too many attempts, try again after 15 minutes' } });
const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: { success: false, message: 'Too many OTP requests, try again after 10 minutes' } });
const adminLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { success: false, message: 'Too many admin requests' } });
app.use(session({
  secret: process.env.SESSION_SECRET || (() => { throw new Error('SESSION_SECRET env var not set!'); })(),
  resave: false,
  saveUninitialized: false,
    cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  }
}));

try {
  const passport = require('./config/passport');
  app.use(passport.initialize());
  app.use(passport.session());
} catch {
  console.log('⚠️  Passport not configured');
}

// ─── ROUTES ───
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', otpLimiter);
app.use('/api/auth/verify-otp', otpLimiter);
app.use('/api/auth/resend-otp', otpLimiter);
app.use('/api/admin', adminLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', cricketRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'OK' });
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

    await expireAllTrials(prisma);
  } catch (err) {
    console.error('❌ Subscription auto-activation error:', err.message);
  }
}, 60 * 60 * 1000);

// Serve frontend only if dist exists (API-only Railway deploy is OK)
const distCandidates = [
  path.join(__dirname, '../frontend/dist'),
  path.join(__dirname, '../client/dist'),
];
const staticDir = distCandidates.find(d => fs.existsSync(path.join(d, 'index.html')));
if (staticDir) {
  app.use(express.static(staticDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ success: false, detail: 'Not found' });
    }
    res.sendFile(path.join(staticDir, 'index.html'), (err) => {
      if (err) res.status(404).json({ error: 'Not found' });
    });
  });
}

const PORT = process.env.PORT || 5000;
let shuttingDown = false;
let shutdownComplete = false;
let tossCaptureWorker = null;
let matchCaptureWorker = null;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down...`);
  tossCaptureWorker?.stop();
  matchCaptureWorker?.stop();
  scraper.stopSessionKeepAlive();

  server.close(async closeError => {
    if (shutdownComplete) return;
    shutdownComplete = true;

    if (closeError) {
      console.error('HTTP server shutdown failed:', closeError.message);
    }
    try {
      await prisma.$disconnect();
    } catch (error) {
      console.error('Prisma shutdown failed:', error.message);
      closeError ||= error;
    }
    process.exit(closeError ? 1 : 0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

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

  server.listen(PORT, '0.0.0.0', () => {
    const { getApiPublicUrl, getFrontendUrl } = require('./lib/publicUrl');
    console.log(`🏏 CricEdge server running on port ${PORT}`);
    console.log(`   API: ${getApiPublicUrl()}`);
    console.log(`   Frontend: ${getFrontendUrl()}`);
    console.log(`   CORS: ${allowedOrigins.join(', ')}`);
    tossCaptureWorker = startTossCaptureWorker({});
    matchCaptureWorker = startMatchCaptureWorker({});
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} already in use.`);
      process.exit(1);
    } else throw err;
  });

  tennisLogin.startAutoLogin();
  scraper.warmup();
  scraper.startSessionKeepAlive();
})();
