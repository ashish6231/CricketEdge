const mongoose = require('mongoose');
const { autoIncrement } = require('../utils/autoIncrement');

const adminAuditLogSchema = new mongoose.Schema({
  _id: { type: Number },
  adminId: { type: Number, ref: 'User', required: true, index: true },
  adminEmail: { type: String, required: true },

  action: {
    type: String,
    enum: [
      'user_ban', 'user_suspend', 'user_unsuspend', 'user_verify',
      'settings_update', 'settings_maintenance',
      'plan_create', 'plan_update', 'plan_delete',
      'coupon_create', 'coupon_update', 'coupon_delete',
      'notification_send', 'broadcast_send'
    ],
    required: true
  },

  targetType: { type: String, enum: ['user', 'match', 'settings', 'plan', 'coupon', 'notification'], required: true },
  targetId: { type: Number, required: true },
  targetIdentifier: { type: String, default: '' },

  changes: {
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null }
  },

  reason: { type: String, default: '' },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' }
}, { timestamps: true });

adminAuditLogSchema.index({ action: 1 });
adminAuditLogSchema.index({ targetType: 1, targetId: 1 });
adminAuditLogSchema.index({ createdAt: -1 });

autoIncrement(adminAuditLogSchema, 'AdminAuditLog');

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
