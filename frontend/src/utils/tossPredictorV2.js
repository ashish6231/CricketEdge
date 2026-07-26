// localStorage keys
const BACKTEST_KEY = 'toss_backtest'
const HISTORY_KEY  = 'toss_team_history'

// ── Storage helpers ──────────────────────────────────────────────────────────

export function loadBacktestResults() {
  try { return JSON.parse(localStorage.getItem(BACKTEST_KEY)) || [] }
  catch { return [] }
}

export function loadTeamHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {} }
  catch { return {} }
}

// Save a pending prediction (actual = null until user confirms)
export function savePendingPrediction(matchId, { rawShareA, predictedTeam, confidence, t1, t2 }) {
  const pending = loadPendingPredictions()
  pending[matchId] = { rawShareA, predictedTeam, confidence, t1, t2, savedAt: Date.now() }
  localStorage.setItem('toss_pending', JSON.stringify(pending))
}

export function loadPendingPredictions() {
  try { return JSON.parse(localStorage.getItem('toss_pending')) || {} }
  catch { return {} }
}

// Call this when user taps ✓ Correct / ✗ Wrong
export function confirmPredictionResult(matchId, actualTeam) {
  const pending = loadPendingPredictions()
  const p = pending[matchId]
  if (!p) return

  // 1. Append to backtest log
  const log = loadBacktestResults()
  log.push({
    rawShareA:  p.rawShareA,
    actualA:    actualTeam === p.t1 ? 1 : 0,
    prediction: p.predictedTeam,
    actual:     actualTeam,
    confidence: p.confidence,
    savedAt:    p.savedAt,
  })
  localStorage.setItem(BACKTEST_KEY, JSON.stringify(log))

  // 2. Update team toss history
  const hist = loadTeamHistory()
  for (const team of [p.t1, p.t2]) {
    if (!hist[team]) hist[team] = { wins: 0, played: 0 }
    hist[team].played += 1
    if (team === actualTeam) hist[team].wins += 1
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist))

  // 3. Remove from pending
  delete pending[matchId]
  localStorage.setItem('toss_pending', JSON.stringify(pending))
}

// ── Core algorithm ───────────────────────────────────────────────────────────

function calibrateShrinkage(historicalResults) {
  let num = 0, den = 0
  for (const r of historicalResults) {
    const x = r.rawShareA - 0.5
    const y = r.actualA   - 0.5
    num += x * y
    den += x * x
  }
  const slope = den > 0 ? Math.max(-1, Math.min(1, num / den)) : 0
  return { slope, sampleSize: historicalResults.length }
}

function teamTossPrior(wins = 0, played = 0, priorStrength = 100) {
  const alpha = priorStrength / 2
  const posteriorMean = (wins + alpha) / (played + priorStrength + 1)
  return { mean: posteriorMean, n: played }
}

export function predictTossWinnerV2({ rawMarketShareA, t1, t2 }) {
  const backtestResults  = loadBacktestResults()
  const teamHistory      = loadTeamHistory()

  const t1Hist = teamHistory[t1] || { wins: 0, played: 0 }
  const t2Hist = teamHistory[t2] || { wins: 0, played: 0 }

  const { slope, sampleSize } = calibrateShrinkage(backtestResults)
  const shrunkMarketShare = 0.5 + slope * (rawMarketShareA - 0.5)

  const t1Prior = teamTossPrior(t1Hist.wins, t1Hist.played)
  const t2Prior = teamTossPrior(t2Hist.wins, t2Hist.played)
  const teamBiasShare = t1Prior.mean / (t1Prior.mean + t2Prior.mean)

  const marketWeight = Math.min(0.35, sampleSize / 500)
  const teamWeight   = Math.min(1 - marketWeight, Math.min(0.15, (t1Prior.n + t2Prior.n) / 400))
  const priorWeight  = 1 - marketWeight - teamWeight

  const rawShareA = (shrunkMarketShare * marketWeight) +
                    (teamBiasShare     * teamWeight)   +
                    (0.5               * priorWeight)

  // Confidence capped at 20% (toss is near-random)
  const confidence = Math.min(20, Math.abs(rawShareA - 0.5) * 200)
  const finalShareA = Math.max(0.40, Math.min(0.60, rawShareA))

  const note = slope < 0
    ? `⚠️ Model historically inverse raha hai (slope=${slope.toFixed(2)}) — data check karo`
    : sampleSize < 100
      ? `Sirf ${sampleSize} backtest samples — aur data collect karo`
      : `Calibrated on ${sampleSize} historical matches`

  return {
    predictedTeam:    finalShareA >= 0.5 ? t1 : t2,
    confidencePercent: Math.round(confidence * 10) / 10,
    team1SharePercent: Math.round(finalShareA * 1000) / 10,
    team2SharePercent: Math.round((1 - finalShareA) * 1000) / 10,
    rawShareA,
    weightsUsed: { marketWeight, teamWeight, priorWeight },
    sampleSize,
    note,
  }
}
