import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom'
import { Activity, Menu, X, Shield, LogOut, User, ChevronDown } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { getAuthStatus, logout } from '../api'
import { getPlanLabel, isActiveTrial, isPaidPro, getTrialMinutesLeft, formatTrialTimeLeft } from '../lib/subscriptionAccess'

const NAV_ITEMS = [
  { path: '/cricket', label: 'Cricket', icon: '🏏' },
  { path: '/tennis',  label: 'Tennis',  icon: '🎾' },
]

export default function MainLayout() {
  const location = useLocation()
  const navigate  = useNavigate()
  const [mobileMenu, setMobileMenu] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authUser, setAuthUser]     = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [dropdown, setDropdown]     = useState(false)
  const dropRef = useRef(null)

  useEffect(() => {
    const refresh = () => {
      getAuthStatus().then(data => {
        setIsLoggedIn(data.isLoggedIn || false)
        setAuthUser(data.user || null)
      }).catch(() => {})
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropdown(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e) => setLastUpdated(e.detail?.time || new Date())
    window.addEventListener('data-refreshed', handler)
    return () => window.removeEventListener('data-refreshed', handler)
  }, [])

  const handleLoginSuccess = (email, user) => {
    setIsLoggedIn(true)
    setAuthUser(user || null)
  }

  const handleLogout = async () => {
    await logout()
    setIsLoggedIn(false)
    setAuthUser(null)
    setDropdown(false)
    navigate('/login', { replace: true })
  }

  const isAdmin = authUser?.role === 'admin' || authUser?.role === 'superadmin'
  const onTrial = isActiveTrial(authUser)
  const paidPro = isPaidPro(authUser)
  const planLabel = getPlanLabel(authUser)
  const initials = authUser?.name?.[0]?.toUpperCase() || '?'

  return (
    <div className="flex min-h-screen bg-[#000000]">
      {/* Top accent */}
      <div className="fixed top-0 left-0 right-0 h-1 z-50"
        style={{ background: 'linear-gradient(90deg,#dc2626,#10b981,#dc2626)' }} />

      {/* Header */}
      <header className="fixed top-1 left-0 right-0 z-40 border-b border-[#2c2c2e]"
        style={{ background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center h-13 px-4 gap-3">
          {/* Mobile toggle */}
          <button className="md:hidden text-text-muted hover:text-primary" onClick={() => setMobileMenu(m => !m)}>
            {mobileMenu ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>
              <Activity className="h-4 w-4 text-white" />
            </div>
            <span className="font-black text-lg tracking-tight text-text-primary">
              Cricket<span className="text-primary">Edge</span>
            </span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1.5 ml-2 overflow-x-auto no-scrollbar">
            {NAV_ITEMS.map(item => (
              <Link key={item.path} to={item.path}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[13px] font-semibold tracking-wide transition-all ${
                  location.pathname.startsWith(item.path) ? 'text-white shadow-sm' : 'text-text-secondary hover:text-primary'
                }`}
                style={location.pathname.startsWith(item.path)
                  ? { background: 'linear-gradient(135deg,#dc2626,#10b981)' }
                  : { background: 'rgba(255,255,255,0.05)' }
                }>
                {item.icon} {item.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            {/* Admin button — navbar me */}
            {isAdmin && (
              <Link to="/admin"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>
                <Shield size={12} /> Admin
              </Link>
            )}
            {/* Live clock */}
            {lastUpdated && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a' }}>
                <span className="pulse-dot h-1.5 w-1.5 rounded-full" style={{ background: '#16a34a' }} />
                {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            )}

            {isLoggedIn && authUser ? (
              /* ── Profile dropdown ── */
              <div className="relative" ref={dropRef}>
                <button onClick={() => setDropdown(d => !d)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #2c2c2e' }}>
                  {/* Avatar circle */}
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black"
                    style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>
                    {initials}
                  </div>
                  <span className="hidden sm:block text-xs font-semibold text-text-primary max-w-24 truncate">
                    {authUser.name}
                  </span>
                  <ChevronDown size={12} className="text-text-muted" />
                </button>

                {dropdown && (
                  <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl shadow-xl z-50 overflow-hidden"
                    style={{ background: '#111111', border: '1px solid #2c2c2e', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                    {/* User info */}
                    <div className="px-4 py-3 border-b border-border/60">
                      <div className="font-bold text-sm text-text-primary truncate">{authUser.name}</div>
                      <div className="text-xs text-text-muted truncate">{authUser.email}</div>
                      <div className="flex items-center gap-1 mt-1">
                        {authUser.role !== 'user' && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 capitalize">
                            {authUser.role}
                          </span>
                        )}
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                          onTrial
                            ? 'bg-emerald-100 text-emerald-700'
                            : paidPro
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-500'
                        }`}>
                          {planLabel}
                        </span>
                      </div>
                    </div>

                    {/* Profile link */}
                    <Link to="/profile" onClick={() => setDropdown(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-secondary hover:bg-[#1a1a1a] transition-colors">
                      <User size={14} className="text-text-muted" /> My Profile
                    </Link>

                    {/* Subscription */}
                    <Link to="/subscription" onClick={() => setDropdown(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-secondary hover:bg-[#1a1a1a] transition-colors">
                      <span className="text-yellow-500 text-sm">⭐</span>
                      {paidPro ? 'Manage Subscription' : onTrial ? 'Upgrade Before Trial Ends' : 'Upgrade to Pro'}
                    </Link>

                    {/* Logout */}
                    <button onClick={handleLogout}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-loss hover:bg-[#1a1a1a] transition-colors border-t border-border/60">
                      <LogOut size={14} /> Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* ── Login button ── */
              <Link to="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Trial banner */}
      {onTrial && (
        <div className="fixed top-[53px] left-0 right-0 z-30 px-4 py-2 text-center text-xs font-semibold"
          style={{ background: 'linear-gradient(90deg,rgba(16,185,129,0.15),rgba(220,38,38,0.1))', borderBottom: '1px solid rgba(16,185,129,0.25)', color: '#34d399' }}>
          🎁 Free 30-minute trial active — {formatTrialTimeLeft(getTrialMinutesLeft(authUser))} left with full live match access.
          {' '}<Link to="/subscription" className="underline text-white">Upgrade to Pro</Link> before trial ends.
        </div>
      )}

      {/* Content */}
      <main className={`flex-1 w-full ${onTrial ? 'pt-[88px]' : 'pt-14'}`}>
        <Outlet context={{ isLoggedIn, user: authUser, onLoginSuccess: handleLoginSuccess, onLogout: handleLogout, mobileMenu, setMobileMenu }} />
      </main>
    </div>
  )
}
