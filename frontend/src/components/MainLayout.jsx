import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom'
import { Activity, Menu, X, Shield, LogOut, User, ChevronDown } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { getAuthStatus, logout, getSignupStatus, getTelegramSettings, checkTelegramStatus } from '../api'
import { getPlanLabel, isActiveTrial, isPaidPro, getTrialMinutesLeft, formatTrialTimeLeft } from '../lib/subscriptionAccess'
import { guestPathAfterLogout, resolveSiteName, splitSiteName, resolveSiteMode, isFreeMode } from '../utils/publicAuth'
import LoginPage from '../pages/LoginPage'
import TelegramGateModal from './TelegramGateModal'

const NAV_ITEMS = [
  { path: '/cricket', label: 'Cricket', icon: '🏏' },
  { path: '/toss',    label: 'Toss',    icon: '🪙' },
]

export default function MainLayout() {
  const location = useLocation()
  const navigate  = useNavigate()
  const [mobileMenu, setMobileMenu] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authUser, setAuthUser]     = useState(null)
  const [authReady, setAuthReady]   = useState(false)
  const [loginOpen, setLoginOpen]   = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [dropdown, setDropdown]     = useState(false)
  const [siteName, setSiteName]     = useState('CricketEdge')
  const [siteMode, setSiteMode]     = useState('paid')
  const [telegramGateRequired, setTelegramGateRequired] = useState(false)
  const [telegramLockReason, setTelegramLockReason]     = useState(null)
  const [telegramGateEnabled, setTelegramGateEnabled]   = useState(true)
  const dropRef = useRef(null)

  useEffect(() => {
    try { localStorage.removeItem('live_desk_mode') } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    let lastRefreshAt = 0
    const AUTH_REFRESH_MIN_MS = 60 * 1000

    const refresh = (force = false) => {
      const now = Date.now()
      if (!force && now - lastRefreshAt < AUTH_REFRESH_MIN_MS) return
      lastRefreshAt = now

      const pendingToken = sessionStorage.getItem('pending_token')
      if (pendingToken) {
        localStorage.setItem('auth_token', pendingToken)
        sessionStorage.removeItem('pending_token')
      }
      getAuthStatus().then(data => {
        if (cancelled) return
        // softFail = timeout/network — keep current session, don't force logout
        if (data.softFail) {
          if (localStorage.getItem('auth_token')) setIsLoggedIn(true)
          return
        }
        setIsLoggedIn(data.isLoggedIn || false)
        setAuthUser(data.user || null)
      }).catch(() => {
        // Never wipe login on transient refresh errors
        if (!cancelled && localStorage.getItem('auth_token')) setIsLoggedIn(true)
      }).finally(() => {
        if (!cancelled) setAuthReady(true)
      })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh(false)
    }
    refresh(true)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    getSignupStatus()
      .then((res) => {
        const name = resolveSiteName(res)
        setSiteName(name)
        document.title = `${name} — Live Cricket Analytics`
        setSiteMode(resolveSiteMode(res))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const open = () => {
      sessionStorage.removeItem('open_login_modal')
      setLoginOpen(true)
    }
    window.addEventListener('open-login-modal', open)
    if (sessionStorage.getItem('open_login_modal')) {
      sessionStorage.removeItem('open_login_modal')
      setLoginOpen(true)
    }
    const err = new URLSearchParams(location.search).get('error')
    if (err === 'signups_disabled' || err === 'google_auth_failed') {
      setLoginOpen(true)
    }
    return () => window.removeEventListener('open-login-modal', open)
  }, [location.search])

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

  const isAdmin = authUser?.role === 'admin' || authUser?.role === 'superadmin'
  const isFree = isFreeMode(siteMode)
  const onTrial = isActiveTrial(authUser)
  const paidPro = isPaidPro(authUser)
  const planLabel = getPlanLabel(authUser)
  const initials = authUser?.name?.[0]?.toUpperCase() || '?'

  // Clear Telegram Gate immediately if visitor is NOT logged in, or if Admin
  useEffect(() => {
    if (!isLoggedIn || isAdmin) {
      setTelegramGateRequired(false)
      setTelegramLockReason(null)
    }
  }, [isLoggedIn, isAdmin])

  // ─── Telegram Membership Gate Check: ONLY for Logged-In Non-Admin Users ───
  useEffect(() => {
    let cancelled = false

    // If not logged in, or if admin: NEVER show popup on website open!
    if (!isLoggedIn || !authUser || isAdmin) {
      setTelegramGateRequired(false)
      setTelegramLockReason(null)
      return
    }

    getTelegramSettings().then(settings => {
      if (cancelled || !isLoggedIn || isAdmin) return
      const enabled = settings?.gateEnabled === true
      setTelegramGateEnabled(enabled)
      if (!enabled) {
        setTelegramGateRequired(false)
        setTelegramLockReason(null)
        return
      }

      // Check if user account has Telegram verified
      if (!authUser.telegramId) {
        setTelegramGateRequired(true)
        setTelegramLockReason('Website use karne ke liye please hamara official Telegram channel @cricedge_online join karein.')
        return
      }

      // If Telegram is verified, check live membership in @cricedge_online
      checkTelegramStatus().then(statusRes => {
        if (cancelled || !isLoggedIn || isAdmin) return
        if (!statusRes.isVerified || statusRes.leftGroup || !statusRes.isLinked) {
          setTelegramGateRequired(true)
          if (statusRes.leftGroup) {
            setTelegramLockReason('Aapne @cricedge_online Telegram channel chhod diya hai! Dobara join karein.')
          } else {
            setTelegramLockReason('Website use karne ke liye please hamara official Telegram channel @cricedge_online join karein.')
          }
        } else {
          setTelegramGateRequired(false)
          setTelegramLockReason(null)
        }
      }).catch(() => {})
    }).catch(() => {})

    const onGateReq = (e) => {
      if (!isLoggedIn || isAdmin || !telegramGateEnabled) return
      setTelegramGateRequired(true)
      if (e.detail?.code === 'LEFT_GROUP') {
        setTelegramLockReason('Aapne @cricedge_online Telegram channel chhod diya hai! Dobara join karein.')
      } else {
        setTelegramLockReason('Website use karne ke liye please hamara official Telegram channel @cricedge_online join karein.')
      }
    }
    window.addEventListener('telegram-gate-required', onGateReq)

    return () => {
      cancelled = true
      window.removeEventListener('telegram-gate-required', onGateReq)
    }
  }, [isLoggedIn, authUser, isAdmin, telegramGateEnabled])

  // Background Heartbeat: Check membership status every 25s (ONLY for logged-in regular users)
  useEffect(() => {
    if (!telegramGateEnabled || !isLoggedIn || !authUser || isAdmin) return
    const interval = setInterval(async () => {
      if (!isLoggedIn || isAdmin) return
      try {
        const res = await checkTelegramStatus()
        if (res.success) {
          if (!res.isVerified || res.leftGroup || !res.isLinked) {
            setTelegramGateRequired(true)
            if (res.leftGroup) {
              setTelegramLockReason('Aapne @cricedge_online Telegram channel chhod diya hai! Dobara join karein.')
            } else {
              setTelegramLockReason('Website use karne ke liye please hamara official Telegram channel @cricedge_online join karein.')
            }
          } else {
            setTelegramGateRequired(false)
            setTelegramLockReason(null)
          }
        }
      } catch {}
    }, 25000)

    return () => clearInterval(interval)
  }, [telegramGateEnabled, isLoggedIn, authUser, isAdmin])

  const handleTelegramVerified = (statusRes) => {
    setTelegramGateRequired(false)
    setTelegramLockReason(null)
    // Refresh user state so telegramId is stored in authUser
    getAuthStatus().then(data => {
      if (data.isLoggedIn && data.user) {
        setAuthUser(data.user)
      }
    }).catch(() => {})
    window.dispatchEvent(new CustomEvent('data-refreshed'))
  }

  const handleLoginSuccess = (email, user) => {
    setIsLoggedIn(true)
    setAuthUser(user || null)
    if (user?.role === 'admin' || user?.role === 'superadmin') {
      setTelegramGateRequired(false)
      setTelegramLockReason(null)
    } else if (!user?.telegramId) {
      setTelegramGateRequired(true)
      setTelegramLockReason('Website use karne ke liye please hamara official Telegram channel @cricedge_online join karein.')
    }
    setLoginOpen(false)
  }

  const handleLogout = async () => {
    await logout()
    setIsLoggedIn(false)
    setAuthUser(null)
    setDropdown(false)
    setLoginOpen(false)
    navigate(guestPathAfterLogout(location.pathname), { replace: true })
  }

  const isMatchDetail = /\/(cricket|tennis|toss)\/match\//.test(location.pathname)
  const isShellBypass =
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/profile') ||
    location.pathname.startsWith('/subscription')
  const isSportsPage =
    location.pathname.startsWith('/cricket') ||
    location.pathname.startsWith('/tennis') ||
    location.pathname.startsWith('/toss')
  const hideSportNav = false

  return (
    <div className="flex min-h-screen bg-[#000000]">
      {/* Top accent */}
      <div className="fixed top-0 left-0 right-0 h-1 z-50"
        style={{ background: 'linear-gradient(90deg,#dc2626,#10b981,#dc2626)' }} />

      {/* Header */}
      <header className="fixed top-1 left-0 right-0 z-40 border-b border-[#2c2c2e]"
        style={{ background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center h-12 sm:h-13 px-3 sm:px-4 gap-2 sm:gap-3">
          {/* Leagues drawer toggle — mobile only */}
          {!hideSportNav && (
            <button
              type="button"
              className="md:hidden text-text-muted hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
              onClick={() => setMobileMenu((m) => !m)}
              aria-label="Toggle leagues drawer"
              title="Toggle leagues"
            >
              {mobileMenu ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}

          {/* Logo */}
          <Link to="/" className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>
              <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
            </div>
            <span className="font-black text-sm sm:text-lg tracking-tight text-text-primary">
              {(() => {
                const { prefix, suffix } = splitSiteName(siteName)
                return suffix ? <>{prefix}<span className="text-primary">{suffix}</span></> : prefix
              })()}
            </span>
          </Link>

          {/* Nav */}
          {!hideSportNav && (
            <nav className="flex items-center gap-1.5 sm:gap-2 ml-1 sm:ml-2">
              {NAV_ITEMS.map(item => (
                <Link key={item.path} to={item.path}
                  onClick={() => {
                    if (item.path === '/toss') {
                      try { localStorage.setItem('toss_selected_comp', 'ALL') } catch (_) {}
                    }
                  }}
                  className={`flex-shrink-0 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-xs sm:text-[13px] font-semibold tracking-normal sm:tracking-wide transition-all flex items-center gap-1.5 ${
                    location.pathname.startsWith(item.path) ? 'text-white shadow-sm' : 'text-text-secondary hover:text-primary'
                  }`}
                  style={location.pathname.startsWith(item.path)
                    ? { background: 'linear-gradient(135deg,#dc2626,#10b981)' }
                    : { background: 'rgba(255,255,255,0.05)' }
                  }>
                  <span className="text-xs sm:text-sm">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          )}

          {/* Right side */}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-shrink-0">

            {/* Admin button — navbar me */}
            {isAdmin && (
              <Link to="/admin"
                className="hidden sm:flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold text-white flex-shrink-0"
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

            {/* Telegram Channel Button */}
            <a
              href="https://t.me/cricedge_online"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 h-7 sm:h-8 rounded-full text-[11px] sm:text-xs font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #0088cc, #24A1DE)',
                boxShadow: '0 2px 8px rgba(0, 136, 204, 0.3)',
              }}
              title="Join our official Telegram Channel @cricedge_online"
            >
              <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
              </svg>
              <span className="hidden sm:inline">Join Telegram</span>
              <span className="sm:hidden">Telegram</span>
            </a>

            {authReady && isLoggedIn && authUser ? (
              /* ── Profile dropdown ── */
              <div className="relative" ref={dropRef}>
                <button onClick={() => setDropdown(d => !d)}
                  className="flex items-center gap-1 sm:gap-1.5 p-1 sm:px-2 sm:py-1 rounded-full transition-all"
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
                          isFree
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : onTrial
                              ? 'bg-emerald-100 text-emerald-700'
                              : paidPro
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-500'
                        }`}>
                          {isFree ? 'Free Access' : planLabel}
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
                      {isFree ? 'Free Access Active' : paidPro ? 'Manage Subscription' : onTrial ? 'Upgrade Before Trial Ends' : 'Upgrade to Pro'}
                    </Link>

                    {/* Logout */}
                    <button onClick={handleLogout}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-loss hover:bg-[#1a1a1a] transition-colors border-t border-border/60">
                      <LogOut size={14} /> Logout
                    </button>
                  </div>
                )}
              </div>
            ) : authReady ? (
              /* ── Login button ── */
              <button type="button" onClick={() => setLoginOpen(true)}
                className="flex items-center gap-1 px-2.5 h-7 sm:px-3 sm:h-8 rounded-full text-[11px] sm:text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>
                Login
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* Trial banner */}
      {onTrial && !isFree && (
        <div className="fixed top-[49px] sm:top-[53px] left-0 right-0 z-30 px-4 py-1.5 sm:py-2 text-center text-[11px] sm:text-xs font-semibold"
          style={{ background: 'linear-gradient(90deg,rgba(16,185,129,0.15),rgba(220,38,38,0.1))', borderBottom: '1px solid rgba(16,185,129,0.25)', color: '#34d399' }}>
          🎁 Free trial active — {formatTrialTimeLeft(getTrialMinutesLeft(authUser))} left with full live match access.
          {' '}<Link to="/subscription" className="underline text-white">Upgrade to Pro</Link> before trial ends.
        </div>
      )}

      {/* Content */}
      <main className={`flex-1 w-full ${(onTrial && !isFree) ? 'pt-[80px] sm:pt-[88px]' : 'pt-12 sm:pt-14'}`}>
        <Outlet context={{ isLoggedIn, user: authUser, authReady, siteMode, isFreeMode: isFree, onLoginSuccess: handleLoginSuccess, onLogout: handleLogout, mobileMenu, setMobileMenu }} />
      </main>

      {/* Compulsory Telegram Gate Modal: ONLY for logged-in non-admin users */}
      {telegramGateRequired && telegramGateEnabled && isLoggedIn && !isAdmin && (
        <TelegramGateModal
          authUser={authUser}
          onVerified={handleTelegramVerified}
          onLogout={handleLogout}
          onOpenLogin={() => setLoginOpen(true)}
          isLocked={telegramGateRequired}
          lockReason={telegramLockReason}
        />
      )}

      {loginOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={() => setLoginOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Login"
        >
          <div className="relative w-full max-w-[360px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <LoginPage
              isModal
              siteName={siteName}
              onLoginSuccess={handleLoginSuccess}
              onClose={() => setLoginOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
