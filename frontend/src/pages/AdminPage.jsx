import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Shield, LayoutDashboard, Users, CreditCard, Tag, Settings, ScrollText, LoaderCircle } from 'lucide-react'
import AdminDashboard from './admin/AdminDashboard'
import AdminUsers from './admin/AdminUsers'
import AdminPlans from './admin/AdminPlans'
import AdminCoupons from './admin/AdminCoupons'
import AdminSettings from './admin/AdminSettings'
import AdminAuditLogs from './admin/AdminAuditLogs'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users',     label: 'Users',     icon: Users },
  { id: 'plans',     label: 'Plans',     icon: CreditCard },
  { id: 'coupons',   label: 'Coupons',   icon: Tag },
  { id: 'settings',  label: 'Settings',  icon: Settings },
  { id: 'audit',     label: 'Audit Logs',icon: ScrollText },
]

export default function AdminPage() {
  const navigate = useNavigate()
  const { isLoggedIn, user } = useOutletContext()
  const [tab, setTab] = useState('dashboard')

  useEffect(() => {
    if (!isLoggedIn || (user && !['admin', 'superadmin'].includes(user.role))) {
      navigate('/')
    }
  }, [isLoggedIn, user])

  if (!user) return (
    <div className="flex h-[80vh] items-center justify-center">
      <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  if (!['admin', 'superadmin'].includes(user.role)) return null

  const isSuperAdmin = user?.role === 'superadmin'

  return (
    <div className="max-w-6xl mx-auto p-4 fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
          style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}>
          <Shield size={18} />
        </div>
        <div>
          <h1 className="text-xl font-black text-text-primary">Admin Panel</h1>
          <p className="text-xs text-text-muted capitalize">{user?.role} · {user?.email}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-5 pb-1">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all"
              style={active
                ? { background: 'linear-gradient(135deg,#dc2626,#f97316)', color: '#fff' }
                : { background: 'rgba(220,38,38,0.06)', color: '#374151' }
              }
            >
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {tab === 'dashboard' && <AdminDashboard />}
      {tab === 'users'     && <AdminUsers isSuperAdmin={isSuperAdmin} />}
      {tab === 'plans'     && <AdminPlans isSuperAdmin={isSuperAdmin} />}
      {tab === 'coupons'   && <AdminCoupons />}
      {tab === 'settings'  && <AdminSettings isSuperAdmin={isSuperAdmin} />}
      {tab === 'audit'     && <AdminAuditLogs />}
    </div>
  )
}
