/**
 * TennisLiveLoad — Bookie P/L Based Match Prediction Engine
 *
 * Core Principle:
 *   Bookie HAMESHA profit karta hai. Agar bookie ka P/L positive hai
 *   kisi team ki jeet pe, matlab bookie US team ko jeetne ki EXPECT kar raha hai.
 *
 * Signal Weights (out of 100):
 *   1. Bookie Simple P/L        → 35 points
 *   2. Bookie Derived P/L       → 15 points
 *   3. Market Signals           → 15 points
 *   4. Net Support / Sentiment  → 10 points
 *   5. 3-Min Momentum           → 10 points
 *   6. Volume Analysis          →  8 points
 *   7. Trap Detection           →  7 points
 */

function safe(val, def = 0) {
  if (val == null) return def
  const n = parseFloat(val)
  return isNaN(n) ? def : n
}

function sign(val) {
  return val > 0 ? 1 : val < 0 ? -1 : 0
}

// ── Signal 1: Bookie Simple P/L (35pts) ──
function signalBookiePnl(snapshot, t1, t2) {
  const dm = snapshot.deepMetrics || {}
  const sp = dm.simplePL || {}
  const teams = snapshot.teams || {}
  const t1d = teams[t1] || {}
  const t2d = teams[t2] || {}

  const pl1 = safe(t1d.pnlIfWins ?? sp.team1_win)
  const pl2 = safe(t2d.pnlIfWins ?? sp.team2_win)
  const totalAbs = Math.abs(pl1) + Math.abs(pl2)

  if (totalAbs === 0) return { score_team1: 0, score_team2: 0, signal: 'NO DATA', confidence: 0, weight: 35 }

  const s1 = sign(pl1), s2 = sign(pl2)

  if (s1 > 0 && s2 < 0) {
    return { score_team1: 35, score_team2: 0, predicted: t1, confidence: Math.min(Math.abs(pl1) / totalAbs * 100, 100), signal: `Bookie ko ${t1} ki jeet se ₹${Math.abs(pl1).toLocaleString('en-IN', {maximumFractionDigits:0})} PROFIT, ${t2} ki jeet se LOSS`, pl1, pl2, weight: 35 }
  } else if (s1 < 0 && s2 > 0) {
    return { score_team1: 0, score_team2: 35, predicted: t2, confidence: Math.min(Math.abs(pl2) / totalAbs * 100, 100), signal: `Bookie ko ${t2} ki jeet se ₹${Math.abs(pl2).toLocaleString('en-IN', {maximumFractionDigits:0})} PROFIT, ${t1} ki jeet se LOSS`, pl1, pl2, weight: 35 }
  } else if (s1 > 0 && s2 > 0) {
    if (pl1 >= pl2) {
      const ratio = pl2 / Math.max(pl1, 1)
      return { score_team1: Math.round(35 * ratio), score_team2: 0, predicted: t1, confidence: ratio * 100, signal: `Balanced market — ${t1} side zyada profit`, pl1, pl2, weight: 35 }
    } else {
      const ratio = pl1 / Math.max(pl2, 1)
      return { score_team1: 0, score_team2: Math.round(35 * ratio), predicted: t2, confidence: ratio * 100, signal: `Balanced market — ${t2} side zyada profit`, pl1, pl2, weight: 35 }
    }
  } else {
    if (Math.abs(pl1) <= Math.abs(pl2)) {
      const ratio = Math.abs(pl2) / Math.max(Math.abs(pl1) + Math.abs(pl2), 1)
      return { score_team1: Math.round(35 * ratio), score_team2: 0, predicted: t1, confidence: ratio * 100, signal: `⚠️ Bookie dono side loss mein! ${t1} kam loss`, pl1, pl2, weight: 35 }
    } else {
      const ratio = Math.abs(pl1) / Math.max(Math.abs(pl1) + Math.abs(pl2), 1)
      return { score_team1: 0, score_team2: Math.round(35 * ratio), predicted: t2, confidence: ratio * 100, signal: `⚠️ Bookie dono side loss mein! ${t2} kam loss`, pl1, pl2, weight: 35 }
    }
  }
}

