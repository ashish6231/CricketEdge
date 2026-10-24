// Rebuild the ordinary feed shape for existing views. Missing/out-of-order
// baselines request a full snapshot instead of silently showing partial data.
export function applyFeedDelta(previous, delta) {
  if (!previous || previous.version !== delta.baseVersion) return null
  const matches = new Map(previous.matches.map(match => [String(match.matchId), match]))
  for (const id of delta.removed || []) matches.delete(String(id))
  for (const match of delta.changed || []) matches.set(String(match.matchId), match)
  const order = delta.order || [...matches.keys()]
  if (order.length !== matches.size || new Set(order.map(String)).size !== matches.size || order.some(id => !matches.has(String(id)))) return null
  const { changed: _changed, removed: _removed, order: _, baseVersion: _baseVersion, feed: _feed, ...metadata } = delta
  return { ...metadata, matches: order.map(id => matches.get(String(id))) }
}
