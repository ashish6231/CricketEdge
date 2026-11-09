import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { startVisibleInterval } from '../lib/visiblePoll'
import { feedsForPath, getDelayNotice } from '../utils/feedHealth'

const HEALTH_POLL_MS = 60000
const HEALTH_URL = (import.meta.env?.VITE_API_URL || '') + '/api/health'

// Polls the public health endpoint (only while visible and on a live-data page)
// so users see when the upstream feed has silently stopped updating.
export default function DataDelayedBanner() {
  const { pathname } = useLocation()
  const [health, setHealth] = useState(null)
  const watching = feedsForPath(pathname).length > 0

  useEffect(() => {
    if (!watching) return undefined
    let cancelled = false
    const load = () => fetch(HEALTH_URL, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled && data) setHealth(data) })
      .catch(() => { /* Network errors are surfaced by the pages themselves. */ })
    load()
    const stop = startVisibleInterval(load, HEALTH_POLL_MS)
    return () => { cancelled = true; stop() }
  }, [watching])

  const notice = watching ? getDelayNotice(health, pathname) : null
  if (!notice) return null

  return (
    <div role="status" aria-live="polite"
      className="fixed bottom-4 left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-300 shadow-lg backdrop-blur">
      <AlertTriangle size={14} className="shrink-0" />
      <span>{notice}</span>
    </div>
  )
}
