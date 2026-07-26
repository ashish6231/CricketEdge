const mongoose = require('mongoose');
const { autoIncrement } = require('../utils/autoIncrement');

const userSchema = new mongoose.Schema({
  _id: { type: Number },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String },
  name: { type: String, required: true },
  avatar: { type: String, default: '' },
  phone: { type: String, default: '' },
  googleId: { type: String, unique: true, sparse: true },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  isVerified: { type: Boolean, default: false },

  // Role & Access Control
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
  status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },

  // Subscription
  subscription: {
    planId: { type: Number, ref: 'SubscriptionPlan' },
    planSlug: { type: String, enum: ['free', 'pro'], default: 'free' },
    status: { type: String, enum: ['active', 'cancelled', 'expired'], default: 'active' },
    startedAt: { type: Date },
    expiresAt: { type: Date },
    autoRenew: { type: Boolean, default: true }
  },

  // Queued subscription (when user buys again while already on Pro)
  queuedSubscription: {
    planId: { type: Number, ref: 'SubscriptionPlan' },
    planSlug: { type: String, enum: ['free', 'pro'] },
    billingCycle: { type: String, enum: ['monthly', 'yearly'] },
    amount: { type: Number },
    status: { type: String, enum: ['pending', 'activated'] },
    purchasedAt: { type: Date }
  },

  // Single device session
  activeToken: { type: String, default: null },

  // Security
  otp: {
    code: { type: String },
    expiresAt: { type: Date },
    purpose: { type: String, enum: ['reset_password', 'verify_email'], default: 'reset_password' }
  },
  resetToken: { type: String },
  resetTokenExpires: { type: Date },
  lastLoginAt: { type: Date },
  lastLoginIp: { type: String, default: '' },

  // Preferences
  preferences: {
    oddsFormat: { type: String, enum: ['decimal', 'fractional'], default: 'decimal' },
    language: { type: String, default: 'en' },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    }
  }
}, { timestamps: true });

userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'subscription.planSlug': 1 });
userSchema.index({ 'subscription.expiresAt': 1 });
userSchema.index({ status: 1 });

autoIncrement(userSchema, 'User');

module.exports = mongoose.model('User', userSchema);
