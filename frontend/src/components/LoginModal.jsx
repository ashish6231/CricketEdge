import { useState } from 'react'
import { Lock, LoaderCircle, AlertTriangle, Mail, Eye, EyeOff, LogOut } from 'lucide-react'
import { login, logout } from '../api'

export default function LoginModal({ isOpen, onClose, onLoginSuccess, onLogoutSuccess, isLoggedIn, email }) {
  const [inputEmail, setInputEmail] = useState('')
  const [inputPassword, setInputPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  if (!isOpen) return null

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const result = await login(inputEmail, inputPassword)
      console.log('[Login] success:', result)
      setSuccess(result.message || '✅ Login successful!')
      if (onLoginSuccess) onLoginSuccess(result.user?.email || inputEmail)
      setTimeout(() => {
        onClose()
        setSuccess('')
      }, 1500)
    } catch (err) {
      console.error('[Login] error:', err)
      if (err.status === 429) {
        setError(err.detail || '⏳ Daily login limit exceeded — kal try karo')
      } else {
        setError(err.detail || 'Login failed. Check your credentials.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
      setSuccess('Logged out successfully')
      if (onLogoutSuccess) onLogoutSuccess()
      setTimeout(() => {
        onClose()
        setSuccess('')
      }, 1000)
    } catch (err) {
      setError('Logout failed')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(253,232,232,0.7)' }} onClick={onClose}>
      <div className="rounded-2xl p-6 max-w-sm w-full mx-4" style={{ background: '#fff', border: '1px solid #fcd5cc', boxShadow: '0 8px 32px rgba(229,62,62,0.12)' }} onClick={e => e.stopPropagation()}>
        
        {isLoggedIn ? (
          // ──── LOGGED IN VIEW ────
          <div>
            <div className="text-center mb-4">
              <div className="p-3 rounded-xl mb-3 inline-block" style={{ background: 'rgba(47,133,90,0.1)', border: '1px solid rgba(47,133,90,0.25)' }}>
                <Lock className="h-6 w-6" style={{ color: '#2f855a' }} />
              </div>
              <h2 className="text-lg font-bold" style={{ color: '#2f855a' }}>✅ Logged In</h2>
              <p className="text-sm text-text-secondary mt-1">{email}</p>
              <p className="text-xs text-text-muted mt-2">Live matches ka data ab accessible hai!</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium transition-colors text-xs mt-2"
              style={{ background: 'rgba(229,62,62,0.06)', border: '1px solid rgba(229,62,62,0.2)', color: '#9a8a88' }}
            >
              <LogOut size={14} /> Logout (daily limit hai — soch ke karo)
            </button>
          </div>
        ) : (
          // ──── LOGIN FORM ────
          <div>
            <div className="text-center mb-4">
              <div className="p-3 rounded-xl mb-3 inline-block" style={{ background: 'rgba(229,62,62,0.1)', border: '1px solid rgba(229,62,62,0.2)' }}>
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-text-primary">Login</h2>
              <p className="text-xs text-text-muted mt-1">Apna CricketEdge account login karo</p>
            </div>

            {error && (
              <div className="rounded-lg px-3 py-2 mb-3 flex items-center gap-2" style={{ background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.25)' }}>
                <AlertTriangle className="h-4 w-4 text-primary" />
                <span className="text-xs text-primary">{error}</span>
              </div>
            )}

            {success && (
              <div className="rounded-lg px-3 py-2 mb-3 text-xs text-center" style={{ background: 'rgba(47,133,90,0.08)', border: '1px solid rgba(47,133,90,0.2)', color: '#2f855a' }}>
                {success}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                  <input
                    type="email"
                    value={inputEmail}
                    onChange={e => setInputEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    disabled={loading}
                    className="w-full rounded-lg pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none"
                    style={{ background: '#fff8f8', border: '1px solid #fcd5cc' }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={inputPassword}
                    onChange={e => setInputPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    className="w-full rounded-lg pl-4 pr-10 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none"
                    style={{ background: '#fff8f8', border: '1px solid #fcd5cc' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                style={{ background: loading ? '#fca5a5' : 'linear-gradient(135deg, #e53e3e, #fc8181)' }}
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Lock size={16} />}
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            <div className="mt-4 rounded-lg p-3 text-center" style={{ background: '#fff8f8', border: '1px solid #fcd5cc' }}>
              <p className="text-xs text-text-muted">Account nahi hai? Telegram:</p>
              <a href="https://t.me/CricketMan2026" target="_blank" className="text-xs font-medium hover:underline" style={{ color: '#229ED9' }}>@CricketMan2026</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
