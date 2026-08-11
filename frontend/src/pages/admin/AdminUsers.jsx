import { useEffect, useState, useCallback } from 'react'
import { LoaderCircle, Search, ChevronLeft, ChevronRight, Shield, User, Crown, Ban, CheckCircle, PauseCircle, MoreVertical, X, Gift } from 'lucide-react'
import { adminGetUsers, adminUpdateUserStatus, adminUpdateUserPlan, adminGrantTrial, adminGrantTrialAll } from '../../api'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const ROLE_CFG = {
  user: { label: 'User', icon: <User size={11} />, color: '#8e8e93', bg: 'rgba(142,142,147,0.12)' },
  admin: { label: 'Admin', icon: <Shield size={11} />, color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  superadmin: { label: 'Superadmin', icon: <Crown size={11} />, color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
}
const STATUS_CFG = {
  active: { label: 'Active', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  banned: { label: 'Banned', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  suspended: { label: 'Suspended', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
}
const PLAN_CFG = {
  pro: { label: '⭐ Pro', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  trial: { label: 'Trial', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  free: { label: 'Free', color: '#8e8e93', bg: 'rgba(142,142,147,0.10)' },
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

export default function AdminUsers({ isSuperAdmin }) {
  const [users, setUsers] = useState([])
  const [pagination, setPagination] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [acting, setActing] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [error, setError] = useState('')
  const [proMonths, setProMonths] = useState({})
  const [bulkGranting, setBulkGranting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    adminGetUsers({ page, limit: 20, search, role, status })
      .then(res => { setUsers(res.data); setPagination(res.pagination) })
      .catch(e => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [page, search, role, status])

  useEffect(() => { load() }, [load])

  const act = async (userId, fn, ...args) => {
    setActing(userId)
    try { await fn(...args); load(); setExpanded(null) }
    catch (e) { setError(e.detail || 'Action failed') }
    finally { setActing(null) }
  }

  const grantTrial = async (userId, force = true) => {
    if (force && !window.confirm('Grant 30-minute trial to this user?')) return
    await act(userId, adminGrantTrial, userId, force)
  }

  const grantTrialAll = async () => {
    if (!window.confirm('Grant 30-minute trial to all eligible free users who never had trial?')) return
    setBulkGranting(true)
    setError('')
    try {
      const res = await adminGrantTrialAll()
      setError('')
      alert(res.message || 'Bulk trial grant complete')
      load()
    } catch (e) {
      setError(e.detail || 'Bulk grant failed')
    } finally {
      setBulkGranting(false)
    }
  }

  const filterSelect = "px-3 py-2 rounded-xl text-xs font-semibold outline-none text-text-secondary"
  const filterStyle = { background: '#1a1a1a', border: '1px solid #2c2c2e', color: '#ebebf5' }

  return (
    <div className="space-y-4">

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-48 rounded-xl px-3 py-2" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
          <Search size={13} className="text-text-muted flex-shrink-0" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search name or email…"
            className="bg-transparent text-sm outline-none w-full text-text-primary placeholder:text-[#555]" />
        </div>
        <select value={role} onChange={e => { setRole(e.target.value); setPage(1) }} className={filterSelect} style={filterStyle}>
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="superadmin">Superadmin</option>
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className={filterSelect} style={filterStyle}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
          <option value="suspended">Suspended</option>
        </select>
        <button onClick={grantTrialAll} disabled={bulkGranting}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
          {bulkGranting ? <LoaderCircle size={13} className="animate-spin" /> : <Gift size={13} />}
          Grant Trial to All
        </button>
      </div>

      {error && <div className="text-xs text-red-400 px-3 py-2 rounded-xl" style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)' }}>{error}</div>}

      {/* ── Stats row ── */}
      {!loading && pagination.total > 0 && (
        <div className="flex items-center gap-3 text-xs text-text-muted px-1">
          <span className="font-bold text-text-primary text-sm">{pagination.total}</span> total users
          <span className="text-[#2c2c2e]">·</span>
          page <span className="font-semibold text-text-primary">{pagination.page}</span> of <span className="font-semibold text-text-primary">{pagination.pages}</span>
        </div>
      )}

      {/* ── User Cards ── */}
      {loading ? (
        <div className="flex justify-center py-16"><LoaderCircle className="animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2 relative">
          {users.map(u => {
            const roleCfg = ROLE_CFG[u.role] || ROLE_CFG.user
            const statusCfg = STATUS_CFG[u.status || 'active']
            const planCfg = PLAN_CFG[u.subPlanSlug] || PLAN_CFG.free
            const isOpen = expanded === u.id
            const isActing = acting === u.id

            return (
              <div key={u.id} className={`relative rounded-2xl ${isOpen ? 'z-50' : 'z-0'}`} style={{ background: '#111', border: '1px solid #1e1e1e' }}>

                {/* ── Card header ── */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${roleCfg.color}55, ${roleCfg.color}22)`, border: `1.5px solid ${roleCfg.color}44` }}>
                    {u.name?.[0]?.toUpperCase() || '?'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-text-primary text-sm truncate">{u.name}</span>
                      <Chip cfg={roleCfg} />
                    </div>
                    <div className="text-xs text-[#555] truncate mt-0.5">{u.email}</div>
                  </div>

                  {/* Right badges + toggle */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Chip cfg={planCfg} />
                    <Chip cfg={statusCfg} />
                    <button onClick={() => setExpanded(isOpen ? null : u.id)}
                      className="p-1.5 rounded-xl transition-all hover:bg-white/10 active:scale-95"
                      style={{ background: isOpen ? 'rgba(255,255,255,0.1)' : 'transparent' }}>
                      <MoreVertical size={16} className="text-text-muted" />
                    </button>
                  </div>
                </div>

                {/* ── Joined date strip ── */}
                <div className="px-4 pb-3 flex items-center gap-4 text-[11px] text-[#555]">
                  <span>Joined {fmtDate(u.createdAt)}</span>
                  {u.subExpiresAt && <span>· {u.subPlanSlug === 'trial' ? 'Trial until' : 'Pro until'} {fmtDate(u.subExpiresAt)}</span>}
                </div>

                {/* ── Floating Popover Menu ── */}
                {isOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExpanded(null)}></div>
                    <div className="absolute right-4 top-14 z-50 w-52 rounded-2xl border border-[#2c2c2e] p-1 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200"
                      style={{ background: 'rgba(20,20,20,0.85)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>

                      <div className="px-3 py-2 text-[10px] font-bold tracking-wider uppercase text-[#555] border-b border-[#2c2c2e] mb-1">
                        Manage User
                      </div>

                      {/* Status actions */}
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

                      {/* Plan actions */}
                      {u.role === 'user' && (<>
                        <div className="h-px bg-[#2c2c2e] my-1"></div>
                        {u.subPlanSlug === 'free' && (
                          <ActionMenuItem disabled={isActing} loading={isActing} color="#10b981" icon={<Gift size={14} />} label="Grant 30-Min Trial"
                            onClick={() => grantTrial(u.id, true)} />
                        )}
                        {u.subPlanSlug !== 'pro' ? (
                          <div className="px-2 py-1">
                            <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
                              <span className="text-[11px] text-[#888] font-semibold">Grant Duration</span>
                              <select value={proMonths[u.id] || 1}
                                onChange={e => setProMonths(p => ({ ...p, [u.id]: +e.target.value }))}
                                className="bg-[#1a1a1a] border border-[#333] rounded-lg px-1.5 py-0.5 text-[11px] outline-none text-[#ebebf5]">
                                {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m}mo</option>)}
                              </select>
                            </div>
                            <ActionMenuItem disabled={isActing} loading={isActing} color="#f59e0b" icon={<Crown size={14} />} label="Grant Pro"
                              onClick={() => act(u.id, adminUpdateUserPlan, u.id, 'pro', 'Admin grant', proMonths[u.id] || 1)} />
                          </div>
                        ) : (
                          <ActionMenuItem disabled={isActing} loading={isActing} color="#8e8e93" icon={<X size={14} />} label="Revoke Pro"
                            onClick={() => act(u.id, adminUpdateUserPlan, u.id, 'free', 'Admin revoke')} />
                        )}
                      </>)}

                    </div>
                  </>
                )}

              </div>
            )
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-text-muted">{pagination.total} users</span>
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
