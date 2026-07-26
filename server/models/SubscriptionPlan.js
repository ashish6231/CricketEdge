const mongoose = require('mongoose');
const { autoIncrement } = require('../utils/autoIncrement');

const subscriptionPlanSchema = new mongoose.Schema({
  _id: { type: Number },
  slug: { type: String, required: true, unique: true, enum: ['free', 'pro'] },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true },           // monthly in INR (rupees)
  yearlyPrice: { type: Number, required: true },     // discounted yearly
  currency: { type: String, default: 'INR' },

  features: [{ type: String }],

  limits: {
    maxMarketsTracked: { type: Number, default: 5 },
    apiCallsPerMin: { type: Number, default: 10 },
    advancedAnalytics: { type: Boolean, default: false },
    bookieBookAccess: { type: Boolean, default: false },
    predictionEngine: { type: Boolean, default: false },
    oddsAlerts: { type: Boolean, default: false },
    telegramNotifications: { type: Boolean, default: false }
  },

  isActive: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
  createdBy: { type: Number, ref: 'User' }
}, { timestamps: true });

subscriptionPlanSchema.index({ isActive: 1, displayOrder: 1 });

autoIncrement(subscriptionPlanSchema, 'SubscriptionPlan');

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
