import { useState, useEffect, useRef } from 'react'
import { initiateTelegramSession, checkTelegramStatus } from '../api'

export default function TelegramGateModal({
  authUser,
  onVerified,
  onLogout,
  onOpenLogin,
  isLocked = false,
  lockReason = null,
}) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [verifiedSuccess, setVerifiedSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState(lockReason || null)
  const [isLeftGroup, setIsLeftGroup] = useState(
    lockReason?.includes('chhod') || lockReason?.includes('left') || false
  )
  const pollTimerRef = useRef(null)

  const isLinked = !!authUser?.telegramId

  // Initialize verification session
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      setLoading(true)

      // If user already has telegramId, check their membership first
      if (isLinked) {
        try {
          const res = await checkTelegramStatus()
          if (!cancelled && res.success) {
            if (res.isVerified && !res.leftGroup) {
              onVerified?.(res)
              setLoading(false)
              return
            }
            if (res.leftGroup) {
              setIsLeftGroup(true)
              setErrorMsg('Aapne Telegram channel chhod diya hai! Dobara @cricedge_online join karein.')
            }
          }
        } catch {
          // Continue to initiate session if needed
        }
      }

      // Initiate session for community verification
      try {
        const initRes = await initiateTelegramSession()
        if (!cancelled && initRes.success) {
          setSession(initRes)
          localStorage.setItem('telegram_verify_token', initRes.token)
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg('Telegram verification server se connect nahi ho paya. Please refresh karein.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [isLocked, isLinked])

  // Poll for live verification
  useEffect(() => {
    const token = session?.token || localStorage.getItem('telegram_verify_token')
    if (verifiedSuccess) return

    const poll = async () => {
      try {
        const res = await checkTelegramStatus(token)
        if (res.success) {
          if (res.isVerified && !res.leftGroup) {
            setVerifiedSuccess(true)
            setIsLeftGroup(false)
            setErrorMsg(null)
            clearInterval(pollTimerRef.current)
            setTimeout(() => {
              onVerified?.(res)
            }, 1000)
          } else if (res.leftGroup) {
            setIsLeftGroup(true)
            setErrorMsg('⚠️ Aapne @cricedge_online channel chhod diya hai! Dobara join karein.')
          }
        }
      } catch {
        // Silently ignore poll blips
      }
    }

    pollTimerRef.current = setInterval(poll, 2500)
    return () => clearInterval(pollTimerRef.current)
  }, [session, verifiedSuccess, onVerified])

  const handleManualCheck = async () => {
    const token = session?.token || localStorage.getItem('telegram_verify_token')
    setVerifying(true)
    setErrorMsg(null)
    try {
      const res = await checkTelegramStatus(token)
      if (res.isVerified && !res.leftGroup) {
        setVerifiedSuccess(true)
        setIsLeftGroup(false)
        setTimeout(() => {
          onVerified?.(res)
        }, 800)
      } else if (res.leftGroup) {
        setIsLeftGroup(true)
        setErrorMsg('❌ Aapne abhi channel join nahi kiya ya chhod diya hai. Pehle @cricedge_online join karein!')
      } else if (res.status === 'not_linked') {
        setErrorMsg('⏳ Bot me jaakar START tap karein taaki aapka access unlock ho sake.')
      } else {
        setErrorMsg('⏳ Verification pending! Bot me START tap karein.')
      }
    } catch {
      setErrorMsg('Status check karne me dikkat aayi. Please dobara try karein.')
    } finally {
      setVerifying(false)
    }
  }

  const groupUrl = session?.groupUrl || 'https://t.me/cricedge_online'
  const botUrl = session?.botUrl || `https://t.me/cricedge_verify_bot?start=${session?.token || ''}`

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 select-none backdrop-blur-md bg-black/85 transition-all duration-300"
      style={{ isolation: 'isolate' }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-b from-[#0b1329] via-[#090d1a] to-[#040711] p-6 text-center shadow-2xl shadow-sky-950/50">
        
        {/* Glow Header */}
        <div className="absolute -top-16 left-1/2 h-32 w-48 -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl pointer-events-none" />

        {/* Telegram Icon Badge */}
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-blue-500 text-white shadow-lg shadow-sky-500/30">
          <svg className="h-8 w-8 fill-current" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
          </svg>
        </div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
          {isLeftGroup ? 'Rejoin CricEdge Telegram Channel' : 'Join CricEdge Telegram Channel'}
        </h2>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest text-sky-400">
          {isLeftGroup ? 'Channel Membership Required' : 'To Use Website & Live Match Data'}
        </p>

        <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
          {isLeftGroup
            ? 'Aapne hamara official Telegram channel chhod diya hai. CricketEdge live data continue karne ke liye channel dobara join karein.'
            : 'CricketEdge ke live match odds, toss signals & smart predictions use karne ke liye hamara official Telegram channel join karein.'}
        </p>

        {/* Error / Warning Alert */}
        {errorMsg && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 flex items-center justify-center gap-1.5">
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Alert */}
        {verifiedSuccess && (
          <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2.5 text-sm font-bold text-emerald-300 flex items-center justify-center gap-2 animate-bounce">
            <span>✅ Verification Successful! Unlocking site...</span>
          </div>
        )}

        {/* Action Steps */}
        {!verifiedSuccess && (
          <div className="mt-4 space-y-2.5">
            {/* Step 1: Join Channel */}
            <a
              href={groupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full rounded-2xl bg-gradient-to-r from-[#0088cc] to-[#00a2ed] px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-sky-600/30 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-black">
                  1
                </span>
                <span>{isLeftGroup ? 'Rejoin Official Channel' : 'Join Official Channel'}</span>
              </div>
              <span className="text-xs font-mono font-bold bg-white/15 px-2 py-0.5 rounded-md">
                @cricedge_online ↗
              </span>
            </a>

            {/* Step 2: Verify via Bot */}
            <div className="space-y-1">
              <a
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full rounded-2xl border border-sky-500/40 bg-[#0f1a36] px-4 py-3 text-sm font-extrabold text-sky-200 hover:bg-[#14234b] active:scale-[0.98] transition-all shadow-md"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-xs font-black text-sky-400">
                    2
                  </span>
                  <span>Verify Membership (Open Bot & Tap Start)</span>
                </div>
                <span className="text-xs font-bold text-sky-400">
                  Verify ⚡
                </span>
              </a>
              <p className="text-[10px] text-slate-400 text-left px-1">
                🔒 100% Safe: Bot me sirf <b className="text-sky-300">"START"</b> tap karna hai membership confirm karne ke liye.
              </p>
            </div>

            {/* Live Polling Status Indicator */}
            <div className="flex items-center justify-center gap-2 pt-1 text-[11px] font-medium text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
              </span>
              <span>Waiting for you to tap START in @cricedge_verify_bot...</span>
            </div>

            {/* Manual Check Button */}
            <button
              onClick={handleManualCheck}
              disabled={verifying || loading}
              className="w-full mt-1 text-xs font-bold text-slate-400 hover:text-white py-1 transition-colors underline cursor-pointer disabled:opacity-50"
            >
              {verifying ? 'Checking membership status...' : 'Maine Channel Join Kar Liya — Check Now 🔄'}
            </button>
          </div>
        )}

        {/* Footer info & Logout / Switch Account */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="text-rose-400 hover:text-rose-300 font-semibold underline cursor-pointer"
            >
              Logout / Switch Account
            </button>
          )}

          {onOpenLogin && (
            <button
              type="button"
              onClick={onOpenLogin}
              className="text-sky-400 hover:text-sky-300 font-bold underline cursor-pointer ml-auto"
            >
              Admin Login 🔑
            </button>
          )}
        </div>

        <div className="mt-2 text-[10px] text-slate-500">
          Agar aap Telegram channel chhod denge, to website data automatically lock ho jayega.
        </div>
      </div>
    </div>
  )
}
