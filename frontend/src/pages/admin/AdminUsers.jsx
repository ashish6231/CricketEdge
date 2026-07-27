import { useEffect, useState, useCallback } from 'react'
import { LoaderCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { adminGetUsers, adminUpdateUserStatus, adminUpdateUserRole, adminUpdateUserPlan } from '../../api'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const Badge = ({ value, map }) => {
  const cfg = map[value] || { bg: 'bg-gray-100', text: 'text-gray-500' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>{value}</span>
}

const STATUS_MAP = {
  active:    { bg: 'bg-green-100',  text: 'text-green-700' },
  banned:    { bg: 'bg-red-100',    text: 'text-red-600' },
  suspended: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
}
const ROLE_MAP = {
  user:       { bg: 'bg-gray-100',   text: 'text-gray-600' },
  admin:      { bg: 'bg-blue-100',   text: 'text-blue-700' },
  superadmin: { bg: 'bg-purple-100', text: 'text-purple-700' },
}
const PLAN_MAP = {
  pro:  { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  free: { bg: 'bg-gray-100',   text: 'text-gray-500' },
}

export default function AdminUsers({ isSuperAdmin }) {
  const [users, setUsers]       = useState([])
  const [pagination, setPagination] = useState({})
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [role, setRole]         = useState('')
  const [status, setStatus]     = useState('')
  const [page, setPage]         = useState(1)
  const [acting, setActing]     = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [error, setError]       = useState('')
  const [proMonths, setProMonths] = useState({})

  const load = useCallback(() => {
    setLoading(true)
    adminGetUsers({ page, limit: 20, search, role, status })
      .then(res => { setUsers(res.data); setPagination(res.pagination) })
      .catch(e => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [page, search, role, status])

  useEffect(() => { load() }, [load])

  const act = async (fn, ...args) => {
    setActing(true)
    try { await fn(...args); load() }
    catch (e) { setError(e.detail || 'Action failed') }
    finally { setActing(false) }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-48 glass-card rounded-xl px-3 py-2">
          <Search size={14} className="text-text-muted flex-shrink-0" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search name or email…"
            className="bg-transparent text-sm outline-none w-full text-text-primary placeholder:text-text-muted" />
        </div>
        <select value={role} onChange={e => { setRole(e.target.value); setPage(1) }}
          className="glass-card rounded-xl px-3 py-2 text-sm outline-none text-text-secondary bg-white">
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="superadmin">Superadmin</option>
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="glass-card rounded-xl px-3 py-2 text-sm outline-none text-text-secondary bg-white">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {error && <div className="text-xs text-primary px-3 py-2 rounded-xl" style={{ background: 'rgba(220,38,38,0.08)' }}>{error}</div>}

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted text-xs border-b border-border bg-red-50/40">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={6} className="text-center py-10"><LoaderCircle className="animate-spin text-primary inline" /></td></tr>
                : users.map(u => (
                  <>
                    <tr key={u.id} className="border-b border-border/40 last:border-0 hover:bg-red-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-text-primary">{u.name}</div>
                        <div className="text-xs text-text-muted">{u.email}</div>
                      </td>
                      <td className="px-4 py-3"><Badge value={u.role} map={ROLE_MAP} /></td>
                      <td className="px-4 py-3"><Badge value={u.subPlanSlug || 'free'} map={PLAN_MAP} /></td>
                      <td className="px-4 py-3"><Badge value={u.status || 'active'} map={STATUS_MAP} /></td>
                      <td className="px-4 py-3 text-text-muted text-xs">{fmtDate(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                          className="text-xs font-semibold text-primary hover:underline">
                          {expanded === u.id ? 'Close' : 'Manage'}
                        </button>
                      </td>
                    </tr>
                    {expanded === u.id && (
                      <tr key={`${u.id}-exp`} className="bg-red-50/20">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex flex-wrap gap-2 items-center">
                            {u.role === 'user' && (
                              <>
                                {u.status !== 'active' && (
                                  <button disabled={!!acting} onClick={() => act(adminUpdateUserStatus, u.id, 'active', 'Admin action')}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 disabled:opacity-50">
                                    ✓ Activate
                                  </button>
                                )}
                                {u.status !== 'banned' && (
                                  <button disabled={!!acting} onClick={() => act(adminUpdateUserStatus, u.id, 'banned', 'Admin action')}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-600 disabled:opacity-50">
                                    ✕ Ban
                                  </button>
                                )}
                                {u.status !== 'suspended' && (
                                  <button disabled={!!acting} onClick={() => act(adminUpdateUserStatus, u.id, 'suspended', 'Admin action')}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-yellow-100 text-yellow-700 disabled:opacity-50">
                                    ⏸ Suspend
                                  </button>
                                )}
                              </>
                            )}

                            {u.role === 'user' && (
                              <>
                                {u.subPlanSlug !== 'pro' && (
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={proMonths[u.id] || 1}
                                      onChange={e => setProMonths(p => ({ ...p, [u.id]: +e.target.value }))}
                                      className="rounded-lg border border-border px-2 py-1 text-xs bg-white outline-none">
                                      {[1,2,3,6,12].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                                    </select>
                                    <button disabled={!!acting} onClick={() => act(adminUpdateUserPlan, u.id, 'pro', 'Admin grant', proMonths[u.id] || 1)}
                                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-yellow-100 text-yellow-700 disabled:opacity-50">
                                      ⭐ Grant Pro
                                    </button>
                                  </div>
                                )}
                                {u.subPlanSlug === 'pro' && (
                                  <button disabled={!!acting} onClick={() => act(adminUpdateUserPlan, u.id, 'free', 'Admin revoke')}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 disabled:opacity-50">
                                    ↓ Revoke Pro
                                  </button>
                                )}
                              </>
                            )}

                            {isSuperAdmin && u.role === 'user' && (
                              <button disabled={!!acting} onClick={() => act(adminUpdateUserRole, u.id, 'admin')}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700 disabled:opacity-50">
                                ↑ Make Admin (Pro 1yr)
                              </button>
                            )}
                            {isSuperAdmin && u.role === 'admin' && (
                              <>
                                {u.status !== 'banned' && (
                                  <button disabled={!!acting} onClick={() => act(adminUpdateUserStatus, u.id, 'banned', 'Superadmin action')}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-600 disabled:opacity-50">
                                    ✕ Ban
                                  </button>
                                )}
                                {u.status !== 'suspended' && (
                                  <button disabled={!!acting} onClick={() => act(adminUpdateUserStatus, u.id, 'suspended', 'Superadmin action')}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-yellow-100 text-yellow-700 disabled:opacity-50">
                                    ⏸ Suspend
                                  </button>
                                )}
                                {u.status !== 'active' && (
                                  <button disabled={!!acting} onClick={() => act(adminUpdateUserStatus, u.id, 'active', 'Superadmin action')}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 disabled:opacity-50">
                                    ✓ Activate
                                  </button>
                                )}
                                <button disabled={!!acting} onClick={() => act(adminUpdateUserRole, u.id, 'user')}
                                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 disabled:opacity-50">
                                  ↓ Demote (revoke Pro)
                                </button>
                              </>
                            )}

                            {acting && <LoaderCircle size={14} className="animate-spin text-primary" />}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted text-xs">{pagination.total} users · page {pagination.page} of {pagination.pages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg glass-card disabled:opacity-40">
              <ChevronLeft size={14} />
            </button>
            <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg glass-card disabled:opacity-40">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
