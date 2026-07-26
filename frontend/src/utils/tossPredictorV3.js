// ─── LAYER 1: Pre-Match Money Flow (Weight: 25%) ─────────────────────────────

function analyzePreMatchFlow(data) {
  const vol = data.preMatchVolume || {}
  const pnl = data.preMatchPnl || {}

  const t1Back = vol.team1?.back || 0
  const t2Back = vol.team2?.back || 0
  const t1Lay  = vol.team1?.lay  || 0
  const t2Lay  = vol.team2?.lay  || 0
  const totalBack = t1Back + t2Back

  const t1BackPct = totalBack > 0 ? (t1Back / totalBack) * 100 : 50
  const t2BackPct = totalBack > 0 ? (t2Back / totalBack) * 100 : 50

  const bookieLossOnTeam1 = (pnl.team1 ?? 0) < 0
  const bookieLossOnTeam2 = (pnl.team2 ?? 0) < 0

  const t1Genuine = t1Back > t2Back && t1Lay < t2Lay
  const t2Genuine = t2Back > t1Back && t2Lay < t1Lay

  let t1Score = 0, t2Score = 0

  if (t1BackPct > 55) t1Score += t1BackPct > 60 ? 3 : 1.5
  if (t2BackPct > 55) t2Score += t2BackPct > 60 ? 3 : 1.5
  if (bookieLossOnTeam1) t1Score += 1.5
  if (bookieLossOnTeam2) t2Score += 1.5
  if (t1Genuine) t1Score += 2
  if (t2Genuine) t2Score += 2

  return {
    team1Score: t1Score,
    team2Score: t2Score,
    team1BackPct: Math.round(t1BackPct * 10) / 10,
    team2BackPct: Math.round(t2BackPct * 10) / 10,
    signal: t1Score > t2Score ? 'team1' : t2Score > t1Score ? 'team2' : 'neutral',
  }
}

// ─── LAYER 2: Bookie Position & Exposure (Weight: 30%) ───────────────────────

function analyzeBookiePosition(data) {
  const dp   = data.deepMetrics?.derivedPL || {}
  const raw  = data.deepMetrics?.raw || {}
  const bExp = data.bookmakerExposure || {}

  const dpl1 = dp.team1_win ?? 0
  const dpl2 = dp.team2_win ?? 0

  let bookieExpects, bookieConfidence
  if (dpl1 > 0 && dpl2 < 0) {
    bookieExpects = 'team1'; bookieConfidence = Math.abs(dpl1 - dpl2)
  } else if (dpl2 > 0 && dpl1 < 0) {
    bookieExpects = 'team2'; bookieConfidence = Math.abs(dpl2 - dpl1)
  } else if (dpl1 > dpl2) {
    bookieExpects = 'team1'; bookieConfidence = Math.abs(dpl1 - dpl2) * 0.5
  } else {
    bookieExpects = 'team2'; bookieConfidence = Math.abs(dpl2 - dpl1) * 0.5
  }

  const t1NetRaw = (raw.A_lay_stake || 0) - (raw.A_back_expo || 0)
  const t2NetRaw = (raw.B_lay_stake || 0) - (raw.B_back_expo || 0)
  const t1NetBE  = bExp.team1?.netExposure ?? 0
  const t2NetBE  = bExp.team2?.netExposure ?? 0

  let t1Score = 0, t2Score = 0

  if (bookieExpects === 'team1') t1Score += 5; else t2Score += 5
  if (t1NetRaw > 0 && t2NetRaw < 0) t1Score += 2
  else if (t2NetRaw > 0 && t1NetRaw < 0) t2Score += 2
  if (t1NetBE > t2NetBE) t1Score += 1.5; else if (t2NetBE > t1NetBE) t2Score += 1.5

  const allAgreeTeam1 = bookieExpects === 'team1' && t1NetRaw > t2NetRaw && t1NetBE > t2NetBE
  const allAgreeTeam2 = bookieExpects === 'team2' && t2NetRaw > t1NetRaw && t2NetBE > t1NetBE
  if (allAgreeTeam1) t1Score += 3
  if (allAgreeTeam2) t2Score += 3

  return {
    team1Score: t1Score,
    team2Score: t2Score,
    bookieExpects,
    bookieConfidence,
    derivedPL: { team1: dpl1, team2: dpl2 },
    exposure: { team1: t1NetBE, team2: t2NetBE },
    allAligned: allAgreeTeam1 || allAgreeTeam2,
    signal: t1Score > t2Score ? 'team1' : t2Score > t1Score ? 'team2' : 'neutral',
  }
}

