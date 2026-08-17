import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getSignupStatus } from '../api'
import { resolveAllowSignups } from '../utils/publicAuth'

const TELEGRAM_HANDLE = 'cricedgeonline'
const TELEGRAM_URL = `https://t.me/${TELEGRAM_HANDLE}`

export default function LoginRequiredGate({
  title = 'Login required',
  description = 'Sign in to view live and upcoming match data.',
}) {
  const navigate = useNavigate()
  const [allowSignups, setAllowSignups] = useState(false)

  useEffect(() => {
    getSignupStatus()
      .then((res) => setAllowSignups(resolveAllowSignups(res)))
      .catch(() => setAllowSignups(false))
  }, [])

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div
        className="w-full max-w-sm text-center px-6 py-8"
        style={{ background: '#111111', border: '1px solid #2c2c2e', borderRadius: 20 }}
      >
        <div
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center"
          style={{ background: 'rgba(59,130,246,0.12)', borderRadius: 14 }}
        >
          <Lock size={22} className="text-[#3b82f6]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
        <p className="text-sm text-[#8e8e93] leading-relaxed mb-5">{description}</p>
        {allowSignups ? (
          <p className="text-sm text-[#8e8e93] mb-6">
            Create an account from the Sign Up tab, or log in if you already have one.
          </p>
        ) : (
          <p className="text-sm text-[#8e8e93] mb-6">
            For a new account, contact{' '}
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:underline"
              style={{ color: '#229ED9' }}
            >
              @{TELEGRAM_HANDLE}
            </a>
            {' '}on Telegram
          </p>
        )}
        {allowSignups ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open-login-modal'))}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white mb-3"
            style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}
          >
            Login
          </button>
        ) : (
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-2.5 rounded-xl text-sm font-semibold text-white mb-3"
            style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}
          >
            New Account
          </a>
        )}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-[#8e8e93] hover:text-white"
        >
          ← Back
        </button>
      </div>
    </div>
  )
}
