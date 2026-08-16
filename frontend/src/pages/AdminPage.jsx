import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Shield, LayoutDashboard, Users, CreditCard, Tag, Settings, ScrollText, LoaderCircle, Crown, UserMinus, Receipt, ShieldCheck, Database } from 'lucide-react'
import AdminDashboard from './admin/AdminDashboard'
import AdminUsers from './admin/AdminUsers'
import AdminProUsers from './admin/AdminProUsers'
import AdminLapsedUsers from './admin/AdminLapsedUsers'
import AdminSubscriptionLogs from './admin/AdminSubscriptionLogs'
import AdminAdmins from './admin/AdminAdmins'
import AdminPlans from './admin/AdminPlans'
import AdminCoupons from './admin/AdminCoupons'
import AdminSettings from './admin/AdminSettings'
import AdminAuditLogs from './admin/AdminAuditLogs'
import AdminTossDataset from './admin/AdminTossDataset'

const ALL_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users',     label: 'Users',     icon: Users },
  { id: 'pro_users',   label: 'Pro Users',    icon: Crown },
  { id: 'lapsed_users', label: 'Former Pro', icon: UserMinus },
  { id: 'sub_logs',    label: 'Sub Logs',   icon: Receipt },
  { id: 'admins',    label: 'Admins',    icon: ShieldCheck, superadminOnly: true },
  { id: 'plans',     label: 'Plans',     icon: CreditCard, superadminOnly: true },
  { id: 'coupons',   label: 'Coupons',   icon: Tag, superadminOnly: true },
  { id: 'settings',  label: 'Settings',  icon: Settings, superadminOnly: true },
  { id: 'toss_dataset', label: 'Toss Dataset', icon: Database, superadminOnly: true },
  { id: 'audit',     label: 'Audit Logs',icon: ScrollText },
]

export default function AdminPage() {
  const navigate = useNavigate()
  const { isLoggedIn, user } = useOutletContext()
  const [tab, setTab] = useState('dashboard')
  const isSuperAdmin = user?.role === 'superadmin'
  const tabs = ALL_TABS.filter(t => isSuperAdmin || !t.superadminOnly)

  useEffect(() => {
    if (!isLoggedIn || (user && !['admin', 'superadmin'].includes(user.role))) {
      navigate('/')
    }
  }, [isLoggedIn, user, navigate])

  useEffect(() => {
    if (!isSuperAdmin && ['admins', 'plans', 'coupons', 'settings', 'toss_dataset'].includes(tab)) {
      setTab('dashboard')
    }
  }, [tab, isSuperAdmin])

  if (!user) return (
    <div className="flex h-[80vh] items-center justify-center">
      <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  if (!['admin', 'superadmin'].includes(user.role)) return null

  return (
    <div className="max-w-6xl mx-auto p-4 fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
          style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>
          <Shield size={18} />
        </div>
        <div>
          <h1 className="text-xl font-black text-text-primary">Admin Panel</h1>
          <p className="text-xs text-text-muted capitalize">{user?.role} · {user?.email}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-5 pb-1">
        {tabs.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all"
              style={active
                ? { background: 'linear-gradient(135deg,#dc2626,#10b981)', color: '#fff' }
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
      {tab === 'dashboard' && <AdminDashboard isSuperAdmin={isSuperAdmin} />}
      {tab === 'users'     && <AdminUsers isSuperAdmin={isSuperAdmin} />}
      {tab === 'pro_users'    && <AdminProUsers isSuperAdmin={isSuperAdmin} />}
      {tab === 'lapsed_users' && <AdminLapsedUsers isSuperAdmin={isSuperAdmin} />}
      {tab === 'sub_logs'    && <AdminSubscriptionLogs />}
      {tab === 'admins'      && isSuperAdmin && <AdminAdmins />}
      {tab === 'plans'     && <AdminPlans isSuperAdmin={isSuperAdmin} />}
      {tab === 'coupons'   && <AdminCoupons />}
      {tab === 'settings'  && <AdminSettings isSuperAdmin={isSuperAdmin} />}
      {tab === 'toss_dataset' && isSuperAdmin && <AdminTossDataset />}
      {tab === 'audit'     && <AdminAuditLogs />}
    </div>
  )
}