// ─── LAYER 3: 3-Minute Window (Weight: 15%) ──────────────────────────────────

function analyzeThreeMinWindow(data) {
  const vol = data.threeMinVolume || {}
  const pnl = data.threeMinPnl   || {}

  const t1Back = vol.team1?.back || 0
  const t2Back = vol.team2?.back || 0
  const t1Lay  = vol.team1?.lay  || 0
  const t2Lay  = vol.team2?.lay  || 0
  const total  = t1Back + t2Back + t1Lay + t2Lay

  const t1Share = total > 0 ? ((t1Back + t2Lay) / total) * 100 : 50
  const t2Share = total > 0 ? ((t2Back + t1Lay) / total) * 100 : 50

  const pnlShift = (pnl.team1 ?? 0) - (pnl.team2 ?? 0)

  let t1Score = 0, t2Score = 0

  if (t1Share > 60) t1Score += 3; else if (t1Share > 55) t1Score += 1.5
  if (t2Share > 60) t2Score += 3; else if (t2Share > 55) t2Score += 1.5
  if (pnlShift < -100) t1Score += 1
  if (pnlShift > 100)  t2Score += 1
  if (t1Lay > t1Back * 1.5) t2Score += 2
  if (t2Lay > t2Back * 1.5) t1Score += 2

  return {
    team1Score: t1Score,
    team2Score: t2Score,
    team1Share: Math.round(t1Share * 10) / 10,
    team2Share: Math.round(t2Share * 10) / 10,
    hasInsiderSignal: Math.abs(t1Share - t2Share) > 20,
    signal: t1Score > t2Score ? 'team1' : t2Score > t1Score ? 'team2' : 'neutral',
  }
}

// ─── LAYER 4: Sentiment & Support (Weight: 15%) ──────────────────────────────

function analyzeSentiment(data) {
  const sent = data.sentimentScore   || {}
  const ns   = data.netSupport       || {}
  const syn  = data.syntheticSupport || {}

  const t1Sent = sent.teamA?.sentimentScore ?? sent.team1?.sentimentScore ?? 0
  const t2Sent = sent.teamB?.sentimentScore ?? sent.team2?.sentimentScore ?? 0

  const pctA = ns.percentageA ?? (ns.teamA ? (ns.teamA.netSupportValue / ((ns.teamA.netSupportValue || 0) + (ns.teamB?.netSupportValue || 0))) * 100 : 50)
  const pctB = 100 - pctA

  const supportRatio = syn.supportRatio ?? 1

  const t1Reject = sent.teamA?.opponentLiabilityRejection ?? sent.team1?.opponentLiabilityRejection ?? 0
  const t2Reject = sent.teamB?.opponentLiabilityRejection ?? sent.team2?.opponentLiabilityRejection ?? 0

  let t1Score = 0, t2Score = 0

  if (pctA > 60) t1Score += 2.5; else if (pctA > 55) t1Score += 1.5
  if (pctB > 60) t2Score += 2.5; else if (pctB > 55) t2Score += 1.5
  if (supportRatio > 1.3) t1Score += 2; else if (supportRatio > 1.1) t1Score += 1
  if (supportRatio < 0.7) t2Score += 2; else if (supportRatio < 0.9) t2Score += 1
  t1Score += Math.min(2, Math.max(0, (t1Sent - t2Sent) / 10))
  t2Score += Math.min(2, Math.max(0, (t2Sent - t1Sent) / 10))
  if (t1Reject > t2Reject * 1.2) t1Score += 1.5
  if (t2Reject > t1Reject * 1.2) t2Score += 1.5

  return {
    team1Score: t1Score,
    team2Score: t2Score,
    team1Sentiment: t1Sent,
    team2Sentiment: t2Sent,
    supportRatio,
    netSupportPct: { A: Math.round(pctA * 10) / 10, B: Math.round(pctB * 10) / 10 },
    signal: t1Score > t2Score ? 'team1' : t2Score > t1Score ? 'team2' : 'neutral',
  }
}

// ─── LAYER 5: Trap Detection (Weight: 10%) ───────────────────────────────────

