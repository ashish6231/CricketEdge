import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Lock, Mail, Eye, EyeOff, User, LoaderCircle, AlertTriangle } from 'lucide-react'
import { login, register } from '../api'

export default function LoginPage({ onLoginSuccess }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const sessionReplaced = new URLSearchParams(window.location.search).get('reason') === 'session_replaced'

  const reset = () => { setError(''); setSuccess(''); setName(''); setEmail(''); setPassword('') }

  const switchTab = (t) => { setTab(t); reset() }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      let res
      if (tab === 'login') {
        res = await login(email, password)
      } else {
        if (!name.trim()) { setError('Name required'); setLoading(false); return }
        res = await register(name.trim(), email, password)
      }
      setSuccess(tab === 'login' ? '✅ Login successful!' : '✅ Account created!')
      if (onLoginSuccess) onLoginSuccess(res.user?.email, res.user)
      setTimeout(() => navigate('/cricket', { replace: true }), 800)
    } catch (err) {
      setError(err.detail || (tab === 'login' ? 'Login failed. Check credentials.' : 'Registration failed.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#fef2f2' }}>
      {/* Top accent */}
      <div className="fixed top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg,#dc2626,#f97316,#dc2626)' }} />

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
            style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}>
            <Activity className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">
            Cricket<span className="text-primary">Edge</span>
          </h1>
          <p className="text-xs text-text-muted mt-1">Live cricket analytics platform</p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-6">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'rgba(220,38,38,0.06)' }}>
            {['login', 'signup'].map(t => (
              <button key={t} onClick={() => switchTab(t)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize"
                style={tab === t
                  ? { background: 'linear-gradient(135deg,#dc2626,#f97316)', color: '#fff', boxShadow: '0 2px 8px rgba(220,38,38,0.25)' }
                  : { color: '#6b7280' }
                }>
                {t === 'login' ? 'Login' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Alerts */}
          {sessionReplaced && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-4 text-xs text-orange-700"
              style={{ background: 'rgba(234,88,12,0.08)', border: '1px solid #fed7aa' }}>
              <AlertTriangle size={13} className="flex-shrink-0" /> Aapka session kisi aur device pe login hone se hat gaya.
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-4 text-xs text-primary"
              style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid #fecaca' }}>
              <AlertTriangle size={13} className="flex-shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl px-3 py-2 mb-4 text-xs text-center text-green-700"
              style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Name — signup only */}
            {tab === 'signup' && (
              <div>
                <label className="text-xs text-text-muted block mb-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="Rahul Sharma" required disabled={loading}
                    className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none"
                    style={{ background: '#fff8f8', border: '1px solid #fecaca' }} />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="text-xs text-text-muted block mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com" required disabled={loading}
                  className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none"
                  style={{ background: '#fff8f8', border: '1px solid #fecaca' }} />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs text-text-muted block mb-1">Password</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required disabled={loading} minLength={6}
                  className="w-full rounded-xl pl-4 pr-10 py-2.5 text-sm outline-none"
                  style={{ background: '#fff8f8', border: '1px solid #fecaca' }} />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {tab === 'signup' && <p className="text-xs text-text-muted mt-1">Minimum 6 characters</p>}
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-60 mt-1"
              style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}>
              {loading
                ? <><LoaderCircle size={15} className="animate-spin" /> {tab === 'login' ? 'Logging in…' : 'Creating account…'}</>
                : <><Lock size={14} /> {tab === 'login' ? 'Login' : 'Create Account'}</>
              }
            </button>
          </form>

          {tab === 'login' && (
            <p className="text-center text-xs text-text-muted mt-4">
              Account nahi hai?{' '}
              <button onClick={() => switchTab('signup')} className="text-primary font-semibold hover:underline">
                Sign up karo
              </button>
            </p>
          )}
          {tab === 'signup' && (
            <p className="text-center text-xs text-text-muted mt-4">
              Already have an account?{' '}
              <button onClick={() => switchTab('login')} className="text-primary font-semibold hover:underline">
                Login karo
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
