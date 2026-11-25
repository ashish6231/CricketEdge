import { useEffect, useRef } from 'react'

const VALID_STATUSES = new Set(['all', 'live', 'upcoming', 'completed'])

const safeGet = (storage, key) => {
  try { return storage?.getItem(key) ?? null } catch { return null }
}

const safeSet = (storage, key, value) => {
  try { storage?.setItem(key, String(value)) } catch { /* ignore */ }
}

const safeRemove = (storage, key) => {
  try { storage?.removeItem(key) } catch { /* ignore */ }
}

const getSession = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : null)

export function readHubStatus(prefix, { defaultStatus = 'all', urlStatus = null, storage = getSession() } = {}) {
  if (VALID_STATUSES.has(urlStatus)) return urlStatus
  const saved = safeGet(storage, `${prefix}_match_status`)
  return VALID_STATUSES.has(saved) ? saved : defaultStatus
}

export function writeHubStatus(prefix, status, storage = getSession()) {
  if (VALID_STATUSES.has(status)) safeSet(storage, `${prefix}_match_status`, status)
}

export function readHubSearch(prefix, storage = getSession()) {
  return safeGet(storage, `${prefix}_search_query`) || ''
}

export function writeHubSearch(prefix, query, storage = getSession()) {
  const value = String(query ?? '')
  if (value) safeSet(storage, `${prefix}_search_query`, value)
  else safeRemove(storage, `${prefix}_search_query`)
}

export function saveHubScrollTarget(prefix, { scrollTop = 0, matchId = null } = {}, storage = getSession()) {
  safeSet(storage, `${prefix}_scroll_top`, Math.max(0, Number(scrollTop) || 0))
  if (matchId != null && matchId !== '') {
    safeSet(storage, `${prefix}_last_match_id`, String(matchId))
  } else {
    safeRemove(storage, `${prefix}_last_match_id`)
  }
}

export function consumeHubScrollTarget(prefix, storage = getSession()) {
  const rawScroll = safeGet(storage, `${prefix}_scroll_top`)
  const matchId = safeGet(storage, `${prefix}_last_match_id`)
  if (rawScroll === null && !matchId) return null
  safeRemove(storage, `${prefix}_scroll_top`)
  safeRemove(storage, `${prefix}_last_match_id`)
  const parsed = rawScroll !== null ? Number(rawScroll) : null
  return {
    scrollTop: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    matchId: matchId || null,
  }
}

export function clearHubScrollTarget(prefix, storage = getSession()) {
  safeRemove(storage, `${prefix}_scroll_top`)
  safeRemove(storage, `${prefix}_last_match_id`)
}

function isElementVisibleInContainer(el, container) {
  if (!el || !container) return true
  const elRect = el.getBoundingClientRect()
  const boxRect = container.getBoundingClientRect()
  return elRect.bottom > boxRect.top && elRect.top < boxRect.bottom
}

/**
 * Restores the hub container scroll position and clicked match card when
 * returning from a detail view, and resets scroll to top when entering detail.
 */
export function useHubScrollRestore({ prefix, matchId, loading, scrollRef, cardIdPrefix, ready = true }) {
  const pendingRef = useRef(null)

  useEffect(() => {
    if (matchId) {
      pendingRef.current = null
      if (scrollRef.current) scrollRef.current.scrollTop = 0
      if (typeof window !== 'undefined') window.scrollTo(0, 0)
      return
    }
    if (!pendingRef.current) {
      pendingRef.current = consumeHubScrollTarget(prefix)
    }
  }, [prefix, matchId, scrollRef])

  useEffect(() => {
    if (matchId || loading || !ready) return
    const target = pendingRef.current
    if (!target) return

    let cancelled = false
    let attempts = 0
    let frameId = 0

    const restore = () => {
      if (cancelled) return
      const container = scrollRef.current
      const el = target.matchId && cardIdPrefix
        ? document.getElementById(`${cardIdPrefix}${target.matchId}`)
        : null

      if (!container || (target.matchId && !el && attempts < 15)) {
        attempts += 1
        frameId = requestAnimationFrame(restore)
        return
      }

      if (target.scrollTop !== null) {
        container.scrollTop = target.scrollTop
      }
      if (el && (target.scrollTop === null || !isElementVisibleInContainer(el, container))) {
        el.scrollIntoView({ block: 'nearest', behavior: 'auto' })
      }
      pendingRef.current = null
    }

    frameId = requestAnimationFrame(restore)
    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
    }
  }, [matchId, loading, ready, scrollRef, cardIdPrefix])
}