function analyzeTrap(data, t1, t2) {
  const sig        = data.marketSignals || {}
  const trap       = sig.trap           || {}
  const moreBettedRaw = sig.moreBettedTeam
  const bookieFavRaw  = sig.bookieFavouriteOutcome
  const riskTeamRaw   = sig.riskTeam

  // normalize team names to team1/team2 keys
  const toKey = (name) => name === t1 ? 'team1' : name === t2 ? 'team2' : name
  const moreBetted = toKey(moreBettedRaw)
  const bookieFav  = toKey(bookieFavRaw)
  const riskTeam   = toKey(riskTeamRaw)

  let t1Score = 0, t2Score = 0
  let isTrap = false, trapDirection = null

  if (trap.level === 'high') {
    isTrap = true
    if (moreBetted === 'team1') { t2Score += 4; trapDirection = 'against_team1' }
    else                        { t1Score += 4; trapDirection = 'against_team2' }
  } else if (trap.level === 'medium') {
    isTrap = true
    if (moreBetted === 'team1') { t2Score += 2; trapDirection = 'against_team1' }
    else                        { t1Score += 2; trapDirection = 'against_team2' }
  } else {
    if (bookieFav === 'team1') t1Score += 1.5
    else if (bookieFav === 'team2') t2Score += 1.5
  }

  if (riskTeam === 'team1') t2Score += 1
  else if (riskTeam === 'team2') t1Score += 1

  return {
    team1Score: t1Score,
    team2Score: t2Score,
    isTrap,
    trapLevel: trap.level || 'none',
    trapDirection,
    moreBetted,
    bookieFav,
    riskTeam,
    signal: t1Score > t2Score ? 'team1' : t2Score > t1Score ? 'team2' : 'neutral',
  }
}

// ─── LAYER 6: True Market Load (Weight: 5%) ──────────────────────────────────

function analyzeMarketLoad(data) {
  const tml  = data.trueMarketLoad    || {}
  const mlv2 = data.matchLoadV2       || {}
  const adv  = data.advancedMetrics   || {}

  const t1Sup = tml.team1?.supportPercentage ?? 50
  const t2Sup = tml.team2?.supportPercentage ?? 50
  const load1     = mlv2.team1 ?? 0
  const load2     = mlv2.team2 ?? 0
  const t1BackPct = adv.team1?.backPercentage ?? 50
  const t2BackPct = adv.team2?.backPercentage ?? 50

  let t1Score = 0, t2Score = 0

  if (t1Sup > 55) t1Score += 1
  if (t2Sup > 55) t2Score += 1
  if (load1 > load2 * 1.2) t1Score += 0.5
  if (load2 > load1 * 1.2) t2Score += 0.5
  if (t1BackPct > 60) t1Score += 0.5
  if (t2BackPct > 60) t2Score += 0.5

  return {
    team1Score: t1Score,
    team2Score: t2Score,
    team1Support: t1Sup,
    team2Support: t2Sup,
    loadComparison: { team1: load1, team2: load2 },
    signal: t1Score > t2Score ? 'team1' : t2Score > t1Score ? 'team2' : 'neutral',
  }
}

// ─── MASTER ENGINE ───────────────────────────────────────────────────────────

function normalize(score, max) {
  return Math.min(10, (score / max) * 10)
}

