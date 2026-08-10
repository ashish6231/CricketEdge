import { useEffect } from 'react'
import { useNavigate, useOutletContext, Link } from 'react-router-dom'
import { LoaderCircle, Crown, LogOut, Shield } from 'lucide-react'
import { logout } from '../api'
import { isActiveTrial, isPaidPro, getTrialMinutesLeft, formatTrialTimeLeft } from '../lib/subscriptionAccess'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { isLoggedIn, user, onLogout } = useOutletContext()

  useEffect(() => {
    if (!isLoggedIn) navigate('/login', { replace: true })
  }, [isLoggedIn])

  const handleLogout = async () => {
    await logout()
    if (onLogout) onLogout()
    navigate('/login', { replace: true })
  }

  if (!user) return <div className="flex h-[80vh] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>

  const isPro = isPaidPro(user)
  const onTrial = isActiveTrial(user)
  const planName = onTrial ? `Trial (${formatTrialTimeLeft(getTrialMinutesLeft(user))} left)` : isPro ? '⭐ Pro' : 'Free'

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 fade-in">
      <h1 className="text-2xl font-black text-text-primary">Profile</h1>

      {/* User Card */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-black"
            style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>
            {user.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <div className="font-black text-lg text-text-primary">{user.name}</div>
            <div className="text-sm text-text-muted">{user.email}</div>
            <div className="flex items-center gap-1 mt-1">
              {user.role === 'superadmin' && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Superadmin</span>}
              {user.role === 'admin' && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Admin</span>}
              {onTrial && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Trial · {formatTrialTimeLeft(getTrialMinutesLeft(user))} left</span>}
              {isPro
                ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">⭐ Pro</span>
                : !onTrial && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Free</span>
              }
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-border/40">
            <span className="text-text-muted">Plan</span>
            <span className="font-semibold">{planName}</span>
          </div>
          {(isPro || onTrial) && (
            <div className="flex justify-between py-2 border-b border-border/40">
              <span className="text-text-muted">{onTrial ? 'Trial ends' : 'Expires'}</span>
              <span className="font-semibold">{fmtDate(user.subscription?.expiresAt)}</span>
            </div>
          )}
          {onTrial && (
            <div className="flex justify-between py-2 border-b border-border/40">
              <span className="text-text-muted">Live access</span>
              <span className="font-semibold text-profit">Full Pro access</span>
            </div>
          )}
          <div className="flex justify-between py-2 border-b border-border/40">
            <span className="text-text-muted">Member since</span>
            <span className="font-semibold">{fmtDate(user.createdAt)}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-text-muted">Auth</span>
            <span className="font-semibold capitalize">{user.authProvider || 'local'}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {!isPro && (
          <Link to="/subscription"
            className="flex items-center justify-between w-full glass-card rounded-2xl p-4 hover:bg-bg-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <Crown size={18} className="text-yellow-500" />
              <span className="font-semibold text-text-primary">{onTrial ? 'Upgrade to Pro Before Trial Ends' : 'Upgrade to Pro'}</span>
            </div>
            <span className="text-xs text-primary font-bold">Upgrade →</span>
          </Link>
        )}
        {isPro && (
          <Link to="/subscription"
            className="flex items-center justify-between w-full glass-card rounded-2xl p-4 hover:bg-bg-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <Crown size={18} className="text-yellow-500" />
              <span className="font-semibold text-text-primary">Manage Subscription</span>
            </div>
            <span className="text-xs text-primary font-bold">View →</span>
          </Link>
        )}
        {(user.role === 'admin' || user.role === 'superadmin') && (
          <Link to="/admin"
            className="flex items-center justify-between w-full glass-card rounded-2xl p-4 hover:bg-bg-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <Shield size={18} className="text-primary" />
              <span className="font-semibold text-text-primary">Admin Panel</span>
            </div>
            <span className="text-xs text-primary font-bold">Open →</span>
          </Link>
        )}
        <button onClick={handleLogout}
          className="flex items-center gap-3 w-full glass-card rounded-2xl p-4 hover:bg-bg-card-hover transition-all text-left"
        >
          <LogOut size={18} className="text-loss" />
          <span className="font-semibold text-loss">Logout</span>
        </button>
      </div>
    </div>
  )
}
