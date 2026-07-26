const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();
const { generateToken } = require('../middleware/auth');

// Use MongoDB if available, else fallback to memory store
let User, UserSubscription, SubscriptionPlan;
try {
  User = require('../models/User');
  UserSubscription = require('../models/UserSubscription');
  SubscriptionPlan = require('../models/SubscriptionPlan');
} catch {
  User = null;
  UserSubscription = null;
  SubscriptionPlan = null;
}

const memoryStore = require('../memoryStore');

function getUserModel() {
  // If mongoose is connected, use real User model
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState === 1 && User) {
    return User;
  }
  // Fallback to memory store
  return memoryStore;
}

// Email transporter (logs to console if no SMTP configured)
let emailEnabled = false;
let transporter = null;
try {
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
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
    id: user._id || user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar || '',
    role: user.role || 'user',
    subscription: user.subscription || { planSlug: 'free' }
  };
}

// ─── REGISTER ───
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const UserModel = getUserModel();
    const existing = await UserModel.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const now = new Date();
    const user = await UserModel.create({
      name, email: email.toLowerCase(), password: hashed,
      authProvider: 'local', isVerified: true,
      role: 'user', subscription: { planSlug: 'free', status: 'active', startedAt: now, autoRenew: false }
    });

    // Mirror the free-tier grant into the subscriptions ledger, same as the Pro purchase flow does
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1 && UserSubscription) {
      const freePlan = await SubscriptionPlan.findOne({ slug: 'free' }).lean();
      await UserSubscription.create({
        userId: user._id,
        planId: freePlan?._id,
        planSlug: 'free',
        amount: 0,
        startedAt: now,
        expiresAt: new Date('2099-12-31'),
        billingCycle: 'monthly',
        'payment.status': 'completed',
        'payment.method': 'wallet',
        'payment.paidAt': now,
        status: 'active'
      });
    }

    const token = generateToken(user);
    await User.findByIdAndUpdate(user._id, { activeToken: token });
    res.json({
      success: true,
      message: 'Account created successfully',
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── LOGIN ───
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const UserModel = getUserModel();
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user || user.authProvider !== 'local') {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ success: false, message: 'Your account has been banned. Contact support.' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Your account is suspended. Contact support.' });
    }

    const token = generateToken(user);
    // Save active token — invalidates any previous device session
    await User.findByIdAndUpdate(user._id, { activeToken: token });
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── FORGOT PASSWORD (Send OTP) ───
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    const UserModel = getUserModel();
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user || user.authProvider !== 'local') {
      return res.status(404).json({ success: false, message: 'No account found with this email' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
    // For memory store, just update in place
    if (UserModel.users) {
      const idx = UserModel.users.findIndex(u => u.email === user.email);
      if (idx > -1) UserModel.users[idx] = user;
    } else {
      await user.save();
    }

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
    const UserModel = getUserModel();
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user || !user.otp || user.otp.code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = resetToken;
    user.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
    if (UserModel.users) {
      const idx = UserModel.users.findIndex(u => u.email === user.email);
      if (idx > -1) UserModel.users[idx] = user;
    } else {
      await user.save();
    }

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
    if (!resetToken || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Valid reset token and password (6+ chars) required' });
    }

    const UserModel = getUserModel();
    let user;
    if (UserModel.users) {
      user = UserModel.users.find(u => u.resetToken === resetToken && u.resetTokenExpires > new Date());
    } else {
      user = await UserModel.findOne({ resetToken, resetTokenExpires: { $gt: new Date() } });
    }

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.otp = undefined;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    if (UserModel.users) {
      const idx = UserModel.users.findIndex(u => u.email === user.email);
      if (idx > -1) UserModel.users[idx] = user;
    } else {
      await user.save();
    }

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
    const UserModel = getUserModel();
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user || user.authProvider !== 'local') {
      return res.status(404).json({ success: false, message: 'No account found' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
    if (UserModel.users) {
      const idx = UserModel.users.findIndex(u => u.email === user.email);
      if (idx > -1) UserModel.users[idx] = user;
    } else {
      await user.save();
    }

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
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cricketedge_jwt_secret_change_in_production');

    const UserModel = getUserModel();
    const user = await UserModel.findById(decoded.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.status === 'banned') {
      return res.status(403).json({ success: false, message: 'Account banned', code: 'ACCOUNT_BANNED' });
    }

    res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// ─── GOOGLE ID TOKEN VERIFY (popup flow) ───
router.post('/google/verify', async (req, res) => {
  try {
    const { credential, userInfo } = req.body;
    if (!credential && !userInfo) return res.status(400).json({ success: false, message: 'credential required' });

    let googleId, email, name, avatar;

    if (userInfo && userInfo.sub) {
      // Implicit flow: userInfo fetched from Google userinfo endpoint
      ({ sub: googleId, email, name, picture: avatar } = userInfo);
    } else {
      // ID token flow: verify with google-auth-library
      const { OAuth2Client } = require('google-auth-library');
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      ({ sub: googleId, email, name, picture: avatar } = payload);
    }

    const UserModel = getUserModel();
    let user = await UserModel.findOne({ googleId });
    if (!user) {
      user = await UserModel.findOne({ email: email.toLowerCase() });
      if (user) {
        if (UserModel.users) {
          const idx = UserModel.users.findIndex(u => u.email === email.toLowerCase());
          if (idx > -1) { UserModel.users[idx].googleId = googleId; user = UserModel.users[idx]; }
        } else {
          user = await UserModel.findByIdAndUpdate(user._id, {
            googleId,
            authProvider: 'google',
            avatar: user.avatar || avatar,
            name: name || user.name
          }, { new: true });
        }
      } else {
        const now = new Date();
        user = await UserModel.create({
          name, email: email.toLowerCase(), googleId,
          authProvider: 'google', isVerified: true, avatar: avatar || '',
          role: 'user',
          subscription: { planSlug: 'free', status: 'active', startedAt: now, autoRenew: false }
        });
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1 && UserSubscription) {
          const freePlan = await SubscriptionPlan.findOne({ slug: 'free' }).lean();
          await UserSubscription.create({
            userId: user._id, planId: freePlan?._id, planSlug: 'free',
            amount: 0, startedAt: now, expiresAt: new Date('2099-12-31'),
            billingCycle: 'monthly', 'payment.status': 'completed',
            'payment.method': 'wallet', 'payment.paidAt': now, status: 'active'
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
  if (!passport._strategies.google) {
    return res.status(503).json({ success: false, message: 'Google OAuth not configured' });
  }
  const redirectTo = req.query.redirect || '/';
  req.session.redirectTo = redirectTo;
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback',
  (req, res, next) => {
    const passport = require('passport');
    if (!passport._strategies.google) {
      return res.redirect('/?error=google_auth_not_configured');
    }
    passport.authenticate('google', { failureRedirect: '/?error=google_auth_failed' })(req, res, next);
  },
  (req, res) => {
    const token = generateToken(req.user);
    const redirectTo = req.session.redirectTo || '/';
    res.redirect(`${redirectTo}?auth=success&token=${token}`);
  }
);

module.exports = router;