// ── Signal 2: Derived P/L (15pts) ──
function signalDerivedPnl(snapshot, t1, t2) {
  const dp = (snapshot.deepMetrics || {}).derivedPL || {}
  const dpl1 = safe(dp.team1_win), dpl2 = safe(dp.team2_win)
  const totalAbs = Math.abs(dpl1) + Math.abs(dpl2)

  if (totalAbs === 0) return { score_team1: 0, score_team2: 0, signal: 'NO DATA', confidence: 0, weight: 15 }

  const s1 = sign(dpl1), s2 = sign(dpl2)

  if (s1 > 0 && s2 < 0) return { score_team1: 15, score_team2: 0, predicted: t1, confidence: 80, signal: `Derived: ${t1} jeete = profit`, dpl1, dpl2, weight: 15 }
  if (s1 < 0 && s2 > 0) return { score_team1: 0, score_team2: 15, predicted: t2, confidence: 80, signal: `Derived: ${t2} jeete = profit`, dpl1, dpl2, weight: 15 }
  if (s1 > 0 && s2 > 0) {
    if (dpl1 >= dpl2) { const r = dpl2 / Math.max(dpl1, 1); return { score_team1: Math.round(15 * r), score_team2: 0, predicted: t1, confidence: r * 100, signal: `Derived balanced, ${t1} stronger`, weight: 15 } }
    else { const r = dpl1 / Math.max(dpl2, 1); return { score_team1: 0, score_team2: Math.round(15 * r), predicted: t2, confidence: r * 100, signal: `Derived balanced, ${t2} stronger`, weight: 15 } }
  }
  if (Math.abs(dpl1) <= Math.abs(dpl2)) return { score_team1: 7, score_team2: 0, predicted: t1, confidence: 30, signal: `Derived both negative, ${t1} less loss`, weight: 15 }
  return { score_team1: 0, score_team2: 7, predicted: t2, confidence: 30, signal: `Derived both negative, ${t2} less loss`, weight: 15 }
}

// ── Signal 3: Market Signals (15pts) ──
function signalMarketSignals(snapshot, t1, t2) {
  const sig = snapshot.marketSignals || {}
  const trap = sig.trap || {}
  const bookieFav = sig.bookieFavouriteOutcome || ''
  const moreBetted = sig.moreBettedTeam || ''
  const riskTeam = sig.riskTeam || ''
  const trapLevel = trap.level || 'none'

  let s1 = 0, s2 = 0
  const signals = []

  if (bookieFav) {
    if (bookieFav === t1 || t1.includes(bookieFav) || bookieFav.includes(t1)) { s1 += 8; signals.push(`Bookie favourite: ${bookieFav}`) }
    else if (bookieFav === t2 || t2.includes(bookieFav) || bookieFav.includes(t2)) { s2 += 8; signals.push(`Bookie favourite: ${bookieFav}`) }
  }
  if (riskTeam) {
    if (riskTeam === t1 || t1.includes(riskTeam) || riskTeam.includes(t1)) { s2 += 4; signals.push(`Risk team: ${riskTeam}`) }
    else if (riskTeam === t2 || t2.includes(riskTeam) || riskTeam.includes(t2)) { s1 += 4; signals.push(`Risk team: ${riskTeam}`) }
  }
  if (moreBetted) {
    if (moreBetted === t1 || t1.includes(moreBetted) || moreBetted.includes(t1)) { s2 += 3; signals.push(`Public zyada ${moreBetted} pe → bookie opposite`) }
    else if (moreBetted === t2 || t2.includes(moreBetted) || moreBetted.includes(t2)) { s1 += 3; signals.push(`Public zyada ${moreBetted} pe → bookie opposite`) }
  }

  const predicted = s1 > s2 ? t1 : s2 > s1 ? t2 : ''
  return { score_team1: s1, score_team2: s2, predicted, confidence: Math.abs(s1 - s2) / 15 * 100, signal: signals.join(' | ') || 'No strong market signals', trap_level: trapLevel, weight: 15 }
}

