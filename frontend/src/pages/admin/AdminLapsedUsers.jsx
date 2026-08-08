import { useEffect, useState, useCallback } from 'react'
import { LoaderCircle, Search, ChevronLeft, ChevronRight, UserMinus, Ban, CheckCircle, PauseCircle, MoreVertical, Crown, History, ChevronDown, ChevronUp } from 'lucide-react'
import { adminGetLapsedUsers, adminGetUserSubscriptions, adminUpdateUserStatus, adminUpdateUserPlan } from '../../api'
import { SubscriptionLogTimeline } from './SubscriptionLogList'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const getExpiredLabel = (dateStr) => {
  if (!dateStr) return 'Unknown'
  const diff = new Date() - new Date(dateStr)
  if (diff <= 0) return 'Recently expired'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Expired today'
  if (days === 1) return 'Expired 1 day ago'
  if (days < 30) return `Expired ${days} days ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `Expired ${months}mo ago`
  const years = Math.floor(months / 12)
  return `Expired ${years}y ago`
}

const fmtAmount = (amount) => amount > 0 ? `₹${amount}` : 'Admin grant'

const STATUS_CFG = {
  active:    { label: 'Active',    color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  banned:    { label: 'Banned',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  suspended: { label: 'Suspended', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
}

const Chip = ({ cfg }) => (
  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ color: cfg.color, background: cfg.bg }}>
    {cfg.icon && cfg.icon}{cfg.label}
  </span>
)

const ActionMenuItem = ({ onClick, disabled, color, icon, label, loading }) => (
  <button onClick={onClick} disabled={disabled || loading}
    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all hover:bg-white/5 disabled:opacity-40"
    style={{ color }}>
    <div className="flex items-center gap-2.5">
      {icon} <span>{label}</span>
    </div>
    {loading && <LoaderCircle size={14} className="animate-spin text-primary" />}
  </button>
)

export default function AdminLapsedUsers({ isSuperAdmin }) {
  const [users, setUsers]         = useState([])
  const [pagination, setPagination] = useState({})
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [status, setStatus]       = useState('')
  const [page, setPage]           = useState(1)
  const [acting, setActing]       = useState(null)
  const [expanded, setExpanded]   = useState(null)
  const [historyOpen, setHistoryOpen] = useState(null)
  const [historyLogs, setHistoryLogs] = useState({})
  const [historyLoading, setHistoryLoading] = useState(null)
  const [error, setError]         = useState('')
  const [proMonths, setProMonths] = useState({})

  const load = useCallback(() => {
    setLoading(true)
    adminGetLapsedUsers({ page, limit: 20, search, status })
      .then(res => { setUsers(res.data); setPagination(res.pagination) })
      .catch(e => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [page, search, status])

  useEffect(() => { load() }, [load])

  const act = async (userId, fn, ...args) => {
    setActing(userId)
    try { await fn(...args); load(); setExpanded(null) }
    catch (e) { setError(e.detail || 'Action failed') }
    finally { setActing(null) }
  }

  const toggleHistory = async (userId) => {
    if (historyOpen === userId) {
      setHistoryOpen(null)
      return
    }
    setHistoryOpen(userId)
    if (historyLogs[userId]) return
    setHistoryLoading(userId)
    try {
      const res = await adminGetUserSubscriptions(userId)
      setHistoryLogs(prev => ({ ...prev, [userId]: res.data.subscriptions || [] }))
    } catch (e) {
      setError(e.detail || 'Failed to load subscription logs')
      setHistoryOpen(null)
    } finally {
      setHistoryLoading(null)
    }
  }

  const filterSelect = "px-3 py-2 rounded-xl text-xs font-semibold outline-none text-text-secondary"
  const filterStyle  = { background: '#1a1a1a', border: '1px solid #2c2c2e', color: '#ebebf5' }

  return (
    <div className="space-y-4">

      <div className="rounded-xl px-3 py-2 text-xs text-[#888]" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
        Users who purchased or were granted Pro at least once, but no longer have an active subscription.
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-48 rounded-xl px-3 py-2" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
          <Search size={13} className="text-text-muted flex-shrink-0" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search former pro users…"
            className="bg-transparent text-sm outline-none w-full text-text-primary placeholder:text-[#555]" />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className={filterSelect} style={filterStyle}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {error && <div className="text-xs text-red-400 px-3 py-2 rounded-xl" style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)' }}>{error}</div>}

      {!loading && pagination.total > 0 && (
        <div className="flex items-center gap-3 text-xs text-text-muted px-1">
          <span className="font-bold text-[#a855f7] text-sm">{pagination.total}</span> former pro users
          <span className="text-[#2c2c2e]">·</span>
          page <span className="font-semibold text-text-primary">{pagination.page}</span> of <span className="font-semibold text-text-primary">{pagination.pages}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><LoaderCircle className="animate-spin text-[#a855f7]" /></div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#555] gap-2">
          <UserMinus size={32} className="opacity-20" />
          <p className="text-sm">No former pro users found.</p>
        </div>
      ) : (
        <div className="space-y-2 relative">
          {users.map(u => {
            const statusCfg = STATUS_CFG[u.status || 'active']
            const isOpen    = expanded === u.id
            const isActing  = acting === u.id
            const lastSub   = u.lastProSub
            const expiredAt = u.subExpiresAt || lastSub?.expiresAt
            const expiredLabel = getExpiredLabel(expiredAt)

            return (
              <div key={u.id} className={`relative rounded-2xl ${isOpen ? 'z-50' : 'z-0'}`} style={{ background: '#111', border: '1px solid #1e1e1e' }}>

                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #a855f755, #a855f722)', border: '1.5px solid #a855f744' }}>
                    {u.name?.[0]?.toUpperCase() || '?'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-text-primary text-sm truncate">{u.name}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{ color: '#a855f7', background: 'rgba(168,85,247,0.12)' }}>
                        {expiredLabel}
                      </span>
                    </div>
                    <div className="text-xs text-[#555] truncate mt-0.5">{u.email}</div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Chip cfg={statusCfg} />
                    <button onClick={() => setExpanded(isOpen ? null : u.id)}
                      className="p-1.5 rounded-xl transition-all hover:bg-white/10 active:scale-95"
                      style={{ background: isOpen ? 'rgba(255,255,255,0.1)' : 'transparent' }}>
                      <MoreVertical size={16} className="text-text-muted" />
                    </button>
                  </div>
                </div>

                <div className="px-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#555]">
                  <span>Ended {fmtDate(expiredAt)}</span>
                  {lastSub && (
                    <>
                      <span>· Last paid {fmtAmount(lastSub.amount)} ({lastSub.billingCycle})</span>
                      {lastSub.paymentMethod === 'wallet' && <span>· Admin grant</span>}
                    </>
                  )}
                  {u.proPurchaseCount > 1 && (
                    <span className="flex items-center gap-1">
                      <History size={10} /> {u.proPurchaseCount} purchases
                    </span>
                  )}
                  <button onClick={() => toggleHistory(u.id)}
                    className="flex items-center gap-1 font-semibold transition-colors hover:text-[#a855f7]"
                    style={{ color: historyOpen === u.id ? '#a855f7' : '#666' }}>
                    {historyOpen === u.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    Subscription logs
                  </button>
                </div>

                {historyOpen === u.id && (
                  <div className="mx-4 mb-3 rounded-xl overflow-hidden" style={{ background: '#0a0a0a', border: '1px solid #1e1e1e' }}>
                    <div className="px-3 py-2 text-[10px] font-bold tracking-wider uppercase text-[#555]" style={{ borderBottom: '1px solid #1a1a1a' }}>
                      All subscription records
                    </div>
                    <SubscriptionLogTimeline
                      logs={historyLogs[u.id]}
                      loading={historyLoading === u.id}
                      emptyText="No subscription records for this user"
                    />
                  </div>
                )}

                {isOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExpanded(null)}></div>
                    <div className="absolute right-4 top-14 z-50 w-52 rounded-2xl border border-[#2c2c2e] p-1 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200"
                      style={{ background: 'rgba(20,20,20,0.85)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>

                      <div className="px-3 py-2 text-[10px] font-bold tracking-wider uppercase text-[#555] border-b border-[#2c2c2e] mb-1">
                        Manage User
                      </div>

                      {(u.role === 'user' || (isSuperAdmin && u.role === 'admin')) && (<>
                        {u.status !== 'active' && (
                          <ActionMenuItem disabled={isActing} loading={isActing} color="#10b981" icon={<CheckCircle size={14} />} label="Activate"
                            onClick={() => act(u.id, adminUpdateUserStatus, u.id, 'active', 'Admin action')} />
                        )}
                        {u.status !== 'suspended' && (
                          <ActionMenuItem disabled={isActing} loading={isActing} color="#f59e0b" icon={<PauseCircle size={14} />} label="Suspend"
                            onClick={() => act(u.id, adminUpdateUserStatus, u.id, 'suspended', 'Admin action')} />
                        )}
                        {u.status !== 'banned' && (
                          <ActionMenuItem disabled={isActing} loading={isActing} color="#ef4444" icon={<Ban size={14} />} label="Ban User"
                            onClick={() => act(u.id, adminUpdateUserStatus, u.id, 'banned', 'Admin action')} />
                        )}
                      </>)}

                      {u.role === 'user' && (
                        <>
                          <div className="h-px bg-[#2c2c2e] my-1"></div>
                          <div className="px-2 py-1">
                            <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
                              <span className="text-[11px] text-[#888] font-semibold">Grant Duration</span>
                              <select value={proMonths[u.id] || 1}
                                onChange={e => setProMonths(p => ({ ...p, [u.id]: +e.target.value }))}
                                className="bg-[#1a1a1a] border border-[#333] rounded-lg px-1.5 py-0.5 text-[11px] outline-none text-[#ebebf5]">
                                {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m}mo</option>)}
                              </select>
                            </div>
                            <ActionMenuItem disabled={isActing} loading={isActing} color="#f59e0b" icon={<Crown size={14} />} label="Re-activate Pro"
                              onClick={() => act(u.id, adminUpdateUserPlan, u.id, 'pro', 'Admin re-activation', proMonths[u.id] || 1)} />
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}

              </div>
            )
          })}
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-text-muted">{pagination.total} former pro users</span>
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
