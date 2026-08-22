/** Poll only when tab is visible — cuts Neon/upstream burn from background tabs. */
export const LIVE_POLL_MS = 4000

export function startVisibleInterval(fn, ms = LIVE_POLL_MS) {
  const tick = () => {
    if (typeof document !== 'undefined' && document.hidden) return
    fn()
  }
  const interval = setInterval(tick, ms)
  const onVisible = () => {
    if (document.visibilityState === 'visible') fn()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