// ── Signal 4: Sentiment (10pts) ──
function signalSentiment(snapshot, t1, t2) {
  const ns = snapshot.netSupport || {}
  const sent = snapshot.sentimentScore || {}
  const sup = snapshot.supportMetrics || {}

  const pctA = safe(ns.percentageA), pctB = safe(ns.percentageB)
  const sentA = safe((sent.teamA || {}).sentimentScore), sentB = safe((sent.teamB || {}).sentimentScore)
  const sup1 = safe((sup.team1 || {}).support), sup2 = safe((sup.team2 || {}).support)

  let s1 = 0, s2 = 0
  const signals = []

  if (pctA > pctB) { const d = pctA - pctB; s1 += Math.min(Math.floor(4 * d / 20), 4); signals.push(`Net support: ${t1} ${pctA.toFixed(1)}% vs ${t2} ${pctB.toFixed(1)}%`) }
  else if (pctB > pctA) { const d = pctB - pctA; s2 += Math.min(Math.floor(4 * d / 20), 4); signals.push(`Net support: ${t2} ${pctB.toFixed(1)}% vs ${t1} ${pctA.toFixed(1)}%`) }

  if (sentA > 0 && sentB < 0) { s1 += 3; signals.push(`Sentiment: ${t1} positive`) }
  else if (sentB > 0 && sentA < 0) { s2 += 3; signals.push(`Sentiment: ${t2} positive`) }
  else if (sentA > sentB) { s1 += 1 } else if (sentB > sentA) { s2 += 1 }

  if (sup1 > sup2) { const d = sup1 - sup2; s1 += Math.min(Math.floor(3 * d / 20), 3); signals.push(`Support: ${t1} ${sup1.toFixed(1)}%`) }
  else if (sup2 > sup1) { const d = sup2 - sup1; s2 += Math.min(Math.floor(3 * d / 20), 3); signals.push(`Support: ${t2} ${sup2.toFixed(1)}%`) }

  const predicted = s1 > s2 ? t1 : s2 > s1 ? t2 : ''
  return { score_team1: s1, score_team2: s2, predicted, confidence: Math.abs(s1 - s2) / 10 * 100, signal: signals.join(' | ') || 'No strong sentiment', weight: 10 }
}

// ── Signal 5: 3-Min Momentum (10pts) ──
function signal3MinMomentum(snapshot, t1, t2) {
  const tp = snapshot.threeMinPnl || {}
  const tb = snapshot.threeMinTotalBets || {}

  const tp1 = safe(tp.team1), tp2 = safe(tp.team2)
  const tb1 = safe(tb.team1), tb2 = safe(tb.team2)

  let s1 = 0, s2 = 0
  const signals = []

  if (tp1 !== 0 || tp2 !== 0) {
    const total = Math.abs(tp1) + Math.abs(tp2)
    if (tp1 > 0 && tp2 < 0) { s1 += 6; signals.push(`3-min: ${t1} positive`) }
    else if (tp2 > 0 && tp1 < 0) { s2 += 6; signals.push(`3-min: ${t2} positive`) }
    else if (tp1 > tp2) { s1 += Math.min(Math.floor(6 * (tp1 - tp2) / Math.max(total, 1)), 6); signals.push(`3-min: ${t1} stronger`) }
    else if (tp2 > tp1) { s2 += Math.min(Math.floor(6 * (tp2 - tp1) / Math.max(total, 1)), 6); signals.push(`3-min: ${t2} stronger`) }
  }

  const totalBets = tb1 + tb2
  if (totalBets > 0) {
    const t1Pct = tb1 / totalBets * 100
    const t2Pct = tb2 / totalBets * 100
    if (t1Pct > 60) { s1 += 4; signals.push(`3-min bets: ${t1} pe ${t1Pct.toFixed(0)}%`) }
    else if (t2Pct > 60) { s2 += 4; signals.push(`3-min bets: ${t2} pe ${t2Pct.toFixed(0)}%`) }
    else if (t1Pct > t2Pct) { s1 += 2 } else { s2 += 2 }
  }

  const predicted = s1 > s2 ? t1 : s2 > s1 ? t2 : ''
  return { score_team1: s1, score_team2: s2, predicted, confidence: Math.abs(s1 - s2) / 10 * 100, signal: signals.join(' | ') || 'No 3-min data', weight: 10 }
}