export function predictTossV3(snap, t1, t2) {
  const data = { ...snap, teamNames: { t1, t2 } }

  const layer1 = analyzePreMatchFlow(data)
  const layer2 = analyzeBookiePosition(data)
  const layer3 = analyzeThreeMinWindow(data)
  const layer4 = analyzeSentiment(data)
  const layer5 = analyzeTrap(data, t1, t2)
  const layer6 = analyzeMarketLoad(data)

  const W = { l1: 0.25, l2: 0.30, l3: 0.15, l4: 0.15, l5: 0.10, l6: 0.05 }

  const t1Weighted =
    normalize(layer1.team1Score, 8)  * W.l1 +
    normalize(layer2.team1Score, 12) * W.l2 +
    normalize(layer3.team1Score, 7)  * W.l3 +
    normalize(layer4.team1Score, 8)  * W.l4 +
    normalize(layer5.team1Score, 5)  * W.l5 +
    normalize(layer6.team1Score, 2)  * W.l6

  const t2Weighted =
    normalize(layer1.team2Score, 8)  * W.l1 +
    normalize(layer2.team2Score, 12) * W.l2 +
    normalize(layer3.team2Score, 7)  * W.l3 +
    normalize(layer4.team2Score, 8)  * W.l4 +
    normalize(layer5.team2Score, 5)  * W.l5 +
    normalize(layer6.team2Score, 2)  * W.l6

  const total = t1Weighted + t2Weighted
  const diff  = Math.abs(t1Weighted - t2Weighted)
  let confidence = total > 0 ? (diff / total) * 100 : 0

  // scale up — raw diff/total gives low numbers, map to 40-85 range
  confidence = 40 + (confidence / 100) * 45

  const allSignals = [layer1, layer2, layer3, layer4, layer5, layer6]
    .map(l => l.signal).filter(s => s !== 'neutral')
  const t1Signals = allSignals.filter(s => s === 'team1').length
  const t2Signals = allSignals.filter(s => s === 'team2').length
  const unanimousSignals = allSignals.length > 0 && (t1Signals === allSignals.length || t2Signals === allSignals.length)

  if (unanimousSignals)                                        confidence += 12
  if (layer2.signal === layer3.signal && layer3.hasInsiderSignal) confidence += 8
  if (layer5.isTrap && layer5.signal === layer2.signal)        confidence += 8
  if (layer5.isTrap && layer5.trapLevel === 'high')            confidence += 5
  if (layer5.isTrap && layer5.signal !== layer2.signal)        confidence -= 8
  if (layer2.signal !== layer1.signal && layer1.signal !== 'neutral' && layer2.signal !== 'neutral') confidence -= 5

  // volume check — use sum of team values, not the object itself
  const totalBetVol = (snap.preMatchTotalBets?.team1 || 0) + (snap.preMatchTotalBets?.team2 || 0)
  if (totalBetVol < 50) confidence -= 8

  confidence = Math.min(82, Math.max(38, confidence))

  const predictedTeam = t1Weighted >= t2Weighted ? 'team1' : 'team2'
  const predictedName = predictedTeam === 'team1' ? t1 : t2

  let pattern = 'NORMAL', reason = ''
  if (layer5.isTrap && layer5.trapLevel === 'high') {
    pattern = 'TRAP_REVERSAL'
    reason  = `Heavy public money on ${layer5.moreBetted === 'team1' ? t1 : t2}, trap detected — reversed`
  } else if (layer3.hasInsiderSignal) {
    pattern = 'INSIDER_SIGNAL'
    reason  = `Strong last-3-min money flow towards ${predictedName}`
  } else if (layer2.allAligned) {
    pattern = 'BOOKIE_ALIGNMENT'
    reason  = `All bookie exposure metrics aligned towards ${predictedName}`
  } else if (t1Signals === allSignals.length || t2Signals === allSignals.length) {
    pattern = 'UNANIMOUS_SIGNAL'
    reason  = `All layers pointing towards ${predictedName}`
  } else {
    pattern = 'MIXED_SIGNAL'
    reason  = `Mixed signals, weighted majority towards ${predictedName}`
  }

  let result = {
    prediction: predictedName,
    predictedTeam,
    confidence: Math.round(confidence * 10) / 10,
    pattern,
    reason,
    scores: {
      team1: { name: t1, weighted: Math.round(t1Weighted * 100) / 100, signalsInFavor: t1Signals },
      team2: { name: t2, weighted: Math.round(t2Weighted * 100) / 100, signalsInFavor: t2Signals },
    },
    layers: { preMatchFlow: layer1, bookiePosition: layer2, threeMinWindow: layer3, sentiment: layer4, trap: layer5, marketLoad: layer6 },
    risk: confidence > 65 ? 'LOW' : confidence > 50 ? 'MEDIUM' : 'HIGH',
    betAdvice: confidence > 65
      ? `Strong signal for ${predictedName}. Consider betting.`
      : confidence > 50
        ? `Moderate signal for ${predictedName}. Bet with caution.`
        : `Weak signal. Toss near 50/50. Avoid or bet minimum.`,
  }

  // ─── Heuristics ──────────────────────────────────────────────────────────
  const moreBettedRaw = snap.marketSignals?.moreBettedTeam
  const moreBettedKey = moreBettedRaw === t1 ? 'team1' : moreBettedRaw === t2 ? 'team2' : null
  if (!layer3.hasInsiderSignal && result.confidence < 52 && moreBettedKey === result.predictedTeam) {
    result.predictedTeam = result.predictedTeam === 'team1' ? 'team2' : 'team1'
    result.prediction    = result.predictedTeam === 'team1' ? t1 : t2
    result.pattern       = 'CONTRA_PUBLIC'
    result.reason        = `Low confidence + public heavily on ${moreBettedRaw} — going contra-public`
    result.confidence    = Math.min(60, result.confidence + 5)
  }

  return result
}
