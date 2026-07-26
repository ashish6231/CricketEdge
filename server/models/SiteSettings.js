const mongoose = require('mongoose');
const { autoIncrement } = require('../utils/autoIncrement');

const siteSettingSchema = new mongoose.Schema({
  _id: { type: Number },
  key: { type: String, required: true, unique: true, index: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  category: { type: String, enum: ['general', 'notifications', 'maintenance', 'security'], default: 'general' },
  description: { type: String, default: '' },
  isPublic: { type: Boolean, default: false },
  updatedBy: { type: Number, ref: 'User' }
}, { timestamps: true });

siteSettingSchema.index({ category: 1 });

autoIncrement(siteSettingSchema, 'SiteSettings');

module.exports = mongoose.model('SiteSettings', siteSettingSchema);