// ── Signal 6: Volume (8pts) ──
function signalVolume(snapshot, t1, t2) {
  const am = snapshot.advancedMetricsV2 || {}
  const t1m = am.team1 || {}, t2m = am.team2 || {}

  const t1Back = safe(t1m.back), t1Lay = safe(t1m.lay), t1Total = safe(t1m.totalBet)
  const t2Back = safe(t2m.back), t2Lay = safe(t2m.lay), t2Total = safe(t2m.totalBet)
  const t1Net = t1Back - t1Lay, t2Net = t2Back - t2Lay

  let s1 = 0, s2 = 0
  const signals = []

  if (t1Net > t2Net) { s1 += Math.min(Math.floor(4 * Math.abs((t2Net / Math.max(t1Net, 1)) - 1)), 4); signals.push(`Volume: ${t1} net back zyada`) }
  else if (t2Net > t1Net) { s2 += Math.min(Math.floor(4 * Math.abs((t1Net / Math.max(t2Net, 1)) - 1)), 4); signals.push(`Volume: ${t2} net back zyada`) }

  if (t1Total > t2Total) { s1 += Math.min(Math.floor(4 * (1 - t2Total / Math.max(t1Total, 1))), 4); signals.push(`Total bets: ${t1} zyada`) }
  else if (t2Total > t1Total) { s2 += Math.min(Math.floor(4 * (1 - t1Total / Math.max(t2Total, 1))), 4); signals.push(`Total bets: ${t2} zyada`) }

  const predicted = s1 > s2 ? t1 : s2 > s1 ? t2 : ''
  return { score_team1: s1, score_team2: s2, predicted, confidence: Math.abs(s1 - s2) / 8 * 100, signal: signals.join(' | ') || 'No volume data', weight: 8 }
}

// ── Signal 7: Trap Detection (7pts) ──
function signalTrap(snapshot, t1, t2) {
  const sig = snapshot.marketSignals || {}
  const trap = sig.trap || {}
  const pred = sig.prediction || {}

  const trapLevel = trap.level || 'none'
  const trapReason = trap.reason || ''
  const prediction = pred.prediction || ''

  let s1 = 0, s2 = 0
  const signals = []

  const predIsT1 = prediction === t1 || t1.includes(prediction) || prediction.includes(t1)

  if (trapLevel === 'none') {
    if (predIsT1) { s1 += 3; signals.push(`No trap, ${prediction} reliable`) }
    else if (prediction) { s2 += 3; signals.push(`No trap, ${prediction} reliable`) }
    else { s1 += 1; s2 += 1; signals.push('No trap, market natural') }
  } else if (trapLevel === 'low') {
    if (predIsT1) { s2 += 3; s1 += 1; signals.push(`⚠️ Low trap on ${prediction}`) }
    else { s1 += 3; s2 += 1; signals.push(`⚠️ Low trap on ${prediction}`) }
  } else if (trapLevel === 'medium') {
    if (predIsT1) { s2 += 5; signals.push(`⚠️ Medium trap on ${prediction}!`) }
    else { s1 += 5; signals.push(`⚠️ Medium trap on ${prediction}!`) }
  } else if (trapLevel === 'high') {
    if (predIsT1) { s2 += 7; signals.push(`🚨 HIGH TRAP on ${prediction}!`) }
    else { s1 += 7; signals.push(`🚨 HIGH TRAP on ${prediction}!`) }
  }

  const predicted = s1 > s2 ? t1 : s2 > s1 ? t2 : ''
  return { score_team1: s1, score_team2: s2, predicted, confidence: Math.abs(s1 - s2) / 7 * 100, signal: signals.join(' | ') || 'No trap data', trap_level: trapLevel, trap_reason: trapReason, weight: 7 }
}

// ════════════════════════════════════════════════════════════════
//  MAIN PREDICTION ENGINE
// ════════════════════════════════════════════════════════════════

