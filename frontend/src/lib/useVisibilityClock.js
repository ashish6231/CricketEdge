import { useEffect, useState } from 'react'

const DEFAULT_INTERVAL_MS = 30_000

/**
 * A low-frequency clock for schedule labels and live/upcoming boundaries.
 * It pauses while the tab is hidden so match grids are not re-rendered in the
 * background, then refreshes immediately when the user returns.
 */
export default function useVisibilityClock(intervalMs = DEFAULT_INTERVAL_MS) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) setNow(Date.now())
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) setNow(Date.now())
    }

    const timer = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [intervalMs])

  return now
}
