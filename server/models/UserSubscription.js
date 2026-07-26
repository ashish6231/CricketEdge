const mongoose = require('mongoose');
const { autoIncrement } = require('../utils/autoIncrement');

const userSubscriptionSchema = new mongoose.Schema({
  _id: { type: Number },
  userId: { type: Number, ref: 'User', required: true, index: true },
  planId: { type: Number, ref: 'SubscriptionPlan', required: true },
  planSlug: { type: String, required: true },

  // Billing
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  discountAmount: { type: Number, default: 0 },
  couponCode: { type: String, default: '' },

  // Period
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },

  // Payment
  payment: {
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    method: { type: String, enum: ['razorpay', 'stripe', 'upi', 'wallet'], default: 'razorpay' },
    gatewayOrderId: { type: String, default: '' },
    gatewayPaymentId: { type: String, default: '' },
    paidAt: { type: Date }
  },

  // Status
  status: { type: String, enum: ['pending', 'active', 'cancelled', 'expired', 'upgraded'], default: 'active' },
  cancelledAt: { type: Date },
  cancelReason: { type: String, default: '' },

  // Metadata
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' }
}, { timestamps: true });

userSubscriptionSchema.index({ userId: 1, status: 1 });
userSubscriptionSchema.index({ expiresAt: 1 });
userSubscriptionSchema.index({ 'payment.gatewayOrderId': 1 });

autoIncrement(userSubscriptionSchema, 'UserSubscription');

module.exports = mongoose.model('UserSubscription', userSubscriptionSchema);
