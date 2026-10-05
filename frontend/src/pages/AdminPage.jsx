import { useCallback, useEffect } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
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
import AdminMatchDataset from './admin/AdminMatchDataset'

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
  { id: 'match_dataset', label: 'Match Dataset', icon: Database, superadminOnly: true },
  { id: 'audit',     label: 'Audit Logs',icon: ScrollText },
]

const TAB_GROUPS = [
  { label: 'Overview', ids: ['dashboard'] },
  { label: 'Match intelligence', ids: ['match_dataset', 'toss_dataset'] },
  { label: 'People & access', ids: ['users', 'pro_users', 'lapsed_users', 'admins'] },
  { label: 'Billing', ids: ['sub_logs', 'plans', 'coupons'] },
  { label: 'System', ids: ['settings', 'audit'] },
]

export default function AdminPage() {
  const navigate = useNavigate()
  const { isLoggedIn, user } = useOutletContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') || 'dashboard'
  const tab = ALL_TABS.some(item => item.id === requestedTab) ? requestedTab : 'dashboard'
  const setTab = useCallback(value => setSearchParams(previous => { const next = new URLSearchParams(previous); next.set('tab', value); return next }, { replace: true }), [setSearchParams])
  const isSuperAdmin = user?.role === 'superadmin'
  const tabs = ALL_TABS.filter(t => isSuperAdmin || !t.superadminOnly)

  useEffect(() => {
    if (!isLoggedIn || (user && !['admin', 'superadmin'].includes(user.role))) {
      navigate('/')
    }
  }, [isLoggedIn, user, navigate])

  useEffect(() => {
    if (!isSuperAdmin && ['admins', 'plans', 'coupons', 'settings', 'toss_dataset', 'match_dataset'].includes(tab)) {
      setTab('dashboard')
    }
  }, [tab, isSuperAdmin, setTab])

  if (!user) return (
    <div className="flex h-[80vh] items-center justify-center">
      <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  if (!['admin', 'superadmin'].includes(user.role)) return null

  return (
    <div className="admin-workspace fade-in">
      {/* Header */}
      <div className="admin-workspace-heading">
        <div className="admin-heading-icon">
          <Shield size={18} />
        </div>
        <div>
          <p className="ui-eyebrow">WORKSPACE</p><h1>Administration</h1>
          <p className="text-xs text-text-muted capitalize">{user?.role} · {user?.email}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-workspace-body">
      <label className="admin-mobile-navigation" htmlFor="admin-section-select"><span>Workspace section</span>
        <select id="admin-section-select" aria-label="Workspace section" value={tab} onChange={event => setTab(event.target.value)}>
          {TAB_GROUPS.map(group => <optgroup key={group.label} label={group.label}>{group.ids.map(id => tabs.find(item => item.id === id)).filter(Boolean).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}
        </select>
      </label>
      <nav className="admin-navigation" aria-label="Administration">
        {TAB_GROUPS.map(group => {
          const items = group.ids.map(id => tabs.find(item => item.id === id)).filter(Boolean)
          return items.length > 0 && <div className="admin-nav-group" key={group.label}><p>{group.label}</p>{items.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={active ? 'is-active' : ''}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={17} />
              {t.label}
            </button>
          )
        })}</div>})}
      </nav>

      <section className="admin-content" aria-label={tabs.find(item => item.id === tab)?.label || 'Dashboard'}>
      <div className="admin-section-heading"><span>Admin workspace</span><span>/</span><strong>{tabs.find(item => item.id === tab)?.label}</strong></div>

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
      {tab === 'match_dataset' && isSuperAdmin && <AdminMatchDataset />}
      {tab === 'audit'     && <AdminAuditLogs />}
      </section>
      </div>
    </div>
  )
}
