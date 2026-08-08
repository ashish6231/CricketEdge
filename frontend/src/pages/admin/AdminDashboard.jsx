import { useEffect, useState } from 'react'
import { LoaderCircle, Users, Crown, UserCheck, Ban, TrendingUp, UserMinus } from 'lucide-react'
import { adminDashboard, adminGetUsers, adminGetPermissions } from '../../api'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const ROLE_CFG = {
  user:       { color: '#8e8e93', bg: 'rgba(142,142,147,0.12)' },
  admin:      { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  superadmin: { color: '#a855f7', bg: 'rgba(168,85,247,0.12)'  },
}
const STATUS_CFG = {
  active:    { color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  banned:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  suspended: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
}
const PLAN_CFG = {
  pro:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: '⭐ Pro'  },
  trial: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Trial' },
  free:  { color: '#8e8e93', bg: 'rgba(142,142,147,0.1)',  label: 'Free' },
}

const StatCard = ({ icon: Icon, label, value, color, sub }) => (
  <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#111', border: '1px solid #1e1e1e' }}>
    <div className="flex items-center justify-between">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
        <Icon size={16} style={{ color }} />
      </div>
      {sub != null && (
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color, background: `${color}15` }}>
          {sub}
        </span>
      )}
    </div>
    <div>
      <div className="text-3xl font-black text-text-primary tracking-tight">{value ?? '—'}</div>
      <div className="text-xs text-[#555] mt-0.5 font-medium">{label}</div>
    </div>
  </div>
)

export default function AdminDashboard({ isSuperAdmin }) {
  const [data, setData]         = useState(null)
  const [recentUsers, setRecentUsers] = useState([])
  const [permissions, setPermissions] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    Promise.all([
      adminDashboard(),
      adminGetUsers({ page: 1, limit: 10, sort: 'newest' }),
      adminGetPermissions(),
    ])
      .then(([dash, users, perm]) => {
        setData(dash.data)
        setRecentUsers(users.data || [])
        setPermissions(perm.data)
      })
      .catch(e => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-16"><LoaderCircle className="animate-spin text-primary" /></div>
  if (error)   return <div className="text-center text-red-400 py-8 text-sm">{error}</div>

  const { stats } = data
  const proRatio = stats.totalUsers ? Math.round((stats.proSubscribers / stats.totalUsers) * 100) : 0

  return (
    <div className="space-y-5">

      {!isSuperAdmin && permissions?.capabilities?.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #1e1e1e' }}>
          <div className="text-xs font-bold text-[#3b82f6] mb-2 uppercase tracking-wide">Your Admin Access</div>
          <div className="flex flex-wrap gap-1.5">
            {permissions.capabilities.map(c => (
              <span key={c} className="text-[11px] font-semibold px-2.5 py-1 rounded-full text-[#888]" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>{c}</span>
            ))}
          </div>
          <p className="text-[11px] text-[#555] mt-2">Granting Pro to users does not make them admin. Admin management is superadmin only.</p>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Users}      label="Total Users"     value={stats.totalUsers}    color="#6366f1" />
        <StatCard icon={Crown}      label="Pro Subscribers" value={stats.proSubscribers} color="#f59e0b" sub={`${proRatio}%`} />
        <StatCard icon={UserMinus}  label="Former Pro"      value={stats.lapsedProUsers} color="#a855f7" />
        <StatCard icon={UserCheck}  label="Free Users"      value={stats.freeUsers}     color="#10b981" />
        <StatCard icon={TrendingUp} label="Active"          value={stats.activeUsers}   color="#0ea5e9" />
        <StatCard icon={Ban}        label="Banned"          value={stats.bannedUsers}   color="#ef4444" />
      </div>

      {/* ── Pro conversion bar ── */}
      <div className="rounded-2xl p-4" style={{ background: '#111', border: '1px solid #1e1e1e' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-text-muted">Pro Conversion</span>
          <span className="text-xs font-black" style={{ color: '#f59e0b' }}>{proRatio}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1e1e1e' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${proRatio}%`, background: 'linear-gradient(90deg,#f59e0b,#dc2626)' }} />
        </div>
        <div className="flex justify-between mt-1.5 text-[11px] text-[#444]">
          <span>{stats.proSubscribers} pro</span>
          <span>{stats.freeUsers} free</span>
        </div>
      </div>

      {/* ── Recent Signups ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #1e1e1e' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #1e1e1e' }}>
          <span className="font-black text-text-primary text-sm">Recent Signups</span>
          <span className="text-xs text-[#555]">Last 10 users</span>
        </div>

        <div className="divide-y" style={{ borderColor: '#1a1a1a' }}>
          {recentUsers.map((u, i) => {
            const roleCfg   = ROLE_CFG[u.role]   || ROLE_CFG.user
            const statusCfg = STATUS_CFG[u.status || 'active']
            const planCfg   = PLAN_CFG[u.subPlanSlug] || PLAN_CFG.free
            return (
              <div key={u.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderColor: '#1a1a1a' }}>
                {/* Index */}
                <span className="text-[11px] font-bold w-4 text-center flex-shrink-0" style={{ color: i < 3 ? '#f59e0b' : '#333' }}>
                  {i + 1}
                </span>

                {/* Avatar */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                  style={{ background: `linear-gradient(135deg,${roleCfg.color}55,${roleCfg.color}22)`, border: `1.5px solid ${roleCfg.color}33` }}>
                  {u.name?.[0]?.toUpperCase() || '?'}
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{u.name}</div>
                  <div className="text-[11px] text-[#555] truncate">{u.email}</div>
                </div>

                {/* Badges */}
                <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: planCfg.color, background: planCfg.bg }}>
                    {planCfg.label}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: statusCfg.color, background: statusCfg.bg }}>
                    {u.status || 'active'}
                  </span>
                </div>

                {/* Date */}
                <span className="text-[11px] text-[#444] flex-shrink-0 hidden md:block">{fmtDate(u.createdAt)}</span>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
