import { LoaderCircle } from 'lucide-react'

export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

export const fmtAmount = (amount, currency = 'INR') => {
  if (!amount || amount <= 0) return 'Free / Admin'
  return currency === 'INR' ? `₹${amount}` : `${currency} ${amount}`
}

export const PAYMENT_CFG = {
  completed: { label: 'Paid',     color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  pending:   { label: 'Pending',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  failed:    { label: 'Failed',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

export const SUB_STATUS_CFG = {
  active:    { label: 'Active',    color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  expired:   { label: 'Expired',   color: '#8e8e93', bg: 'rgba(142,142,147,0.12)' },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  pending:   { label: 'Pending',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
}

const Chip = ({ cfg }) => (
  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ color: cfg.color, background: cfg.bg }}>
    {cfg.label}
  </span>
)

export function SubscriptionLogEntry({ log, showUser = false, compact = false }) {
  const payCfg = PAYMENT_CFG[log.paymentStatus] || PAYMENT_CFG.pending
  const subCfg = SUB_STATUS_CFG[log.status] || SUB_STATUS_CFG.pending

  return (
    <div className="px-4 py-3" style={{ borderColor: '#1a1a1a' }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-text-primary capitalize">{log.planSlug} · {log.billingCycle}</span>
            <Chip cfg={payCfg} />
            <Chip cfg={subCfg} />
            {log.paymentMethod === 'wallet' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: '#3b82f6', background: 'rgba(59,130,246,0.12)' }}>
                Admin
              </span>
            )}
          </div>

          {showUser && log.user && (
            <div className="text-xs text-[#888] mt-0.5 truncate">
              {log.user.name} · {log.user.email}
            </div>
          )}

          <div className={`${compact ? 'text-[11px]' : 'text-xs'} text-[#555] mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5`}>
            <span>Amount: <span className="text-text-secondary font-semibold">{fmtAmount(log.amount, log.currency)}</span></span>
            {log.couponCode && <span>Coupon: {log.couponCode}</span>}
            <span>Period: {fmtDate(log.startedAt)} → {fmtDate(log.expiresAt)}</span>
          </div>

          {!compact && (
            <div className="text-[11px] text-[#444] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {log.paidAt && <span>Paid: {fmtDateTime(log.paidAt)}</span>}
              <span>Created: {fmtDateTime(log.createdAt)}</span>
              {log.gatewayPaymentId && <span className="truncate max-w-[180px]">Txn: {log.gatewayPaymentId}</span>}
              {log.cancelReason && <span>Cancel: {log.cancelReason}</span>}
            </div>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-sm font-black" style={{ color: log.paymentStatus === 'completed' ? '#10b981' : '#888' }}>
            {fmtAmount(log.amount, log.currency)}
          </div>
          <div className="text-[10px] text-[#555] mt-0.5">{fmtDateTime(log.paidAt || log.createdAt)}</div>
        </div>
      </div>
    </div>
  )
}

export function SubscriptionLogTimeline({ logs, loading, showUser = false, emptyText = 'No subscription records' }) {
  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <LoaderCircle className="animate-spin text-[#a855f7]" size={20} />
      </div>
    )
  }
  if (!logs?.length) {
    return <div className="text-center text-[#555] py-6 text-xs">{emptyText}</div>
  }
  return (
    <div className="divide-y" style={{ borderColor: '#1a1a1a' }}>
      {logs.map(log => (
        <SubscriptionLogEntry key={log.id} log={log} showUser={showUser} compact={!showUser} />
      ))}
    </div>
  )
}
