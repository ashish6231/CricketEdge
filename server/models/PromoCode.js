const mongoose = require('mongoose');
const { autoIncrement } = require('../utils/autoIncrement');

const promoCodeSchema = new mongoose.Schema({
  _id: { type: Number },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, default: '' },

  discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
  discountValue: { type: Number, required: true },
  maxDiscount: { type: Number, default: 0 },

  applicablePlans: [{ type: String }], // empty = all plans

  usageLimit: { type: Number, default: 0 }, // 0 = unlimited
  usageCount: { type: Number, default: 0 },
  perUserLimit: { type: Number, default: 1 },

  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true },

  isActive: { type: Boolean, default: true },
  createdBy: { type: Number, ref: 'User' }
}, { timestamps: true });

promoCodeSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });

autoIncrement(promoCodeSchema, 'PromoCode');

module.exports = mongoose.model('PromoCode', promoCodeSchema);
