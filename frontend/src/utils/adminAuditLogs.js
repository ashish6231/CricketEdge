export const AUDIT_ACTION_COLORS = {
  user_ban: 'bg-red-100 text-red-600',
  user_suspend: 'bg-yellow-100 text-yellow-700',
  user_unsuspend: 'bg-green-100 text-green-700',
  user_verify: 'bg-blue-100 text-blue-700',
  plan_create: 'bg-purple-100 text-purple-700',
  plan_update: 'bg-purple-100 text-purple-700',
  coupon_create: 'bg-green-100 text-green-700',
  settings_update: 'bg-gray-100 text-gray-600',
  toss_actual_confirmed: 'bg-green-100 text-green-700',
  toss_actual_corrected: 'bg-yellow-100 text-yellow-700',
  toss_dataset_confirm_winner: 'bg-emerald-100 text-emerald-700',
}

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_COLORS)

export function getAuditActionColor(action) {
  return AUDIT_ACTION_COLORS[action] || 'bg-gray-100 text-gray-600'
}

export function getAuditChanges(log) {
  if (log.changesBefore == null && log.changesAfter == null) return null
  return {
    before: log.changesBefore,
    after: log.changesAfter,
  }
}
