import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

let toastSeq = 0

const TONE = {
  success: {
    border: 'rgba(16,185,129,0.45)',
    bg: 'rgba(16,185,129,0.12)',
    icon: '#34d399',
    Icon: CheckCircle,
  },
  error: {
    border: 'rgba(239,68,68,0.45)',
    bg: 'rgba(239,68,68,0.12)',
    icon: '#f87171',
    Icon: AlertTriangle,
  },
  info: {
    border: 'rgba(59,130,246,0.45)',
    bg: 'rgba(59,130,246,0.12)',
    icon: '#60a5fa',
    Icon: Info,
  },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((type, message, duration = 4000) => {
    const text = String(message || '').trim()
    if (!text) return
    const id = ++toastSeq
    setToasts((list) => [...list, { id, type, message: text }])
    if (duration > 0) {
      window.setTimeout(() => dismiss(id), duration)
    }
  }, [dismiss])

  const api = useMemo(() => ({
    success: (message, duration) => push('success', message, duration),
    error: (message, duration) => push('error', message, duration),
    info: (message, duration) => push('info', message, duration),
    dismiss,
  }), [push, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => {
          const tone = TONE[t.type] || TONE.info
          const Icon = tone.Icon
          return (
            <div
              key={t.id}
              className="toast-item"
              style={{ background: tone.bg, border: `1px solid ${tone.border}` }}
            >
              <Icon size={16} className="flex-shrink-0 mt-0.5" style={{ color: tone.icon }} />
              <div className="flex-1 text-[13px] leading-snug text-[#ebebf5]">{t.message}</div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 p-0.5 rounded-md text-[#8e8e93] hover:text-white"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