function predictMatch(snapshot) {
  if (!snapshot || snapshot.error) return { error: 'No valid snapshot data' }

  const teamNames = snapshot.teamNames || []
  const t1 = teamNames[0] || 'Team 1'
  const t2 = teamNames[1] || 'Team 2'

  const s1 = signalBookiePnl(snapshot, t1, t2)
  const s2 = signalDerivedPnl(snapshot, t1, t2)
  const s3 = signalMarketSignals(snapshot, t1, t2)
  const s4 = signalSentiment(snapshot, t1, t2)
  const s5 = signal3MinMomentum(snapshot, t1, t2)
  const s6 = signalVolume(snapshot, t1, t2)
  const s7 = signalTrap(snapshot, t1, t2)

  const signals = [
    { name: 'Bookie P/L', ...s1 },
    { name: 'Derived P/L', ...s2 },
    { name: 'Market Signals', ...s3 },
    { name: 'Sentiment', ...s4 },
    { name: '3-Min Momentum', ...s5 },
    { name: 'Volume', ...s6 },
    { name: 'Trap Detection', ...s7 },
  ]

  const totalT1 = signals.reduce((sum, s) => sum + (s.score_team1 || 0), 0)
  const totalT2 = signals.reduce((sum, s) => sum + (s.score_team2 || 0), 0)
  const totalScore = totalT1 + totalT2

  if (totalScore === 0) return {
    winner: 'N/A', confidence: 0, team1: t1, team2: t2,
    team1_score: 0, team2_score: 0, team1_win_pct: 50, team2_win_pct: 50,
    signals, bookie_verdict: 'Data nahi mila — prediction impossible',
    risk_level: 'high', risk_text: 'Incomplete data', advice: 'Prediction mat karo', trap_level: 'none'
  }

  const t1Pct = totalT1 / totalScore * 100
  const t2Pct = totalT2 / totalScore * 100
  const winner = totalT1 >= totalT2 ? t1 : t2
  const loser = winner === t1 ? t2 : t1
  const confidence = Math.max(t1Pct, t2Pct)

  // Bookie verdict
  const plS1 = s1
  const plWinner = winner === t1 ? safe(plS1.pl1) : safe(plS1.pl2)
  const plLoser = winner === t1 ? safe(plS1.pl2) : safe(plS1.pl1)
  const fmt = n => Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })

  let bookieVerdict
  if (plWinner > 0 && plLoser < 0) {
    bookieVerdict = `🎯 ${winner} jeetega! Bookie ko ${winner} ki jeet se ₹${fmt(plWinner)} PROFIT hai, ${loser} ki jeet se ₹${fmt(plLoser)} LOSS hoga.`
  } else if (plWinner > 0 && plLoser > 0) {
    bookieVerdict = `⚖️ ${winner} ki taraf slight edge. Balanced market — ${winner}: ₹${fmt(plWinner)}, ${loser}: ₹${fmt(plLoser)}.`
  } else if (plWinner < 0 && plLoser < 0) {
    bookieVerdict = `⚠️ RISKY! Bookie dono side loss mein (${winner}: ₹${fmt(plWinner)}, ${loser}: ₹${fmt(plLoser)}).`
  } else {
    bookieVerdict = `📊 ${winner} ko ${confidence.toFixed(0)}% chance (score: ${winner === t1 ? totalT1 : totalT2} vs ${winner === t1 ? totalT2 : totalT1})`
  }

  // Risk level
  const margin = Math.abs(t1Pct - t2Pct)
  let riskLevel = margin > 40 ? 'low' : margin > 20 ? 'medium' : 'high'
  let riskText = margin > 40 ? 'Clear signal — zyada risk nahi' : margin > 20 ? 'Moderate signal — thoda dhyan rakhna' : 'Signals mixed — zyada risk hai'

  const trapLevel = s7.trap_level || 'none'
  if (trapLevel === 'medium' || trapLevel === 'high') {
    riskLevel = 'high'
    riskText = `⚠️ TRAP DETECTED (${trapLevel}) — ${s7.trap_reason || ''}`
  }

  // Advice
  let advice
  if (confidence >= 70) advice = `✅ ${winner} pe strong signal — ${confidence.toFixed(0)}% confidence`
  else if (confidence >= 55) advice = `🟡 ${winner} pe moderate signal — ${confidence.toFixed(0)}% — small risk`
  else if (confidence >= 50) advice = `🟠 Bahut close — ${winner} slight edge — RISKY`
  else advice = `🔴 Signals mixed — koi clear favourite nahi — BAHUT RISKY`

  if (trapLevel === 'medium' || trapLevel === 'high') advice += ` ⚠️ TRAP: ${s7.trap_reason || ''}`

  return {
    winner, loser, confidence: Math.round(confidence * 10) / 10,
    team1: t1, team2: t2,
    team1_score: totalT1, team2_score: totalT2,
    team1_win_pct: Math.round(t1Pct * 10) / 10,
    team2_win_pct: Math.round(t2Pct * 10) / 10,
    signals, bookie_verdict: bookieVerdict,
    risk_level: riskLevel, risk_text: riskText,
    advice, trap_level: trapLevel,
    pl_if_winner_wins: plWinner, pl_if_loser_wins: plLoser,
  }
}

module.exports = { predictMatch }
