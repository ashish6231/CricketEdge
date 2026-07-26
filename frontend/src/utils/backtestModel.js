// historicalResults: [{ prediction: 'team1'|'team2', confidence: number, actual: 'team1'|'team2' }]

function normalCdf(x) {
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.2316419 * ax)
  const d = 0.3989423 * Math.exp(-ax * ax / 2)
  const poly = t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  const upperTail = d * poly
  return x >= 0 ? 1 - upperTail : upperTail
}

export function backtestModel(historicalResults) {
  const n = historicalResults.length
  if (n === 0) return null

  const correct = historicalResults.filter(r => r.prediction === r.actual).length
  const accuracy = correct / n

  const se = Math.sqrt(0.25 / n)
  const z = (accuracy - 0.5) / se
  const pValue = 2 * (1 - normalCdf(Math.abs(z)))

  const buckets = { '50-60': [], '60-70': [], '70-80': [], '80-90': [], '90-100': [] }
  for (const r of historicalResults) {
    const key = r.confidence < 60 ? '50-60' : r.confidence < 70 ? '60-70'
      : r.confidence < 80 ? '70-80' : r.confidence < 90 ? '80-90' : '90-100'
    buckets[key].push(r.prediction === r.actual ? 1 : 0)
  }

  const calibration = Object.entries(buckets).map(([range, hits]) => ({
    confidenceRange: range,
    n: hits.length,
    actualHitRate: hits.length
      ? ((hits.reduce((a, b) => a + b, 0) / hits.length) * 100).toFixed(1) + '%'
      : '—',
  }))

  return {
    sampleSize: n,
    overallAccuracy: (accuracy * 100).toFixed(1) + '%',
    zScore: z.toFixed(2),
    pValue: pValue.toFixed(4),
    significantlyDifferentFrom50_50: pValue < 0.05,
    calibrationByConfidence: calibration,
  }
}
