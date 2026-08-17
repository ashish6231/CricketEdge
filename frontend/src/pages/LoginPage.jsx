import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Lock, Mail, Eye, EyeOff, User, LoaderCircle, AlertTriangle, X } from 'lucide-react'
import { login, register, getSignupStatus } from '../api'
import { resolveAllowSignups, shouldNavigateAfterAuth, resolveSiteName, splitSiteName } from '../utils/publicAuth'

const TELEGRAM_URL = 'https://t.me/cricedgeonline'

export default function LoginPage({ onLoginSuccess, isModal = false, onClose, siteName: siteNameProp }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [allowSignups, setAllowSignups] = useState(false)
  const [siteName, setSiteName] = useState(siteNameProp || 'CricketEdge')

  const sessionReplaced = new URLSearchParams(window.location.search).get('reason') === 'session_replaced'
  const signupsDisabledRedirect = new URLSearchParams(window.location.search).get('error') === 'signups_disabled'

  const reset = () => { setError(''); setSuccess(''); setName(''); setEmail(''); setPassword('') }

  const switchTab = (t) => {
    setTab(t)
    reset()
  }

  useEffect(() => {
    if (siteNameProp) setSiteName(siteNameProp)
  }, [siteNameProp])

  useEffect(() => {
    getSignupStatus()
      .then((res) => {
        setAllowSignups(resolveAllowSignups(res))
        setSiteName(resolveSiteName(res, siteNameProp || 'CricketEdge'))
      })
      .catch(() => setAllowSignups(false))
  }, [siteNameProp])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      let res
      if (tab === 'login') {
        res = await login(email, password)
      } else {
        if (!allowSignups) {
          setError('New signups are currently disabled')
          setLoading(false)
          return
        }
        if (!name.trim()) { setError('Name required'); setLoading(false); return }
        res = await register(name.trim(), email, password)
      }
      setSuccess(tab === 'login' ? (res.message ? `✅ ${res.message}` : '✅ Login successful!') : (res.message ? `✅ ${res.message}` : '✅ Account created!'))
      if (onLoginSuccess) onLoginSuccess(res.user?.email, res.user)
      if (shouldNavigateAfterAuth(isModal)) {
        setTimeout(() => navigate('/cricket', { replace: true }), 800)
      }
    } catch (err) {
      setError(err.detail || (tab === 'login' ? 'Login failed. Check credentials.' : 'Registration failed.'))
    } finally {
      setLoading(false)
    }
  }

  const shellClass = isModal
    ? 'relative flex flex-col items-center px-4 py-6 rounded-2xl'
    : 'min-h-screen flex flex-col items-center justify-center px-4'

  return (
    <div className={shellClass} style={{ background: '#0a0a0a', ...(isModal ? { border: '1px solid #2c2c2e' } : {}) }}>
      
      {!isModal && (
        <div className="fixed top-0 left-0 right-0 h-[2px]" style={{ background: '#10b981' }} />
      )}

      <div className="w-full max-w-[320px] relative">
        {isModal && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close login"
            className="absolute -top-1 right-0 z-10 p-1.5 rounded-lg text-[#8e8e93] hover:text-white hover:bg-[#1c1c1e]"
          >
            <X size={16} />
          </button>
        )}
        
        {/* Simple VPN Banner */}
        <div className="w-full mb-6 bg-yellow-500/10 border border-yellow-500/20 py-2 rounded-lg text-center">
          <span className="text-[11px] font-bold text-yellow-500 uppercase tracking-widest">
            Use VPN To Use This Website
          </span>
        </div>

        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
            style={{ background: 'linear-gradient(135deg, #16a34a, #10b981)' }}>
            <Activity className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {(() => {
              const { prefix, suffix } = splitSiteName(siteName)
              return suffix ? <>{prefix}<span className="text-[#10b981]">{suffix}</span></> : prefix
            })()}
          </h1>
        </div>

        {/* Card */}
        <div className="rounded-xl p-5" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
          
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-lg mb-4 bg-[#0a0a0a] border border-[#2c2c2e]">
            {['login', 'signup'].map(t => (
              <button key={t} onClick={() => switchTab(t)}
                className="flex-1 py-1.5 rounded-md text-[13px] font-semibold transition-colors capitalize"
                style={tab === t
                  ? { background: '#1c1c1e', color: '#fff', border: '1px solid #2c2c2e' }
                  : { color: '#8e8e93' }
                }>
                {t === 'login' ? 'Login' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Alerts */}
          {sessionReplaced && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-4 text-[11px] text-orange-400 bg-orange-500/10 border border-orange-500/20">
              <AlertTriangle size={14} className="flex-shrink-0" /> Aapka session hat gaya.
            </div>
          )}
          {signupsDisabledRedirect && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-4 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20">
              <AlertTriangle size={14} className="flex-shrink-0" /> New signups are currently disabled
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-4 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20">
              <AlertTriangle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg px-3 py-2 mb-4 text-[11px] text-center text-green-400 bg-green-500/10 border border-green-500/20">
              {success}
            </div>
          )}

          {tab === 'signup' && !allowSignups ? (
            <div className="text-center py-2">
              <p className="text-[13px] text-[#8e8e93] mb-1">Signups are currently closed.</p>
              <p className="text-[12px] text-[#8e8e93] mb-4">
                Contact{' '}
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold hover:underline"
                  style={{ color: '#229ED9' }}
                >
                  @cricedgeonline
                </a>
                {' '}on Telegram for a new account.
              </p>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2 rounded-lg text-[13px] font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}
              >
                New Account
              </a>
              <p className="text-center text-[12px] text-[#8e8e93] mt-4">
                Already have an account?{' '}
                <button type="button" onClick={() => switchTab('login')} className="text-[#10b981] font-semibold hover:underline">
                  Sign In
                </button>
              </p>
            </div>
          ) : (
            <>
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Name — signup only */}
            {tab === 'signup' && (
              <div>
                <label className="text-[11px] text-[#8e8e93] block mb-1 font-medium">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#636366]" />
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="Rahul Sharma" required disabled={loading}
                    className="w-full rounded-lg pl-9 pr-3 py-2 text-[13px] outline-none text-white placeholder-[#636366] bg-[#0a0a0a] focus:border-[#10b981]"
                    style={{ border: '1px solid #2c2c2e' }} />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="text-[11px] text-[#8e8e93] block mb-1 font-medium">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#636366]" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com" required disabled={loading}
                  className="w-full rounded-lg pl-9 pr-3 py-2 text-[13px] outline-none text-white placeholder-[#636366] bg-[#0a0a0a] focus:border-[#10b981]"
                  style={{ border: '1px solid #2c2c2e' }} />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-[11px] text-[#8e8e93] block mb-1 font-medium">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#636366]" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required disabled={loading} minLength={6}
                  className="w-full rounded-lg pl-9 pr-9 py-2 text-[13px] outline-none text-white placeholder-[#636366] bg-[#0a0a0a] focus:border-[#10b981]"
                  style={{ border: '1px solid #2c2c2e' }} />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8e8e93] hover:text-white">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-[13px] text-white disabled:opacity-70 mt-4 bg-[#10b981] hover:bg-[#059669] transition-colors">
              {loading
                ? <><LoaderCircle size={14} className="animate-spin" /> {tab === 'login' ? 'Wait...' : 'Creating...'}</>
                : <>{tab === 'login' ? 'Sign In' : 'Sign Up'}</>
              }
            </button>
          </form>

          {tab === 'login' && (
            <p className="text-center text-[12px] text-[#8e8e93] mt-4">
              Don't have an account?{' '}
              <button type="button" onClick={() => switchTab('signup')} className="text-[#10b981] font-semibold hover:underline">
                Sign Up
              </button>
            </p>
          )}
          {tab === 'signup' && (
            <p className="text-center text-[12px] text-[#8e8e93] mt-4">
              Already have an account?{' '}
              <button type="button" onClick={() => switchTab('login')} className="text-[#10b981] font-semibold hover:underline">
                Sign In
              </button>
            </p>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
