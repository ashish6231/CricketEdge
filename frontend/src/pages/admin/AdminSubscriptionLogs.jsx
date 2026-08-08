import { useEffect, useState, useCallback } from 'react'
import { LoaderCircle, Search, ChevronLeft, ChevronRight, Receipt } from 'lucide-react'
import { adminGetSubscriptionLogs } from '../../api'
import { SubscriptionLogEntry } from './SubscriptionLogList'

export default function AdminSubscriptionLogs() {
  const [logs, setLogs]           = useState([])
  const [pagination, setPagination] = useState({})
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [planSlug, setPlanSlug]   = useState('')
  const [subStatus, setSubStatus] = useState('')
  const [page, setPage]           = useState(1)
  const [error, setError]         = useState('')

  const load = useCallback(() => {
    setLoading(true)
    adminGetSubscriptionLogs({ page, limit: 50, search, paymentStatus, planSlug, status: subStatus })
      .then(res => { setLogs(res.data); setPagination(res.pagination) })
      .catch(e => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [page, search, paymentStatus, planSlug, subStatus])

  useEffect(() => { load() }, [load])

  const filterSelect = "px-3 py-2 rounded-xl text-xs font-semibold outline-none text-text-secondary"
  const filterStyle  = { background: '#1a1a1a', border: '1px solid #2c2c2e', color: '#ebebf5' }

  return (
    <div className="space-y-4">

      <div className="rounded-xl px-3 py-2 text-xs text-[#888]" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
        Complete subscription history — every Pro purchase, renewal, admin grant, failed attempt, and cancellation.
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-48 rounded-xl px-3 py-2" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
          <Search size={13} className="text-text-muted flex-shrink-0" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search user name or email…"
            className="bg-transparent text-sm outline-none w-full text-text-primary placeholder:text-[#555]" />
        </div>
        <select value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value); setPage(1) }} className={filterSelect} style={filterStyle}>
          <option value="">All Payments</option>
          <option value="completed">Paid</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <select value={planSlug} onChange={e => { setPlanSlug(e.target.value); setPage(1) }} className={filterSelect} style={filterStyle}>
          <option value="">All Plans</option>
          <option value="pro">Pro</option>
          <option value="free">Free</option>
        </select>
        <select value={subStatus} onChange={e => { setSubStatus(e.target.value); setPage(1) }} className={filterSelect} style={filterStyle}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {error && <div className="text-xs text-red-400 px-3 py-2 rounded-xl" style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)' }}>{error}</div>}

      {!loading && (
        <div className="flex items-center gap-3 text-xs text-text-muted px-1">
          <span className="font-bold text-[#10b981] text-sm">{pagination.total ?? 0}</span> records
          {pagination.pages > 1 && (
            <>
              <span className="text-[#2c2c2e]">·</span>
              page <span className="font-semibold text-text-primary">{pagination.page}</span> of <span className="font-semibold text-text-primary">{pagination.pages}</span>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><LoaderCircle className="animate-spin text-[#10b981]" /></div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#555] gap-2">
          <Receipt size={32} className="opacity-20" />
          <p className="text-sm">No subscription logs found.</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #1e1e1e' }}>
          <div className="divide-y" style={{ borderColor: '#1a1a1a' }}>
            {logs.map(log => (
              <SubscriptionLogEntry key={log.id} log={log} showUser />
            ))}
          </div>
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-text-muted">{pagination.total} records</span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="p-2 rounded-xl disabled:opacity-30 transition-opacity"
              style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
              <ChevronLeft size={14} className="text-text-secondary" />
            </button>
            <span className="px-3 py-1.5 rounded-xl text-xs font-bold text-text-primary" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
              {page} / {pagination.pages}
            </span>
            <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}
              className="p-2 rounded-xl disabled:opacity-30 transition-opacity"
              style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
              <ChevronRight size={14} className="text-text-secondary" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
