const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();
const { generateToken } = require('../middleware/auth');
const prisma = require('../db/prisma');

let emailEnabled = false;
let transporter = null;
try {
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '' }
  });
  transporter.verify((err) => { if (!err) emailEnabled = true; });
} catch { /* nodemailer not installed */ }

async function sendOTP(email, otp, name) {
  const subject = 'CricketEdge - Password Reset OTP';
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f172a;color:#fff;border-radius:16px;">
      <h2 style="margin:0 0 8px;font-size:24px;">🔐 Password Reset</h2>
      <p style="color:#94a3b8;margin:0 0 24px;">Hi ${name}, use this OTP to reset your CricketEdge password.</p>
      <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
        <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#6366f1;">${otp}</div>
        <div style="font-size:12px;color:#64748b;margin-top:8px;">Valid for 10 minutes</div>
      </div>
      <p style="color:#64748b;font-size:13px;">If you didn't request this, ignore this email.</p>
    </div>
  `;
  if (emailEnabled && transporter) {
    await transporter.sendMail({ from: process.env.SMTP_USER || 'noreply@cricketedge.app', to: email, subject, html });
  } else {
    console.log(`\n📧 OTP EMAIL TO ${email}:\nSubject: ${subject}\nOTP: ${otp}\n`);
  }
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar || '',
    role: user.role || 'user',
    subscription: {
      planSlug: user.subPlanSlug || 'free',
      status: user.subStatus || 'active',
      expiresAt: user.subExpiresAt
    }
  };
}

// ─── REGISTER ───
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Name, email and password required' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    const now = new Date();

    const user = await prisma.user.create({
      data: {
        name, email: email.toLowerCase(), password: hashed,
        authProvider: 'local', isVerified: true, role: 'user',
        subPlanSlug: 'free', subStatus: 'active', subStartedAt: now, subAutoRenew: false
      }
    });

    const freePlan = await prisma.subscriptionPlan.findUnique({ where: { slug: 'free' } });
    if (freePlan) {
      await prisma.userSubscription.create({
        data: {
          userId: user.id, planId: freePlan.id, planSlug: 'free',
          amount: 0, startedAt: now, expiresAt: new Date('2099-12-31'),
          billingCycle: 'monthly', paymentStatus: 'completed',
          paymentMethod: 'wallet', paidAt: now, status: 'active'
        }
      });
    }

    const token = generateToken(user);
    await prisma.user.update({ where: { id: user.id }, data: { activeToken: token } });
    res.json({ success: true, message: 'Account created successfully', token, user: sanitizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── LOGIN ───
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.authProvider !== 'local')
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (user.status === 'banned')
      return res.status(403).json({ success: false, message: 'Your account has been banned. Contact support.' });
    if (user.status === 'suspended')
      return res.status(403).json({ success: false, message: 'Your account is suspended. Contact support.' });

    const token = generateToken(user);
    await prisma.user.update({ where: { id: user.id }, data: { activeToken: token } });
    res.json({ success: true, message: 'Login successful', token, user: sanitizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── FORGOT PASSWORD ───
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.authProvider !== 'local')
      return res.status(404).json({ success: false, message: 'No account found with this email' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: otp, otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), otpPurpose: 'reset_password' }
    });

    await sendOTP(user.email, otp, user.name);
    res.json({ success: true, message: 'OTP sent to your email', email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── VERIFY OTP ───
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.otpCode !== otp)
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    if (new Date() > user.otpExpiresAt)
      return res.status(400).json({ success: false, message: 'OTP expired' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpires: new Date(Date.now() + 30 * 60 * 1000) }
    });
    res.json({ success: true, message: 'OTP verified', resetToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── RESET PASSWORD ───
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword || newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'Valid reset token and password (6+ chars) required' });

    const user = await prisma.user.findFirst({
      where: { resetToken, resetTokenExpires: { gt: new Date() } }
    });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(newPassword, 12),
        otpCode: null, otpExpiresAt: null, otpPurpose: null,
        resetToken: null, resetTokenExpires: null
      }
    });
    res.json({ success: true, message: 'Password reset successful. Please login.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── RESEND OTP ───
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.authProvider !== 'local')
      return res.status(404).json({ success: false, message: 'No account found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: otp, otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000) }
    });
    await sendOTP(user.email, otp, user.name);
    res.json({ success: true, message: 'OTP resent to your email' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET ME ───
router.get('/me', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'No token' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cricketedge_jwt_secret_change_in_production');

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.status === 'banned')
      return res.status(403).json({ success: false, message: 'Account banned', code: 'ACCOUNT_BANNED' });

    res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// ─── GOOGLE ID TOKEN VERIFY ───
router.post('/google/verify', async (req, res) => {
  try {
    const { credential, userInfo } = req.body;
    if (!credential && !userInfo)
      return res.status(400).json({ success: false, message: 'credential required' });

    let googleId, email, name, avatar;

    if (userInfo && userInfo.sub) {
      ({ sub: googleId, email, name, picture: avatar } = userInfo);
    } else {
      const { OAuth2Client } = require('google-auth-library');
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      ({ sub: googleId, email, name, picture: avatar } = payload);
    }

    let user = await prisma.user.findUnique({ where: { googleId } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, authProvider: 'google', avatar: user.avatar || avatar, name: name || user.name }
        });
      } else {
        const now = new Date();
        user = await prisma.user.create({
          data: {
            name, email: email.toLowerCase(), googleId,
            authProvider: 'google', isVerified: true, avatar: avatar || '',
            role: 'user', subPlanSlug: 'free', subStatus: 'active', subStartedAt: now, subAutoRenew: false
          }
        });
        const freePlan = await prisma.subscriptionPlan.findUnique({ where: { slug: 'free' } });
        if (freePlan) {
          await prisma.userSubscription.create({
            data: {
              userId: user.id, planId: freePlan.id, planSlug: 'free',
              amount: 0, startedAt: now, expiresAt: new Date('2099-12-31'),
              billingCycle: 'monthly', paymentStatus: 'completed',
              paymentMethod: 'wallet', paidAt: now, status: 'active'
            }
          });
        }
      }
    }

    if (user.status === 'banned') return res.status(403).json({ success: false, message: 'Account banned. Contact support.' });
    if (user.status === 'suspended') return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });

    const token = generateToken(user);
    res.json({ success: true, token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Google verify error:', err.message);
    res.status(401).json({ success: false, message: 'Google verification failed' });
  }
});

// ─── GOOGLE AUTH (legacy redirect flow) ───
router.get('/google', (req, res, next) => {
  const passport = require('passport');
  if (!passport._strategies.google)
    return res.status(503).json({ success: false, message: 'Google OAuth not configured' });
  req.session.redirectTo = req.query.redirect || '/';
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback',
  (req, res, next) => {
    const passport = require('passport');
    if (!passport._strategies.google)
      return res.redirect('/?error=google_auth_not_configured');
    passport.authenticate('google', { failureRedirect: '/?error=google_auth_failed' })(req, res, next);
  },
  (req, res) => {
    const token = generateToken(req.user);
    const redirectTo = req.session.redirectTo || '/';
    res.redirect(`${redirectTo}?auth=success&token=${token}`);
  }
);

module.exports = router;
