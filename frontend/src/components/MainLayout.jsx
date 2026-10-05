import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom'
import { Activity, Menu, X, Shield, LogOut, User, ChevronDown, BarChart3, Coins, Crown } from 'lucide-react'
import { Suspense, useState, useEffect, useRef } from 'react'
import { getAuthStatus, logout, getSignupStatus, getTelegramSettings, checkTelegramStatus } from '../api'
import { getPlanLabel, isActiveTrial, isPaidPro, getTrialMinutesLeft, formatTrialTimeLeft } from '../lib/subscriptionAccess'
import { guestPathAfterLogout, resolveSiteName, splitSiteName, resolveSiteMode, isFreeMode } from '../utils/publicAuth'
import LoginPage from '../pages/LoginPage'
import TelegramGateModal from './TelegramGateModal'
import PageLoading from './PageLoading'
import { getSocket, updateSocketAuth } from '../socket'

const NAV_ITEMS = [
  { path: '/cricket', label: 'Cricket', icon: Activity },
  { path: '/toss', label: 'Toss', icon: Coins },
  { path: '/session', label: 'Session', icon: BarChart3 },
]

export default function MainLayout() {
  const location = useLocation()
  const navigate  = useNavigate()
  const [mobileMenu, setMobileMenu] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('auth_token'))
  const [authUser, setAuthUser]     = useState(null)
  const [authReady, setAuthReady]   = useState(() => !localStorage.getItem('auth_token'))
  const [loginOpen, setLoginOpen]   = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [dropdown, setDropdown]     = useState(false)
  const [trialBannerHeight, setTrialBannerHeight] = useState(44)
  const [siteName, setSiteName]     = useState('CricEdge')
  const [siteMode, setSiteMode]     = useState('paid')
  const [telegramGateRequired, setTelegramGateRequired] = useState(false)
  const [telegramLockReason, setTelegramLockReason]     = useState(null)
  const [telegramGateEnabled, setTelegramGateEnabled]   = useState(true)
  const dropRef = useRef(null)
  const trialBannerRef = useRef(null)

  useEffect(() => {
    try { localStorage.removeItem('live_desk_mode') } catch { /* ignore */ }
    // Ping server on app load to wake Render from cold start
    // Non-blocking — just fires and forgets
    fetch((import.meta.env?.VITE_API_URL || '') + '/api/health').catch(() => {})
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

      // On slow networks: if token exists, mark authReady immediately with optimistic login
      // so the page renders without waiting for the server round-trip
      const hasToken = !!localStorage.getItem('auth_token')
      if (hasToken && force) {
        setIsLoggedIn(true)
        // authReady stays false until server confirms — but we show content optimistically
      }

      getAuthStatus().then(data => {
        if (cancelled) return
        if (data.softFail) {
          if (localStorage.getItem('auth_token')) setIsLoggedIn(true)
          setAuthReady(true)
          return
        }
        setAuthUser(data.user || null)
        setIsLoggedIn(data.isLoggedIn || false)
        setAuthReady(true)
      }).catch(() => {
        if (!cancelled) {
          if (localStorage.getItem('auth_token')) setIsLoggedIn(true)
          setAuthReady(true)
        }
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
    // Use sessionStorage cache to avoid re-fetching on every navigation
    const cached = sessionStorage.getItem('_site_meta')
    if (cached) {
      try {
        const { name, mode } = JSON.parse(cached)
        setSiteName(name)
        document.title = `${name} — Live Cricket Scores, Analytics & Toss Prediction`
        setSiteMode(mode)
      } catch { /* ignore bad cache */ }
    }
    getSignupStatus()
      .then((res) => {
        const name = resolveSiteName(res)
        const mode = resolveSiteMode(res)
        setSiteName(name)
        document.title = `${name} — Live Cricket Scores, Analytics & Toss Prediction`
        setSiteMode(mode)
        try { sessionStorage.setItem('_site_meta', JSON.stringify({ name, mode })) } catch { /* ignore */ }
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

  // Real-time session replacement: when 2nd device logs in, instantly log out on this device!
  useEffect(() => {
    const socket = getSocket()
    const onSessionReplaced = (data) => {
      localStorage.removeItem('auth_token')
      updateSocketAuth(null)
      setIsLoggedIn(false)
      setAuthUser(null)
      sessionStorage.setItem('session_replaced_msg', data?.message || 'Aapka account kisi doosre device par login ho gaya hai. Please dubara login karein.')
      navigate('/', { replace: true })
      setLoginOpen(true)
    }
    socket.on('session:replaced', onSessionReplaced)

    const onCustomSessionReplaced = (e) => {
      updateSocketAuth(null)
      setIsLoggedIn(false)
      setAuthUser(null)
      sessionStorage.setItem('session_replaced_msg', e?.detail?.message || 'Aapka account kisi doosre device par login ho gaya hai. Please dubara login karein.')
      setLoginOpen(true)
    }
    window.addEventListener('session-replaced', onCustomSessionReplaced)

    return () => {
      socket.off('session:replaced', onSessionReplaced)
      window.removeEventListener('session-replaced', onCustomSessionReplaced)
    }
  }, [navigate])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropdown(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { setMobileMenu(false); setDropdown(false) }, [location.pathname])

  useEffect(() => {
    if (!loginOpen) return
    const previousFocus = document.activeElement
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = document.getElementById('site-login-dialog')
    dialog?.querySelector('button, input')?.focus()
    const onKey = event => {
      if (event.key === 'Escape') setLoginOpen(false)
      if (event.key !== 'Tab') return
      const controls = [...(dialog?.querySelectorAll('button, input, a[href]') || [])].filter(element => !element.disabled && element.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = originalOverflow; document.removeEventListener('keydown', onKey); previousFocus?.focus() }
  }, [loginOpen])

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') { setDropdown(false); setMobileMenu(false) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!mobileMenu || window.innerWidth >= 768) return
    const previousFocus = document.activeElement
    const drawer = document.querySelector('[data-league-drawer]')
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => drawer?.querySelector('button, input')?.focus(), 100)
    const onKey = event => {
      if (event.key !== 'Tab') return
      const controls = [...(drawer?.querySelectorAll('button, input') || [])].filter(element => !element.disabled && element.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); document.body.style.overflow = originalOverflow; previousFocus?.focus() }
  }, [mobileMenu])

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

  // Background Heartbeat: Check membership status every 60s (ONLY for logged-in regular users)
  useEffect(() => {
    if (!telegramGateEnabled || !isLoggedIn || !authUser || isAdmin) return
    const interval = setInterval(async () => {
      if (!isLoggedIn || isAdmin) return
      try {
        const res = await checkTelegramStatus()
        if (res.success) {
          if (!res.isVerified || res.leftGroup || !res.isLinked) {
            setTelegramGateRequired(true)
            setTelegramLockReason(res.leftGroup
              ? 'Aapne @cricedge_online Telegram channel chhod diya hai! Dobara join karein.'
              : 'Website use karne ke liye please hamara official Telegram channel @cricedge_online join karein.')
          } else {
            setTelegramGateRequired(false)
            setTelegramLockReason(null)
          }
        }
      } catch {}
    }, 60000)
    return () => clearInterval(interval)
  }, [telegramGateEnabled, isLoggedIn, authUser, isAdmin])

  const handleTelegramVerified = () => {
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
    updateSocketAuth(localStorage.getItem('auth_token'))
    if (user?.role === 'admin' || user?.role === 'superadmin') {
      setTelegramGateRequired(false)
      setTelegramLockReason(null)
    } else if (!user?.telegramId) {
      setTelegramGateRequired(true)
      setTelegramLockReason('Website use karne ke liye please hamara official Telegram channel @cricedge_online join karein.')
    }
    setLoginOpen(false)
    navigate('/cricket', { replace: true })
  }

  const handleLogout = () => {
    // Update UI instantly, fire API in background
    localStorage.removeItem('auth_token')
    updateSocketAuth(null)
    setIsLoggedIn(false)
    setAuthUser(null)
    setAuthReady(true)
    setDropdown(false)
    setLoginOpen(false)
    navigate(guestPathAfterLogout(location.pathname), { replace: true })
    logout().catch(() => {})
  }

  const isSportsPage =
    location.pathname.startsWith('/cricket') ||
    location.pathname.startsWith('/session') ||
    location.pathname.startsWith('/toss')

  useEffect(() => {
    if (!onTrial || isFree || !trialBannerRef.current) return
    const observer = new ResizeObserver(([entry]) => setTrialBannerHeight(entry.target.offsetHeight))
    observer.observe(trialBannerRef.current)
    return () => observer.disconnect()
  }, [onTrial, isFree])

  return (
    <div className={`app-shell flex min-h-screen ${onTrial && !isFree ? 'has-trial-banner' : ''}`} style={{ '--trial-banner-height': `${trialBannerHeight}px` }}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      {/* Top accent */}

      {/* Header */}
      <header className="site-header">
        <div className="site-header-inner">
          {/* Leagues drawer toggle — mobile only */}
          {isSportsPage && (
            <button
              type="button"
              className="md:hidden text-text-muted hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
              onClick={() => setMobileMenu((m) => !m)}
              aria-label="Toggle leagues drawer"
              aria-expanded={mobileMenu}
              title="Toggle leagues"
            >
              {mobileMenu ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}

          {/* Logo */}
          <Link to="/" className="site-brand">
            <img src="/favicon-48x48.png" alt="CricEdge" className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-contain border border-white/10 shadow-sm" />
            <span className="site-brand-name">
              {(() => {
                const { prefix, suffix } = splitSiteName(siteName)
                return suffix ? <>{prefix}<span className="text-primary">{suffix}</span></> : prefix
              })()}
            </span>
          </Link>

          {/* Nav */}
          {(
            <nav className="site-nav" aria-label="Main navigation">
              {NAV_ITEMS.map(item => { const Icon = item.icon; return (
                <Link key={item.path} to={item.path}
                  onClick={() => {
                    if (item.path === '/toss') {
                      try { localStorage.setItem('toss_selected_comp', 'ALL') } catch {}
                    }
                  }}
                  className={location.pathname.startsWith(item.path) ? 'is-active' : ''}
                  aria-current={location.pathname.startsWith(item.path) ? 'page' : undefined}>
                  <Icon size={17} />
                  <span>{item.label}</span>
                </Link>
              )})}
            </nav>
          )}

          {/* Right side */}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-shrink-0">

            {/* Admin button — navbar me */}
            {isAdmin && (
              <Link to="/admin"
                className="site-admin-link hidden sm:flex">
                <Shield size={12} /> Admin
              </Link>
            )}
            {/* Live clock */}
            {lastUpdated && (
              <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(37,99,235,0.12)', color: '#93c5fd' }}>
                <span className="pulse-dot h-1.5 w-1.5 rounded-full" style={{ background: '#60a5fa' }} />
                {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            )}


            {isLoggedIn && authUser ? (
              /* ── Profile dropdown ── */
              <div className="relative" ref={dropRef}>
                <button onClick={() => setDropdown(d => !d)} aria-expanded={dropdown} aria-controls="site-account-menu" aria-label="Account menu"
                  className="site-account-trigger">
                  {/* Avatar circle */}
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black"
                    style={{ background: '#2563eb' }}>
                    {initials}
                  </div>
                  <span className="hidden sm:block text-xs font-semibold text-text-primary max-w-24 truncate">
                    {authUser.name}
                  </span>
                  <ChevronDown size={12} className="text-text-muted" />
                </button>

                {dropdown && (
                  <div id="site-account-menu" className="site-account-menu">
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
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'
                            : onTrial
                              ? 'bg-violet-100 text-violet-700'
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
                      <Crown size={14} className="text-primary" />
                      {isFree ? 'Free Access Active' : paidPro ? 'Manage Subscription' : onTrial ? 'Upgrade Before Trial Ends' : 'Upgrade to Pro'}
                    </Link>

                    {isAdmin && <Link to="/admin" onClick={() => setDropdown(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-secondary"><Shield size={14} /> Admin workspace</Link>}

                    {/* Logout */}
                    <button onClick={handleLogout}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-loss hover:bg-[#1a1a1a] transition-colors border-t border-border/60">
                      <LogOut size={14} /> Logout
                    </button>
                  </div>
                )}
              </div>
            ) : isLoggedIn && !authUser ? (
              /* ── Token exists but authUser not yet loaded — show avatar skeleton ── */
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full animate-pulse bg-[#1e2538]" />
            ) : (
              /* ── Not logged in — show login button immediately ── */
              <button type="button" onClick={() => setLoginOpen(true)}
                className="ui-button ui-button-primary site-login-button">
                <User size={15} /><span>Sign in</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Trial banner */}
      {onTrial && !isFree && (
        <div ref={trialBannerRef} className="site-trial-banner">
          🎁 Free trial active — {formatTrialTimeLeft(getTrialMinutesLeft(authUser))} left with full live match access.
          {' '}<Link to="/subscription" className="underline text-white">Upgrade to Pro</Link> before trial ends.
        </div>
      )}

      {/* Content */}
      <main id="main-content" tabIndex={-1} className="site-main flex-1 w-full">
        <Suspense fallback={<PageLoading />}>
          <Outlet context={{ isLoggedIn, user: authUser, authReady, siteMode, isFreeMode: isFree, onLoginSuccess: handleLoginSuccess, onLogout: handleLogout, mobileMenu, setMobileMenu }} />
        </Suspense>
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
          id="site-login-dialog"
          className="site-dialog-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={() => setLoginOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Login"
        >
          <div className="relative w-full max-w-[440px] max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
