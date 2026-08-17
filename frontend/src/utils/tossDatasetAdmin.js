export function buildTossDatasetQuery({
  status = 'pending',
  page = 1,
  limit = 20,
  search = '',
} = {}) {
  const params = new URLSearchParams({
    status,
    page: String(page),
    limit: String(limit),
    search: search || '',
  })
  return params.toString()
}

export function parseTossDatasetList(res = {}) {
  return {
    records: Array.isArray(res.records) ? res.records : [],
    pagination: res.pagination || { page: 1, limit: 20, total: 0, pages: 0 },
  }
}

export function formatCaptureSummary({ captured = 0, skipped = 0, failed = 0 } = {}) {
  return `${captured} captured / ${skipped} skipped / ${failed} failed`
}

export function hasUsableSnapshot(snapshot) {
  return snapshot !== null && typeof snapshot === 'object' && !Array.isArray(snapshot)
}

export function teamNamesMatch(a, b) {
  const na = String(a || '').trim().toLowerCase()
  const nb = String(b || '').trim().toLowerCase()
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

export function isPredictionHit(predictedWinner, actualWinner) {
  if (!predictedWinner || !actualWinner) return null
  return teamNamesMatch(predictedWinner, actualWinner)
}
