import { timestamp } from './bookiePl.js'

const ENDED_STATUSES = new Set([
  'ended', 'verified', 'pending', 'completed', 'closed',
  'cancelled', 'canceled', 'abandoned', 'result',
])

export function getMatchStartTimestamp(match) {
  const value = match?.startTime ?? match?.openDate ?? match?.marketStartTime
  const parsed = timestamp(value)
  return parsed != null && parsed > 0 ? parsed : null
}

export function isMatchEnded(match) {
  const status = String(match?.status || '').trim().toLowerCase()
  if (ENDED_STATUSES.has(status)) return true
  if (String(match?.crex?.status || '').toLowerCase() === 'completed') return true
  if (String(match?.crex?.scorecard?.status || '').toLowerCase() === 'completed') return true
  return /won by|won the|match drawn|match tied|no result/i.test(String(match?.crex?.statusText || ''))
}

/** A non-ended match becomes live when its scheduled countdown reaches zero. */
export function isMatchLiveByStart(match, now = Date.now()) {
  if (!match || isMatchEnded(match)) return false
  const status = String(match.status || '').trim().toLowerCase()
  if (match.inPlay || status === 'in-play' || status === 'live') return true
  const start = getMatchStartTimestamp(match)
  return start != null && start <= now
}
