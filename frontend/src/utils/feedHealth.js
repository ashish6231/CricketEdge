// Maps the current route to the upstream feeds it depends on and turns the
// public /api/health payload into a "data delayed" notice (or null).
const ROUTE_FEEDS = [
  ['/tennis', ['tennis']],
  ['/cricket', ['cricket']],
  ['/toss', ['toss']],
  ['/session', ['session']],
]

export function feedsForPath(pathname = '') {
  const match = ROUTE_FEEDS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return match ? match[1] : []
}

export function formatAge(ms) {
  if (ms == null || !Number.isFinite(ms)) return null
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'less than a minute'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} hr${hours === 1 ? '' : 's'}${minutes % 60 ? ` ${minutes % 60} min` : ''}`
}

export function getDelayNotice(health, pathname) {
  const feeds = feedsForPath(pathname)
  if (!health?.feeds || !feeds.length) return null
  const stale = feeds.map(feed => health.feeds[feed]).filter(item => item?.stale)
  if (!stale.length) return null
  const ages = stale.map(item => item.ageMs).filter(age => Number.isFinite(age))
  const age = ages.length ? formatAge(Math.max(...ages)) : null
  return age
    ? `Live data is delayed — last update ${age} ago. Values shown may be outdated.`
    : 'Live data is delayed. Values shown may be outdated.'
}
