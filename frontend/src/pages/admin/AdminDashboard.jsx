import { useEffect, useState } from 'react'
import { LoaderCircle, Users, Crown, UserCheck, Ban } from 'lucide-react'
import { adminDashboard } from '../../api'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="glass-card rounded-2xl p-4 flex items-center gap-4">
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${color}18` }}>
      <Icon size={18} style={{ color }} />
    </div>
    <div>
      <div className="text-2xl font-black text-text-primary">{value ?? '—'}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  </div>
)

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    adminDashboard()
      .then(res => setData(res.data))
      .catch(e => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-16"><LoaderCircle className="animate-spin text-primary" /></div>
  if (error) return <div className="text-center text-primary py-8 text-sm">{error}</div>

  const { stats, recent } = data

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 stagger">
        <StatCard icon={Users}     label="Total Users"    value={stats.totalUsers}    color="#6366f1" />
        <StatCard icon={Crown}     label="Pro Subscribers" value={stats.proSubscribers} color="#f59e0b" />
        <StatCard icon={UserCheck} label="Free Users"     value={stats.freeUsers}     color="#16a34a" />
        <StatCard icon={UserCheck} label="Active"         value={stats.activeUsers}   color="#0ea5e9" />
        <StatCard icon={Ban}       label="Banned"         value={stats.bannedUsers}   color="#dc2626" />
      </div>

      {/* Recent Users */}
      <div className="glass-card rounded-2xl p-5">
        <div className="font-bold text-text-primary mb-3">Recent Signups</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted text-xs border-b border-border">
                <th className="pb-2 font-semibold">Name</th>
                <th className="pb-2 font-semibold">Email</th>
                <th className="pb-2 font-semibold">Plan</th>
                <th className="pb-2 font-semibold">Status</th>
                <th className="pb-2 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {recent.users?.map(u => (
                <tr key={u.id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 font-medium">{u.name}</td>
                  <td className="py-2 text-text-muted">{u.email}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${u.subPlanSlug === 'pro' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.subPlanSlug || 'free'}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {u.status || 'active'}
                    </span>
                  </td>
                  <td className="py-2 text-text-muted">{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
