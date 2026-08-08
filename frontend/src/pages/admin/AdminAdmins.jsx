import { useEffect, useState, useCallback } from 'react'
import {
  LoaderCircle, Shield, ShieldCheck, UserPlus, ArrowDownCircle,
  Check, X, Mail, Lock, User, Search, Crown, Sparkles, Users,
} from 'lucide-react'
import { adminGetPermissions, adminGetAdmins, adminCreateAdmin, adminGetUsers, adminUpdateUserRole } from '../../api'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const ROLE_CFG = {
  admin:      { label: 'Admin',      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', gradient: 'linear-gradient(135deg,#3b82f655,#3b82f622)' },
  superadmin: { label: 'Superadmin', color: '#a855f7', bg: 'rgba(168,85,247,0.12)', gradient: 'linear-gradient(135deg,#a855f755,#a855f722)' },
}

const STATUS_CFG = {
  active:    { label: 'Active',    color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  banned:    { label: 'Banned',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  suspended: { label: 'Suspended', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
}

const Chip = ({ cfg }) => (
  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ color: cfg.color, background: cfg.bg }}>
    {cfg.label}
  </span>
)

const StatPill = ({ icon: Icon, label, value, color }) => (
  <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#111', border: '1px solid #1e1e1e' }}>
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
      <Icon size={18} style={{ color }} />
    </div>
    <div>
      <div className="text-2xl font-black text-text-primary leading-none">{value}</div>
      <div className="text-[11px] text-[#555] font-medium mt-1">{label}</div>
    </div>
  </div>
)

const Field = ({ icon: Icon, label, ...props }) => (
  <div className="space-y-1.5">
    <label className="text-[11px] font-bold text-[#666] uppercase tracking-wide">{label}</label>
    <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: '#0a0a0a', border: '1px solid #2c2c2e' }}>
      <Icon size={14} className="text-[#555] flex-shrink-0" />
      <input {...props}
        className="bg-transparent text-sm outline-none w-full text-text-primary placeholder:text-[#444]"
      />
    </div>
  </div>
)

export default function AdminAdmins() {
  const [permissions, setPermissions] = useState(null)
  const [admins, setAdmins]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState('')
  const [acting, setActing]           = useState(null)
  const [creating, setCreating]       = useState(false)
  const [form, setForm]               = useState({ name: '', email: '', password: '' })
  const [promoteEmail, setPromoteEmail]       = useState('')
  const [promoteResults, setPromoteResults]   = useState([])
  const [promoteSearching, setPromoteSearching] = useState(false)
  const [promoteSearchError, setPromoteSearchError] = useState('')
  const [actionTab, setActionTab]     = useState('create')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([adminGetPermissions(), adminGetAdmins()])
      .then(([perm, adminRes]) => {
        setPermissions(perm.data)
        setAdmins(adminRes.data || [])
      })
      .catch(e => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const q = promoteEmail.trim()
    if (q.length < 2) {
      setPromoteResults([])
      setPromoteSearchError('')
      setPromoteSearching(false)
      return
    }

    setPromoteSearching(true)
    const timer = setTimeout(() => {
      adminGetUsers({ search: q, limit: 8, role: 'user' })
        .then(res => {
          const users = res.data || []
          setPromoteResults(users)
          setPromoteSearchError(users.length ? '' : 'No users found matching this search')
        })
        .catch(err => {
          setPromoteResults([])
          setPromoteSearchError(err.detail || 'Search failed')
        })
        .finally(() => setPromoteSearching(false))
    }, 350)

    return () => clearTimeout(timer)
  }, [promoteEmail])

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500) }

  const createAdmin = async (e) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      await adminCreateAdmin(form)
      setForm({ name: '', email: '', password: '' })
      flash('Admin account created successfully')
      load()
    } catch (err) {
      setError(err.detail || 'Failed to create admin')
    } finally {
      setCreating(false)
    }
  }

  const promote = async (userId) => {
    if (!window.confirm('Make this user an Admin? They will NOT get Pro — only admin panel access.')) return
    setActing(userId)
    setError('')
    try {
      await adminUpdateUserRole(userId, 'admin')
      setPromoteEmail('')
      setPromoteResults([])
      flash('User promoted to Admin')
      load()
    } catch (err) {
      setError(err.detail || 'Promotion failed')
    } finally {
      setActing(null)
    }
  }

  const demote = async (userId, email) => {
    if (!window.confirm(`Remove admin access from ${email}? Their Pro subscription stays unchanged.`)) return
    setActing(userId)
    setError('')
    try {
      await adminUpdateUserRole(userId, 'user')
      flash('Admin demoted to regular user')
      load()
    } catch (err) {
      setError(err.detail || 'Demotion failed')
    } finally {
      setActing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <LoaderCircle className="animate-spin text-[#3b82f6]" size={28} />
        <span className="text-xs text-[#555]">Loading admin data…</span>
      </div>
    )
  }

  const matrix = permissions?.matrix || []
  const superCount = admins.filter(a => a.role === 'superadmin').length
  const adminCount = admins.filter(a => a.role === 'admin').length

  return (
    <div className="space-y-5">

      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)', border: '1px solid #2c2c2e' }}>
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-20 blur-3xl" style={{ background: '#3b82f6' }} />
        <div className="absolute bottom-0 left-20 w-32 h-32 rounded-full opacity-15 blur-3xl" style={{ background: '#a855f7' }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', boxShadow: '0 8px 24px rgba(59,130,246,0.35)' }}>
            <ShieldCheck size={22} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black text-white">Admin Management</h2>
            <p className="text-xs text-[#94a3b8] mt-1 max-w-lg">
              <span className="text-[#60a5fa] font-semibold">Pro ≠ Admin.</span> Subscription access aur admin panel access alag cheezein hain — yahan sirf admin roles manage hote hain.
            </p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 px-4 py-3 rounded-xl animate-in fade-in"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <X size={14} className="flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-xs text-green-400 px-4 py-3 rounded-xl animate-in fade-in"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <Check size={14} className="flex-shrink-0" /> {success}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatPill icon={Users} label="Total Admins" value={admins.length} color="#6366f1" />
        <StatPill icon={Shield} label="Regular Admins" value={adminCount} color="#3b82f6" />
        <StatPill icon={Sparkles} label="Superadmins" value={superCount} color="#a855f7" />
      </div>

      {/* Permissions matrix — card grid on mobile, table on desktop */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #1e1e1e' }}>
        <div className="px-4 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid #1e1e1e' }}>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#3b82f6]" />
            <span className="font-black text-sm text-text-primary">Role Permissions</span>
          </div>
          <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider">{matrix.length} permissions</span>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                <th className="px-4 py-3 text-left text-[#555] font-semibold">Feature</th>
                <th className="px-4 py-3 text-center w-28">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ color: '#3b82f6', background: 'rgba(59,130,246,0.12)' }}>
                    <Shield size={10} /> Admin
                  </span>
                </th>
                <th className="px-4 py-3 text-center w-32">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ color: '#a855f7', background: 'rgba(168,85,247,0.12)' }}>
                    <Sparkles size={10} /> Superadmin
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, i) => (
                <tr key={row.feature} className="hover:bg-white/[0.02] transition-colors" style={{ borderBottom: i < matrix.length - 1 ? '1px solid #1a1a1a' : undefined }}>
                  <td className="px-4 py-3 text-text-secondary font-medium">{row.feature}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex w-6 h-6 rounded-lg items-center justify-center ${row.admin ? 'bg-green-500/10' : 'bg-white/5'}`}>
                      {row.admin ? <Check size={13} className="text-green-500" /> : <X size={13} className="text-[#333]" />}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex w-6 h-6 rounded-lg items-center justify-center ${row.superadmin ? 'bg-green-500/10' : 'bg-white/5'}`}>
                      {row.superadmin ? <Check size={13} className="text-green-500" /> : <X size={13} className="text-[#333]" />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y" style={{ borderColor: '#1a1a1a' }}>
          {matrix.map(row => (
            <div key={row.feature} className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-xs text-text-secondary font-medium flex-1">{row.feature}</span>
              <div className="flex gap-2">
                <span title="Admin" className={`w-7 h-7 rounded-lg flex items-center justify-center ${row.admin ? 'bg-green-500/10' : 'bg-white/5'}`}>
                  {row.admin ? <Check size={12} className="text-green-500" /> : <X size={12} className="text-[#333]" />}
                </span>
                <span title="Superadmin" className={`w-7 h-7 rounded-lg flex items-center justify-center ${row.superadmin ? 'bg-green-500/10' : 'bg-white/5'}`}>
                  {row.superadmin ? <Check size={12} className="text-green-500" /> : <X size={12} className="text-[#333]" />}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions panel */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #1e1e1e' }}>
        <div className="flex gap-1 p-1.5 m-3 rounded-xl" style={{ background: '#0a0a0a' }}>
          {[
            { id: 'create', label: 'Create Admin', icon: UserPlus },
            { id: 'promote', label: 'Promote User', icon: Shield },
          ].map(t => {
            const Icon = t.icon
            const active = actionTab === t.id
            return (
              <button key={t.id} onClick={() => setActionTab(t.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all"
                style={active
                  ? { background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }
                  : { color: '#666' }
                }>
                <Icon size={13} /> {t.label}
              </button>
            )
          })}
        </div>

        <div className="px-4 pb-5">
          {actionTab === 'create' ? (
            <form onSubmit={createAdmin} className="space-y-4 max-w-md">
              <Field icon={User} label="Full Name" required placeholder="Rahul Sharma"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Field icon={Mail} label="Email Address" required type="email" placeholder="admin@example.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <Field icon={Lock} label="Password" required type="password" minLength={6} placeholder="Minimum 6 characters"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              <button type="submit" disabled={creating}
                className="w-full py-3 rounded-xl text-sm font-black text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', boxShadow: '0 4px 16px rgba(59,130,246,0.25)' }}>
                {creating ? (
                  <span className="flex items-center justify-center gap-2"><LoaderCircle size={16} className="animate-spin" /> Creating…</span>
                ) : (
                  <span className="flex items-center justify-center gap-2"><UserPlus size={16} /> Create Admin Account</span>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-3 max-w-lg">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#666] uppercase tracking-wide">Find User by Email or Name</label>
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: '#0a0a0a', border: '1px solid #2c2c2e' }}>
                    {promoteSearching
                      ? <LoaderCircle size={14} className="text-[#3b82f6] animate-spin flex-shrink-0" />
                      : <Search size={14} className="text-[#555] flex-shrink-0" />
                    }
                    <input
                      value={promoteEmail}
                      onChange={e => setPromoteEmail(e.target.value)}
                      placeholder="Type email or name…"
                      className="bg-transparent text-sm outline-none w-full text-text-primary placeholder:text-[#444]"
                    />
                  </div>
                  {promoteEmail.trim().length > 0 && promoteEmail.trim().length < 2 && (
                    <p className="text-[11px] text-[#555] mt-1.5 px-1">At least 2 characters to search</p>
                  )}
                </div>
              </div>

              {promoteSearchError && promoteEmail.trim().length >= 2 && !promoteSearching && (
                <div className="text-xs text-[#666] px-3 py-2 rounded-xl text-center" style={{ background: '#0a0a0a', border: '1px solid #1e1e1e' }}>
                  {promoteSearchError}
                </div>
              )}

              {promoteResults.length > 0 && (
                <div className="rounded-2xl overflow-hidden" style={{ background: '#0a0a0a', border: '1px solid #1e1e1e' }}>
                  <div className="px-3 py-2 text-[10px] font-bold text-[#555] uppercase tracking-wider" style={{ borderBottom: '1px solid #1a1a1a' }}>
                    {promoteResults.length} result{promoteResults.length !== 1 ? 's' : ''}
                  </div>
                  <div className="divide-y" style={{ borderColor: '#1a1a1a' }}>
                    {promoteResults.map(u => (
                      <div key={u.id} className="p-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg,#3b82f655,#3b82f622)', border: '1.5px solid #3b82f644', color: '#3b82f6' }}>
                          {u.name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-text-primary truncate">{u.name}</div>
                          <div className="text-xs text-[#555] truncate">{u.email}</div>
                          <div className="text-[10px] text-[#444] mt-0.5 capitalize">{u.subPlanSlug || 'free'} · {u.status || 'active'}</div>
                        </div>
                        <button onClick={() => promote(u.id)} disabled={acting === u.id}
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50 transition-all active:scale-95"
                          style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                          {acting === u.id ? <LoaderCircle size={14} className="animate-spin" /> : <Shield size={14} />}
                          Promote
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Admin roster */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #1e1e1e' }}>
        <div className="px-4 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid #1e1e1e' }}>
          <span className="font-black text-sm text-text-primary">Team Roster</span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ color: '#6366f1', background: 'rgba(99,102,241,0.12)' }}>
            {admins.length} members
          </span>
        </div>

        {admins.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-[#555] gap-2">
            <Shield size={36} className="opacity-15" />
            <p className="text-sm">No admins found</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {admins.map(a => {
              const cfg = ROLE_CFG[a.role] || ROLE_CFG.admin
              const statusCfg = STATUS_CFG[a.status || 'active']
              const isActing = acting === a.id

              return (
                <div key={a.id} className="rounded-2xl px-4 py-3.5 flex items-center gap-3 transition-all hover:border-[#333]"
                  style={{ background: '#0a0a0a', border: '1px solid #1e1e1e' }}>

                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                    style={{ background: cfg.gradient, border: `1.5px solid ${cfg.color}44`, color: cfg.color }}>
                    {a.name?.[0]?.toUpperCase() || '?'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-text-primary truncate">{a.name}</span>
                      <Chip cfg={cfg} />
                      <Chip cfg={statusCfg} />
                    </div>
                    <div className="text-xs text-[#555] truncate mt-0.5">{a.email}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#444] mt-1">
                      <span>Joined {fmtDate(a.createdAt)}</span>
                      {a.lastLoginAt && <span>Last login {fmtDate(a.lastLoginAt)}</span>}
                      {a.subPlanSlug === 'pro' && (
                        <span className="flex items-center gap-1 text-[#f59e0b]">
                          <Crown size={10} /> Pro till {fmtDate(a.subExpiresAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {a.role === 'admin' ? (
                    <button onClick={() => demote(a.id, a.email)} disabled={isActing}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40 transition-all hover:scale-105 active:scale-95"
                      style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      {isActing ? <LoaderCircle size={13} className="animate-spin" /> : <ArrowDownCircle size={13} />}
                      Demote
                    </button>
                  ) : (
                    <span className="flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)' }}>
                      Protected
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
