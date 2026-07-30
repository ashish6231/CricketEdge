require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscription');
const adminRoutes = require('./routes/admin');
const cricketRoutes = require('./routes/cricket');
const cronRoutes = require('./routes/cron');
const { verifyToken } = require('./middleware/auth');
const tennisLogin = require('./services/tennisLogin');
const scraper = require('./services/scraper');
const prisma = require('./db/prisma');

const app = express();

// ─── MIDDLEWARE ───
const allowedOrigins = [
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : []),
  'https://cricketedge-gct4.onrender.com',
  'https://cricketedge.app',
  'https://cricket-edge-online.vercel.app',
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:3000'] : [])
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '50kb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Too many attempts, try again after 15 minutes' } });
const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: { success: false, message: 'Too many OTP requests, try again after 10 minutes' } });
const adminLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { success: false, message: 'Too many admin requests' } });

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));

try {
  const passport = require('./config/passport');
  app.use(passport.initialize());
  app.use(passport.session());
} catch {
  console.log('⚠️  Passport not configured');
}

// ─── DB + SEED (once per cold start) ───
let _initialized = false;
async function _init() {
  if (_initialized) return;
  _initialized = true;
  try {
    await prisma.$connect();
    const { seedDatabase } = require('./seedAdmin');
    await seedDatabase();
  } catch (e) {
    console.log('⚠️  DB init skipped:', e.message);
  }
  tennisLogin.startAutoLogin().catch(() => {});
}

app.use(async (req, res, next) => {
  await _init();
  next();
});

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
app.use('/api/cron', cronRoutes);
app.use('/api', cricketRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'OK' });
});

app.get('/api/user/subscription', verifyToken, (req, res) => {
  res.json({ success: true, userId: req.user.userId, plan: req.user.plan || 'free' });
});

// ─── LOCAL DEV: server.listen ───
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🏏 CricketEdge server running on port ${PORT}`));
}

module.exports = app;
