/**
 * League-Specific Algorithms for Toss Winner Prediction
 *
 * Dedicated market dynamics and exposure patterns for each tournament format.
 */

export function teamEq(a, b) {
  const na = String(a || '').trim().toLowerCase()
  const nb = String(b || '').trim().toLowerCase()
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

export function fmtVol(n) {
  if (!n) return '0'
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.round(n).toString()
}

/**
 * Robustly infers the competition format from snapshot, compName, or team names.
 */
export function inferCompetition(snap, compName = '') {
  let comp = ((compName || snap?.competitionName || snap?.seriesName || '') + '').toLowerCase().trim()
  if (comp) return comp

  const t1 = (snap?.teamNames?.[0] || '').toLowerCase()
  const t2 = (snap?.teamNames?.[1] || '').toLowerCase()
  const all = `${t1} ${t2}`

  if (
    all.includes('trinbago') ||
    all.includes('guyana amazon') ||
    all.includes('st. lucia') ||
    all.includes('st lucia') ||
    all.includes('jamaica') ||
    all.includes('barbados') ||
    all.includes('antigua') ||
    all.includes('barbuda') ||
    all.includes('st kitts') ||
    all.includes('st. kitts') ||
    all.includes('patriots') ||
    all.includes('tallawahs')
  ) {
    return 'caribbean premier league'
  }

  if (
    all.includes('dindigul') ||
    all.includes('trichy') ||
    all.includes('madurai') ||
    all.includes('tiruppur') ||
    all.includes('nellai') ||
    all.includes('salem') ||
    all.includes('lyca') ||
    all.includes('chepauk') ||
    all.includes('dragons') ||
    all.includes('spartans') ||
    all.includes('panthers') ||
    all.includes('tamizhans')
  ) {
    return 'tamil nadu premier league'
  }

  if (
    all.includes('sunrisers leeds') ||
    all.includes('manchester super giants') ||
    all.includes('trent rockets') ||
    all.includes('southern brave') ||
    all.includes('london spirit') ||
    all.includes('welsh fire') ||
    all.includes('oval invincibles') ||
    all.includes('birmingham phoenix')
  ) {
    return all.includes(' w') || all.includes('women') ? 'the hundred - womens' : 'the hundred'
  }

  if (
    all.includes('belfast') ||
    all.includes('dublin') ||
    all.includes('edinburgh') ||
    all.includes('glasgow') ||
    all.includes('amsterdam') ||
    all.includes('rotterdam')
  ) {
    return 'european t20 premier league'
  }

  if (
    all.includes('kochi') ||
    all.includes('calicut') ||
    all.includes('trivandrum') ||
    all.includes('kollam') ||
    all.includes('alleppey') ||
    all.includes('thrissur')
  ) {
    return 'kerala cricket league'
  }

  if (
    all.includes('purani dilli') ||
    all.includes('south delhi') ||
    all.includes('east delhi') ||
    all.includes('central delhi') ||
    all.includes('north delhi') ||
    all.includes('west delhi')
  ) {
    return 'delhi premier league'
  }

  if (
    all.includes('kashi') ||
    all.includes('meerut') ||
    all.includes('gorakhpur') ||
    all.includes('kanpur') ||
    all.includes('lucknow falcons') ||
    all.includes('noida super')
  ) {
    return 'uttar pradesh premier league'
  }

  if (
    all.includes('jalandhar') ||
    all.includes('fazilka') ||
    all.includes('mohali') ||
    all.includes('bathinda') ||
    all.includes('ludhiana') ||
    all.includes('amritsar') ||
    all.includes('agri king') ||
    all.includes('blasters') ||
    all.includes('phantoms') ||
    all.includes('super strikers') ||
    all.includes('punjab')
  ) {
    return 'sher e punjab t20 league'
  }

  if (
    all.includes('galle') ||
    all.includes('colombo') ||
    all.includes('jaffna') ||
    all.includes('kandy') ||
    all.includes('dambulla')
  ) {
    return 'sri lanka major clubs'
  }

  if (
    all.includes('hong kong') ||
    all.includes('thailand') ||
    all.includes('namibia') ||
    all.includes('south africa') ||
    all.includes('india') ||
    all.includes('pakistan') ||
    all.includes('england') ||
    all.includes('australia') ||
    all.includes('afghanistan') ||
    all.includes('ireland') ||
    all.includes('bangladesh') ||
    all.includes('sri lanka') ||
    all.includes('new zealand') ||
    all.includes('west indies') ||
    all.includes('zimbabwe')
  ) {
    if (all.includes(' w') || all.includes('women')) return 'womens international twenty20 matches'
    return 'international twenty20 matches'
  }

  return ''
}

/**
 * 🌴 Caribbean Premier League (CPL) Toss Algorithm
 */
export function getCPLTossPrediction({ t1, t2, b1, b2, l1, l2, prePnl1, prePnl2, backRatio, trap, bookieFav, stronger, supRatio, isLayAbsorbed1, isLayAbsorbed2, totBack }) {
  const totalBack = totBack ?? (b1 + b2)

  // 1.0 Naked Public Overload & Lay Resistance Trap Fade (e.g. St Kitts 77% load ₹2.98k with 0 lay vs Antigua ₹431 Lay & +₹2.92k Bookie Profit)
  if (totalBack >= 2000 && b1 >= b2 * 4.0 && l1 <= 50 && l2 >= 250 && l2 >= b2 * 0.8 && prePnl1 < -1500 && prePnl2 > 1500) {
    return {
      winner: t2,
      tier: 'CPL_TOSS_SPECIAL',
      algoName: '🌴 CPL Toss Special Algorithm',
      verdictTag: 'CPL OVERLOAD TRAP FADE 🚨',
      pattern: 'CPL_OVERLOAD_TRAP_FADE',
      reason: `CPL Naked Public Overload on ${t1} (₹${fmtVol(b1)} Back, ₹${fmtVol(l1)} Lay) Faded to ${t2} (₹${fmtVol(l2)} Lay, PnL: +${prePnl2.toFixed(0)})`,
    }
  }
  if (totalBack >= 2000 && b2 >= b1 * 4.0 && l2 <= 50 && l1 >= 250 && l1 >= b1 * 0.8 && prePnl2 < -1500 && prePnl1 > 1500) {
    return {
      winner: t1,
      tier: 'CPL_TOSS_SPECIAL',
      algoName: '🌴 CPL Toss Special Algorithm',
      verdictTag: 'CPL OVERLOAD TRAP FADE 🚨',
      pattern: 'CPL_OVERLOAD_TRAP_FADE',
      reason: `CPL Naked Public Overload on ${t2} (₹${fmtVol(b2)} Back, ₹${fmtVol(l2)} Lay) Faded to ${t1} (₹${fmtVol(l1)} Lay, PnL: +${prePnl1.toFixed(0)})`,
    }
  }

  // 1.05 Pre-Match Lay Resistance Dump Fade (near-flat back lead < 1.35x, heavy lay dump on one team)
  if (backRatio < 1.35 && l2 >= 150 && l2 >= l1 * 2.5) {
    return {
      winner: t1,
      tier: 'CPL_TOSS_SPECIAL',
      algoName: '🌴 CPL Toss Special Algorithm',
      verdictTag: 'CPL LAY DUMP FADE 🚨',
      pattern: 'CPL_LAY_DUMP_FADE',
      reason: `CPL Lay Resistance Dump on ${t2} (₹${fmtVol(l2)} Lay vs ₹${fmtVol(l1)}) -> Faded to ${t1}`,
    }
  }
  if (backRatio < 1.35 && l1 >= 150 && l1 >= l2 * 2.5) {
    return {
      winner: t2,
      tier: 'CPL_TOSS_SPECIAL',
      algoName: '🌴 CPL Toss Special Algorithm',
      verdictTag: 'CPL LAY DUMP FADE 🚨',
      pattern: 'CPL_LAY_DUMP_FADE',
      reason: `CPL Lay Resistance Dump on ${t1} (₹${fmtVol(l1)} Lay vs ₹${fmtVol(l2)}) -> Faded to ${t2}`,
    }
  }

  // 1.1 Lay absorption shield
  if (isLayAbsorbed1 && !isLayAbsorbed2 && prePnl1 > 1000) {
    return {
      winner: t1,
      tier: 'CPL_TOSS_SPECIAL',
      algoName: '🌴 CPL Toss Special Algorithm',
      verdictTag: 'CPL BOOKMAKER SHIELD',
      pattern: 'CPL_BOOKIE_SHIELD',
      reason: `CPL Bookie Lay Shield on ${t1} (Lay: ₹${fmtVol(l1)}, PnL: +${prePnl1.toFixed(0)})`,
    }
  }
  if (isLayAbsorbed2 && !isLayAbsorbed1 && prePnl2 > 1000) {
    return {
      winner: t2,
      tier: 'CPL_TOSS_SPECIAL',
      algoName: '🌴 CPL Toss Special Algorithm',
      verdictTag: 'CPL BOOKMAKER SHIELD',
      pattern: 'CPL_BOOKIE_SHIELD',
      reason: `CPL Bookie Lay Shield on ${t2} (Lay: ₹${fmtVol(l2)}, PnL: +${prePnl2.toFixed(0)})`,
    }
  }

  // 1.2 High Trap with Strong Synthetic Support (>= 1.5x)
  if (trap === 'high' && supRatio >= 1.5 && stronger) {
    const win = teamEq(stronger, t1) ? t1 : t2
    return {
      winner: win,
      tier: 'CPL_TOSS_SPECIAL',
      algoName: '🌴 CPL Toss Special Algorithm',
      verdictTag: 'CPL SMART MONEY SUPPORT',
      pattern: 'CPL_SMART_SUPPORT',
      reason: `CPL Strong Synthetic Support on ${win} (${supRatio.toFixed(1)}x Ratio)`,
    }
  }

  // 1.3 High Trap with Weak Synthetic Support (< 1.5x) & Non-Blowout Back Lead (< 1.65x) -> Fade Public to Bookie Safe Side
  if (trap === 'high' && bookieFav && supRatio < 1.5 && backRatio < 1.65) {
    if (teamEq(bookieFav, t1) && prePnl1 > 0) {
      return {
        winner: t1,
        tier: 'CPL_TOSS_SPECIAL',
        algoName: '🌴 CPL Toss Special Algorithm',
        verdictTag: 'CPL BOOKIE FAV SAFE',
        pattern: 'CPL_BOOKIE_FAV_SAFE',
        reason: `CPL Trap Bookie Safe on ${t1} (PnL: +${prePnl1.toFixed(0)})`,
      }
    }
    if (teamEq(bookieFav, t2) && prePnl2 > 0) {
      return {
        winner: t2,
        tier: 'CPL_TOSS_SPECIAL',
        algoName: '🌴 CPL Toss Special Algorithm',
        verdictTag: 'CPL BOOKIE FAV SAFE',
        pattern: 'CPL_BOOKIE_FAV_SAFE',
        reason: `CPL Trap Bookie Safe on ${t2} (PnL: +${prePnl2.toFixed(0)})`,
      }
    }
  }

  // 1.4 Clean Market / Smart Inflow Leader
  if (b1 !== b2 && (b1 > 0 || b2 > 0)) {
    const win = b1 > b2 ? t1 : t2
    return {
      winner: win,
      tier: 'CPL_TOSS_SPECIAL',
      algoName: '🌴 CPL Toss Special Algorithm',
      verdictTag: 'CPL SMART INFLOW',
      pattern: 'CPL_SMART_INFLOW',
      reason: `CPL Smart Money Inflow on ${win} (₹${fmtVol(Math.max(b1, b2))} Back, Lead: ${backRatio.toFixed(1)}x)`,
    }
  }

  const win = prePnl1 > prePnl2 ? t1 : t2
  return {
    winner: win,
    tier: 'CPL_TOSS_SPECIAL',
    algoName: '🌴 CPL Toss Special Algorithm',
    verdictTag: 'CPL BOOKIE SAFE',
    pattern: 'CPL_BOOKIE_SAFE_PNL',
    reason: `CPL Bookie Safe PnL on ${win}`,
  }
}

/**
 * 🇮🇳 Tamil Nadu Premier League (TNPL) Toss Algorithm
 */
export function getTNPLTossPrediction({ t1, t2, b1, b2, l1, l2, prePnl1, prePnl2, backRatio, b1Pct, b2Pct, isZeroBack1, isZeroBack2, isLayAbsorbed1, isLayAbsorbed2 }) {
  // 2.1 Critical Overload Trap Fade
  if ((b1Pct >= 0.92 || backRatio >= 10.0) && b1 > b2 && prePnl1 < 0 && l2 <= 100) {
    return {
      winner: t2,
      tier: 'TNPL_TOSS_SPECIAL',
      algoName: '🇮🇳 TNPL Toss Special Algorithm',
      verdictTag: 'TNPL OVERLOAD FADE 🚨',
      pattern: 'TNPL_OVERLOAD_FADE',
      reason: `TNPL Critical Public Overload on ${t1} (${(b1Pct * 100).toFixed(0)}% Load) -> Faded to ${t2}`,
    }
  }
  if ((b2Pct >= 0.92 || backRatio >= 10.0) && b2 > b1 && prePnl2 < 0 && l1 <= 100) {
    return {
      winner: t1,
      tier: 'TNPL_TOSS_SPECIAL',
      algoName: '🇮🇳 TNPL Toss Special Algorithm',
      verdictTag: 'TNPL OVERLOAD FADE 🚨',
      pattern: 'TNPL_OVERLOAD_FADE',
      reason: `TNPL Critical Public Overload on ${t2} (${(b2Pct * 100).toFixed(0)}% Load) -> Faded to ${t1}`,
    }
  }

  // 2.2 Zero-Back Pure Bookmaker Profit
  if (isZeroBack1 && prePnl1 > 0) {
    return {
      winner: t1,
      tier: 'TNPL_TOSS_SPECIAL',
      algoName: '🇮🇳 TNPL Toss Special Algorithm',
      verdictTag: 'TNPL ZERO-BACK SAFE',
      pattern: 'TNPL_ZERO_BACK_SAFE',
      reason: `TNPL Pure Profit on ${t1} (Zero Back Exposure, PnL: +${prePnl1.toFixed(0)})`,
    }
  }
  if (isZeroBack2 && prePnl2 > 0) {
    return {
      winner: t2,
      tier: 'TNPL_TOSS_SPECIAL',
      algoName: '🇮🇳 TNPL Toss Special Algorithm',
      verdictTag: 'TNPL ZERO-BACK SAFE',
      pattern: 'TNPL_ZERO_BACK_SAFE',
      reason: `TNPL Pure Profit on ${t2} (Zero Back Exposure, PnL: +${prePnl2.toFixed(0)})`,
    }
  }

  // 2.3 Lay Shield
  if (isLayAbsorbed1 && !isLayAbsorbed2 && prePnl1 > 1650) {
    return {
      winner: t1,
      tier: 'TNPL_TOSS_SPECIAL',
      algoName: '🇮🇳 TNPL Toss Special Algorithm',
      verdictTag: 'TNPL BOOKIE SHIELD',
      pattern: 'TNPL_BOOKIE_SHIELD',
      reason: `TNPL Bookie Lay Shield on ${t1} (Lay: ₹${fmtVol(l1)}, PnL: +${prePnl1.toFixed(0)})`,
    }
  }
  if (isLayAbsorbed2 && !isLayAbsorbed1 && prePnl2 > 1650) {
    return {
      winner: t2,
      tier: 'TNPL_TOSS_SPECIAL',
      algoName: '🇮🇳 TNPL Toss Special Algorithm',
      verdictTag: 'TNPL BOOKIE SHIELD',
      pattern: 'TNPL_BOOKIE_SHIELD',
      reason: `TNPL Bookie Lay Shield on ${t2} (Lay: ₹${fmtVol(l2)}, PnL: +${prePnl2.toFixed(0)})`,
    }
  }

  // 2.4 Micro Liquidity Bookie Safe
  if (Math.max(b1, b2) < 500 && prePnl1 > 100 && prePnl2 < -100) {
    return {
      winner: t1,
      tier: 'TNPL_TOSS_SPECIAL',
      algoName: '🇮🇳 TNPL Toss Special Algorithm',
      verdictTag: 'TNPL MICRO SAFE',
      pattern: 'TNPL_MICRO_SAFE',
      reason: `TNPL Micro Liquidity Bookie Safe on ${t1} (PnL: +${prePnl1.toFixed(0)} vs ${prePnl2.toFixed(0)})`,
    }
  }
  if (Math.max(b1, b2) < 500 && prePnl2 > 100 && prePnl1 < -100) {
    return {
      winner: t2,
      tier: 'TNPL_TOSS_SPECIAL',
      algoName: '🇮🇳 TNPL Toss Special Algorithm',
      verdictTag: 'TNPL MICRO SAFE',
      pattern: 'TNPL_MICRO_SAFE',
      reason: `TNPL Micro Liquidity Bookie Safe on ${t2} (PnL: +${prePnl2.toFixed(0)} vs ${prePnl1.toFixed(0)})`,
    }
  }

  // 2.5 Smart Inflow Leader
  if (b1 !== b2 && (b1 > 0 || b2 > 0)) {
    const win = b1 > b2 ? t1 : t2
    return {
      winner: win,
      tier: 'TNPL_TOSS_SPECIAL',
      algoName: '🇮🇳 TNPL Toss Special Algorithm',
      verdictTag: 'TNPL SMART INFLOW',
      pattern: 'TNPL_SMART_INFLOW',
      reason: `TNPL Smart Money Inflow on ${win} (₹${fmtVol(Math.max(b1, b2))} Back, Lead: ${backRatio.toFixed(1)}x)`,
    }
  }

  return null
}

/**
 * 🏴󠁧󠁢󠁥󠁮󠁧󠁿 The Hundred & The Hundred Women's Toss Algorithm
 */
export function getTheHundredTossPrediction({ t1, t2, b1, b2, l1, l2, prePnl1, prePnl2, backRatio, trap, stronger, isLayAbsorbed1, isLayAbsorbed2 }) {
  // 3.1 Lay Shield
  if (isLayAbsorbed1 && !isLayAbsorbed2 && prePnl1 > 1500) {
    return {
      winner: t1,
      tier: 'HUNDRED_TOSS_SPECIAL',
      algoName: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 The Hundred Toss Algorithm',
      verdictTag: 'HUNDRED BOOKIE SHIELD',
      pattern: 'HUNDRED_BOOKIE_SHIELD',
      reason: `The Hundred Lay Shield on ${t1} (Lay: ₹${fmtVol(l1)}, PnL: +${prePnl1.toFixed(0)})`,
    }
  }
  if (isLayAbsorbed2 && !isLayAbsorbed1 && prePnl2 > 1500) {
    return {
      winner: t2,
      tier: 'HUNDRED_TOSS_SPECIAL',
      algoName: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 The Hundred Toss Algorithm',
      verdictTag: 'HUNDRED BOOKIE SHIELD',
      pattern: 'HUNDRED_BOOKIE_SHIELD',
      reason: `The Hundred Lay Shield on ${t2} (Lay: ₹${fmtVol(l2)}, PnL: +${prePnl2.toFixed(0)})`,
    }
  }

  // 3.2 Clean Market Stronger Support Safe
  if (trap === 'none' && backRatio <= 1.55 && prePnl1 > 0 && prePnl2 < 0 && stronger && teamEq(stronger, t1)) {
    return {
      winner: t1,
      tier: 'HUNDRED_TOSS_SPECIAL',
      algoName: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 The Hundred Toss Algorithm',
      verdictTag: 'HUNDRED STRONGER SAFE',
      pattern: 'HUNDRED_STRONGER_SAFE',
      reason: `The Hundred Stronger Safe on ${t1} (PnL: +${prePnl1.toFixed(0)})`,
    }
  }
  if (trap === 'none' && backRatio <= 1.55 && prePnl2 > 0 && prePnl1 < 0 && stronger && teamEq(stronger, t2)) {
    return {
      winner: t2,
      tier: 'HUNDRED_TOSS_SPECIAL',
      algoName: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 The Hundred Toss Algorithm',
      verdictTag: 'HUNDRED STRONGER SAFE',
      pattern: 'HUNDRED_STRONGER_SAFE',
      reason: `The Hundred Stronger Safe on ${t2} (PnL: +${prePnl2.toFixed(0)})`,
    }
  }

  // 3.3 Smart Inflow
  if (b1 !== b2 && (b1 > 0 || b2 > 0)) {
    const win = b1 > b2 ? t1 : t2
    return {
      winner: win,
      tier: 'HUNDRED_TOSS_SPECIAL',
      algoName: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 The Hundred Toss Algorithm',
      verdictTag: 'HUNDRED SMART INFLOW',
      pattern: 'HUNDRED_SMART_INFLOW',
      reason: `The Hundred Smart Inflow on ${win} (₹${fmtVol(Math.max(b1, b2))} Back, Lead: ${backRatio.toFixed(1)}x)`,
    }
  }

  return null
}

/**
 * 👩 Women's International T20 & Low Volume Matches Toss Algorithm
 */
export function getWomensTossPrediction({ t1, t2, b1, b2, prePnl1, prePnl2, backRatio }) {
  // 1. Heavy Public Trap Fade: When public piles on favorite causing extreme bookmaker loss (prePnl <= -800)
  // e.g. India W (-1466 PnL) vs Thailand W (+1565 PnL) -> Faded to Thailand W
  // e.g. Bangladesh W (-1143 PnL) vs Indonesia W (+1263 PnL) -> Faded to Indonesia W
  if (prePnl1 <= -800 && prePnl2 >= 800) {
    return {
      winner: t2,
      tier: 'WOMENS_TOSS_SPECIAL',
      algoName: "👩 Women's T20 Toss Algorithm",
      verdictTag: 'WOMENS TRAP FADE 🚨',
      pattern: 'WOMENS_TRAP_FADE',
      reason: `Women's Heavy Trap on ${t1} (PnL: ${prePnl1.toFixed(0)}) -> Bookie Safe Side ${t2} (+${prePnl2.toFixed(0)})`,
    }
  }
  if (prePnl2 <= -800 && prePnl1 >= 800) {
    return {
      winner: t1,
      tier: 'WOMENS_TOSS_SPECIAL',
      algoName: "👩 Women's T20 Toss Algorithm",
      verdictTag: 'WOMENS TRAP FADE 🚨',
      pattern: 'WOMENS_TRAP_FADE',
      reason: `Women's Heavy Trap on ${t2} (PnL: ${prePnl2.toFixed(0)}) -> Bookie Safe Side ${t1} (+${prePnl1.toFixed(0)})`,
    }
  }

  // 2. Low Volume Organic Support
  if (Math.max(b1, b2) < 200 && (b1 > 0 || b2 > 0)) {
    const win = b1 > b2 ? t1 : t2
    return {
      winner: win,
      tier: 'WOMENS_TOSS_SPECIAL',
      algoName: "👩 Women's T20 Toss Algorithm",
      verdictTag: 'WOMENS ORGANIC INFLOW',
      pattern: 'WOMENS_ORGANIC_INFLOW',
      reason: `Women's Organic Support on ${win} (₹${fmtVol(Math.max(b1, b2))} Back)`,
    }
  }

  // 3. Smart Inflow
  if (b1 !== b2 && (b1 > 0 || b2 > 0)) {
    const win = b1 > b2 ? t1 : t2
    return {
      winner: win,
      tier: 'WOMENS_TOSS_SPECIAL',
      algoName: "👩 Women's T20 Toss Algorithm",
      verdictTag: 'WOMENS SMART INFLOW',
      pattern: 'WOMENS_SMART_INFLOW',
      reason: `Women's Inflow on ${win} (₹${fmtVol(Math.max(b1, b2))} Back, Lead: ${backRatio.toFixed(1)}x)`,
    }
  }

  return null
}

/**
 * 🇪🇺 European T20 Premier League / ECS Toss Algorithm
 *
 * Revision log:
 *  v2 – Tightened Overload Fade to 90%/9x + PnL gate + totBack > 800 to reduce false fades.
 *       Raised Lay Dump Fade minimum to 100 & 2.5x ratio.
 *       Added Bookie Safe PnL fallback before raw inflow.
 *  v3 – Fixed ECS_BOOKIE_SAFE false fires: added back-volume alignment gate.
 *       Bookie Safe only fires when PnL winner ALSO leads in back volume.
 *       In ETPL the back-volume leader is the most reliable toss signal.
 *       Raised Bookie Safe PnL threshold to ≥500 / ≤-300 for stronger signal.
 */
export function getECSTossPrediction({ t1, t2, b1, b2, l1, l2, prePnl1, prePnl2, backRatio, b1Pct, b2Pct, totBack }) {
  // 5.1 Lay Dump Resistance Fade – min ₹100 lay, 2.5x dominance, negative PnL on dumped team
  // Heavy asymmetric lay = smart money short-selling against that team
  if (l1 >= 100 && l1 >= l2 * 2.5 && prePnl1 < 0) {
    return {
      winner: t2,
      tier: 'EUROPEAN_TOSS_SPECIAL',
      algoName: '🇪🇺 European T20 Toss Algorithm',
      verdictTag: 'ECS LAY DUMP FADE 🚨',
      pattern: 'ECS_LAY_DUMP_FADE',
      reason: `ECS Heavy Lay Short Dump on ${t1} (₹${l1.toFixed(0)} Lay, ${(l1 / Math.max(l2, 1)).toFixed(1)}x) -> Faded to ${t2}`,
    }
  }
  if (l2 >= 100 && l2 >= l1 * 2.5 && prePnl2 < 0) {
    return {
      winner: t1,
      tier: 'EUROPEAN_TOSS_SPECIAL',
      algoName: '🇪🇺 European T20 Toss Algorithm',
      verdictTag: 'ECS LAY DUMP FADE 🚨',
      pattern: 'ECS_LAY_DUMP_FADE',
      reason: `ECS Heavy Lay Short Dump on ${t2} (₹${l2.toFixed(0)} Lay, ${(l2 / Math.max(l1, 1)).toFixed(1)}x) -> Faded to ${t1}`,
    }
  }

  // 5.2 Retail Overload Fade – 90%/9x threshold, double PnL gate, totBack > 800
  // Requires the FADE side (bookie) to also show positive PnL to confirm genuine overload
  if ((b1Pct >= 0.90 || backRatio >= 9.0) && b1 > b2 && prePnl1 < -300 && prePnl2 > 0 && totBack > 800) {
    return {
      winner: t2,
      tier: 'EUROPEAN_TOSS_SPECIAL',
      algoName: '🇪🇺 European T20 Toss Algorithm',
      verdictTag: 'ECS OVERLOAD FADE 🚨',
      pattern: 'ECS_OVERLOAD_FADE',
      reason: `ECS Public Overload Fade on ${t1} (${(b1Pct * 100).toFixed(0)}% Load, PnL: ${prePnl1.toFixed(0)}) -> Faded to ${t2} (PnL: +${prePnl2.toFixed(0)})`,
    }
  }
  if ((b2Pct >= 0.90 || backRatio >= 9.0) && b2 > b1 && prePnl2 < -300 && prePnl1 > 0 && totBack > 800) {
    return {
      winner: t1,
      tier: 'EUROPEAN_TOSS_SPECIAL',
      algoName: '🇪🇺 European T20 Toss Algorithm',
      verdictTag: 'ECS OVERLOAD FADE 🚨',
      pattern: 'ECS_OVERLOAD_FADE',
      reason: `ECS Public Overload Fade on ${t2} (${(b2Pct * 100).toFixed(0)}% Load, PnL: ${prePnl2.toFixed(0)}) -> Faded to ${t1} (PnL: +${prePnl1.toFixed(0)})`,
    }
  }

  // 5.3 Bookie Safe PnL — ONLY when back-volume ALSO agrees with bookie
  // Guard: In ETPL, the back-volume leader is the primary signal. Bookie PnL alone is not enough
  // if it contradicts who has more back money in the market.
  // Threshold raised to ≥500 / ≤-300 to require a strong PnL gap signal.
  if (prePnl1 >= 500 && prePnl2 <= -300 && b1 >= b2) {
    return {
      winner: t1,
      tier: 'EUROPEAN_TOSS_SPECIAL',
      algoName: '🇪🇺 European T20 Toss Algorithm',
      verdictTag: 'ECS BOOKIE SAFE',
      pattern: 'ECS_BOOKIE_SAFE',
      reason: `ECS Bookie Exposure Safe Side on ${t1} (PnL: +${prePnl1.toFixed(0)} vs ${prePnl2.toFixed(0)}, Back aligned)`,
    }
  }
  if (prePnl2 >= 500 && prePnl1 <= -300 && b2 >= b1) {
    return {
      winner: t2,
      tier: 'EUROPEAN_TOSS_SPECIAL',
      algoName: '🇪🇺 European T20 Toss Algorithm',
      verdictTag: 'ECS BOOKIE SAFE',
      pattern: 'ECS_BOOKIE_SAFE',
      reason: `ECS Bookie Exposure Safe Side on ${t2} (PnL: +${prePnl2.toFixed(0)} vs ${prePnl1.toFixed(0)}, Back aligned)`,
    }
  }

  // 5.4 Smart Inflow Lead — primary signal for ETPL: back-volume leader wins the toss
  if (b1 !== b2 && (b1 > 0 || b2 > 0)) {
    const win = b1 > b2 ? t1 : t2
    return {
      winner: win,
      tier: 'EUROPEAN_TOSS_SPECIAL',
      algoName: '🇪🇺 European T20 Toss Algorithm',
      verdictTag: 'ECS SMART INFLOW',
      pattern: 'ECS_SMART_INFLOW',
      reason: `ECS Smart Inflow on ${win} (₹${Math.max(b1, b2).toFixed(0)} Back, Lead: ${backRatio.toFixed(1)}x)`,
    }
  }

  return null
}


/**
 * 🌍 International Matches (T20I, Test Matches, ODIs, ICC Events) Toss Algorithm
 */
export function getIntlTossPrediction({ t1, t2, b1, b2, l1, l2, prePnl1, prePnl2, backRatio, b1Pct, b2Pct, totBack, trap, bookieFav }) {
  // 6.1 Heavy Public Trap Counter (Bookmaker loss on heavy favorite, PnL delta > 450, low lay on safe side <= 100)
  // e.g. Match 31: Namibia (-590) vs South Africa (+635) -> South Africa
  // e.g. Match 47: Zimbabwe (-597) vs South Africa (+648) -> South Africa
  if (trap === 'high' && b1 > b2 && prePnl1 < -450 && prePnl2 > 450 && l2 <= 100 && bookieFav && teamEq(bookieFav, t2)) {
    return {
      winner: t2,
      tier: 'INTL_TOSS_SPECIAL',
      algoName: '🌍 International Toss Special Algorithm',
      verdictTag: 'INTL TRAP COUNTER',
      pattern: 'INTL_TRAP_COUNTER',
      reason: `Intl High Trap Counter on ${t1} (PnL: ${prePnl1.toFixed(0)}) -> Bookie Safe Side ${t2} (+${prePnl2.toFixed(0)})`,
    }
  }
  if (trap === 'high' && b2 > b1 && prePnl2 < -450 && prePnl1 > 450 && l1 <= 100 && bookieFav && teamEq(bookieFav, t1)) {
    return {
      winner: t1,
      tier: 'INTL_TOSS_SPECIAL',
      algoName: '🌍 International Toss Special Algorithm',
      verdictTag: 'INTL TRAP COUNTER',
      pattern: 'INTL_TRAP_COUNTER',
      reason: `Intl High Trap Counter on ${t2} (PnL: ${prePnl2.toFixed(0)}) -> Bookie Safe Side ${t1} (+${prePnl1.toFixed(0)})`,
    }
  }

  // 6.2 Heavy Lay Lead / Bookie Fav Shield
  // e.g. Match 43: Namibia vs Zimbabwe -> Namibia has PnL +404, Lay ₹254 (4x lay lead), bookieFav: Namibia
  if (bookieFav && teamEq(bookieFav, t1) && prePnl1 > 300 && l1 > l2 * 2.5) {
    return {
      winner: t1,
      tier: 'INTL_TOSS_SPECIAL',
      algoName: '🌍 International Toss Special Algorithm',
      verdictTag: 'INTL BOOKIE SHIELD 🛡️',
      pattern: 'INTL_BOOKIE_SHIELD',
      reason: `Intl Heavy Lay Absorption Lead on ${t1} (₹${l1.toFixed(0)} Lay) -> Safe Winner`,
    }
  }
  if (bookieFav && teamEq(bookieFav, t2) && prePnl2 > 300 && l2 > l1 * 2.5) {
    return {
      winner: t2,
      tier: 'INTL_TOSS_SPECIAL',
      algoName: '🌍 International Toss Special Algorithm',
      verdictTag: 'INTL BOOKIE SHIELD 🛡️',
      pattern: 'INTL_BOOKIE_SHIELD',
      reason: `Intl Heavy Lay Absorption Lead on ${t2} (₹${l2.toFixed(0)} Lay) -> Safe Winner`,
    }
  }

  // 6.3 Overload Fade
  if ((b1Pct >= 0.90 || backRatio >= 9.0) && b1 > b2 && prePnl1 < 0 && l2 <= 50 && totBack > 200) {
    return {
      winner: t2,
      tier: 'INTL_TOSS_SPECIAL',
      algoName: '🌍 International Toss Special Algorithm',
      verdictTag: 'INTL OVERLOAD FADE 🚨',
      pattern: 'INTL_OVERLOAD_FADE',
      reason: `Intl Public Overload Fade on ${t1} -> Faded to ${t2}`,
    }
  }
  if ((b2Pct >= 0.90 || backRatio >= 9.0) && b2 > b1 && prePnl2 < 0 && l1 <= 50 && totBack > 200) {
    return {
      winner: t1,
      tier: 'INTL_TOSS_SPECIAL',
      algoName: '🌍 International Toss Special Algorithm',
      verdictTag: 'INTL OVERLOAD FADE 🚨',
      pattern: 'INTL_OVERLOAD_FADE',
      reason: `Intl Public Overload Fade on ${t2} -> Faded to ${t1}`,
    }
  }

  // 6.4 Smart Inflow
  if (b1 !== b2 && (b1 > 0 || b2 > 0)) {
    const win = b1 > b2 ? t1 : t2
    return {
      winner: win,
      tier: 'INTL_TOSS_SPECIAL',
      algoName: '🌍 International Toss Special Algorithm',
      verdictTag: 'INTL SMART INFLOW',
      pattern: 'INTL_SMART_INFLOW',
      reason: `Intl Inflow on ${win} (₹${fmtVol(Math.max(b1, b2))} Back, Lead: ${backRatio.toFixed(1)}x)`,
    }
  }

  return null
}

/**
 * 🌴 Kerala Cricket League Toss Algorithm
 */
export function getKeralaTossPrediction({ t1, t2, b1, b2, l1, l2, prePnl1, prePnl2, backRatio }) {
  if (l1 >= 50 && l1 >= b1 * 1.8 && l1 > l2) {
    return {
      winner: t2,
      tier: 'KERALA_TOSS_SPECIAL',
      algoName: '🌴 Kerala Toss Special Algorithm',
      verdictTag: 'KERALA LAY RESISTANCE',
      pattern: 'KERALA_LAY_RESISTANCE',
      reason: `Kerala Pre-Match Lay Resistance on ${t1} (₹${fmtVol(l1)} Lay) -> Faded to ${t2}`,
    }
  }
  if (l2 >= 50 && l2 >= b2 * 1.8 && l2 > l1) {
    return {
      winner: t1,
      tier: 'KERALA_TOSS_SPECIAL',
      algoName: '🌴 Kerala Toss Special Algorithm',
      verdictTag: 'KERALA LAY RESISTANCE',
      pattern: 'KERALA_LAY_RESISTANCE',
      reason: `Kerala Pre-Match Lay Resistance on ${t2} (₹${fmtVol(l2)} Lay) -> Faded to ${t1}`,
    }
  }
  if (b1 > b2 && l1 > l2 && prePnl1 < prePnl2) {
    return {
      winner: t1,
      tier: 'KERALA_TOSS_SPECIAL',
      algoName: '🌴 Kerala Toss Special Algorithm',
      verdictTag: 'KERALA DUAL ADVANTAGE',
      pattern: 'KERALA_DUAL_ADVANTAGE',
      reason: `Kerala Dual Back+Lay Lead on ${t1}`,
    }
  }
  if (b2 > b1 && l2 > l1 && prePnl2 < prePnl1) {
    return {
      winner: t2,
      tier: 'KERALA_TOSS_SPECIAL',
      algoName: '🌴 Kerala Toss Special Algorithm',
      verdictTag: 'KERALA DUAL ADVANTAGE',
      pattern: 'KERALA_DUAL_ADVANTAGE',
      reason: `Kerala Dual Back+Lay Lead on ${t2}`,
    }
  }
  if (b1 !== b2 && (b1 > 0 || b2 > 0) && (b1 > b2 ? l1 < b1 * 1.5 : l2 < b2 * 1.5)) {
    const win = b1 > b2 ? t1 : t2
    return {
      winner: win,
      tier: 'KERALA_TOSS_SPECIAL',
      algoName: '🌴 Kerala Toss Special Algorithm',
      verdictTag: 'KERALA SMART INFLOW',
      pattern: 'KERALA_SMART_INFLOW',
      reason: `Kerala Inflow on ${win} (₹${fmtVol(Math.max(b1, b2))} Back, Lead: ${backRatio.toFixed(1)}x)`,
    }
  }
  if (prePnl1 !== prePnl2) {
    const win = prePnl1 > prePnl2 ? t1 : t2
    return {
      winner: win,
      tier: 'KERALA_TOSS_SPECIAL',
      algoName: '🌴 Kerala Toss Special Algorithm',
      verdictTag: 'KERALA BOOKIE SAFE',
      pattern: 'KERALA_BOOKIE_SAFE',
      reason: `Kerala Bookie Safe Side on ${win}`,
    }
  }
  return null
}

/**
 * 🇮🇳 Delhi Premier League (DPL) Toss Algorithm
 */
export function getDelhiTossPrediction({ t1, t2, prePnl1, prePnl2 }) {
  if (prePnl1 !== prePnl2) {
    const win = prePnl1 > prePnl2 ? t1 : t2
    return {
      winner: win,
      tier: 'DELHI_TOSS_SPECIAL',
      algoName: '🇮🇳 Delhi Premier Toss Algorithm',
      verdictTag: 'DELHI BOOKIE SAFE',
      pattern: 'DELHI_BOOKIE_SAFE',
      reason: `Delhi Bookie Exposure Safe Side on ${win}`,
    }
  }
  return null
}

/**
 * 🇮🇳 Uttar Pradesh Premier League (UP T20) Toss Algorithm
 */
export function getUPTossPrediction({ t1, t2, b1, b2, l1, l2, prePnl1, prePnl2, backRatio }) {
  if (b1 > b2 && l1 > l2 && prePnl1 < prePnl2) {
    return {
      winner: t1,
      tier: 'UP_TOSS_SPECIAL',
      algoName: '🇮🇳 UP T20 Toss Algorithm',
      verdictTag: 'UP DUAL ADVANTAGE',
      pattern: 'UP_DUAL_ADVANTAGE',
      reason: `UP Dual Inflow & Lay Pressure on ${t1}`,
    }
  }
  if (b2 > b1 && l2 > l1 && prePnl2 < prePnl1) {
    return {
      winner: t2,
      tier: 'UP_TOSS_SPECIAL',
      algoName: '🇮🇳 UP T20 Toss Algorithm',
      verdictTag: 'UP DUAL ADVANTAGE',
      pattern: 'UP_DUAL_ADVANTAGE',
      reason: `UP Dual Inflow & Lay Pressure on ${t2}`,
    }
  }
  if (b1 !== b2 && (b1 > 0 || b2 > 0)) {
    const win = b1 > b2 ? t1 : t2
    return {
      winner: win,
      tier: 'UP_TOSS_SPECIAL',
      algoName: '🇮🇳 UP T20 Toss Algorithm',
      verdictTag: 'UP SMART INFLOW',
      pattern: 'UP_SMART_INFLOW',
      reason: `UP Smart Volume Inflow on ${win} (₹${fmtVol(Math.max(b1, b2))} Back, Lead: ${backRatio.toFixed(1)}x)`,
    }
  }
  if (prePnl1 !== prePnl2) {
    const win = prePnl1 > prePnl2 ? t1 : t2
    return {
      winner: win,
      tier: 'UP_TOSS_SPECIAL',
      algoName: '🇮🇳 UP T20 Toss Algorithm',
      verdictTag: 'UP BOOKIE SAFE',
      pattern: 'UP_BOOKIE_SAFE',
      reason: `UP Bookie Exposure Safe Side on ${win}`,
    }
  }
  return null
}

/**
 * 🇱🇰 Sri Lanka Major Clubs / LPL Toss Algorithm
 */
export function getSriLankaTossPrediction({ t1, t2, prePnl1, prePnl2 }) {
  if (prePnl1 !== prePnl2) {
    const win = prePnl1 > prePnl2 ? t1 : t2
    return {
      winner: win,
      tier: 'SRILANKA_TOSS_SPECIAL',
      algoName: '🇱🇰 Sri Lanka Toss Algorithm',
      verdictTag: 'SRILANKA BOOKIE SAFE',
      pattern: 'SRILANKA_BOOKIE_SAFE',
      reason: `Sri Lanka Bookie Exposure Safe Side on ${win}`,
    }
  }
  return null
}

/**
 * 🦁 Sher E Punjab T20 League Toss Algorithm (Bookie Safe / Fade Public)
 */
export function getSherEPunjabTossPrediction({ t1, t2, b1, b2, l1, l2, prePnl1, prePnl2, backRatio, isZeroBack1, isZeroBack2 }) {
  // 1. 📉 Lay Resistance Dump / Short Fade (One team has heavy lay dump, other team has clean back inflow)
  // e.g. Bathinda (₹74 Lay) vs Ludhiana (₹0 Lay) -> Faded to Ludhiana Lion
  if (l1 >= 50 && l1 >= b1 * 1.5 && b2 > b1 && l2 <= 20) {
    return {
      winner: t2,
      tier: 'PUNJAB_TOSS_SPECIAL',
      algoName: '🦁 Sher-e-Punjab Toss Algorithm',
      verdictTag: 'PUNJAB LAY DUMP FADE 🚨',
      pattern: 'PUNJAB_LAY_DUMP_FADE',
      reason: `Sher-e-Punjab Lay Resistance Dump on ${t1} (₹${fmtVol(l1)} Lay vs ₹${fmtVol(l2)}) -> Faded to ${t2}`,
    }
  }
  if (l2 >= 50 && l2 >= b2 * 1.5 && b1 > b2 && l1 <= 20) {
    return {
      winner: t1,
      tier: 'PUNJAB_TOSS_SPECIAL',
      algoName: '🦁 Sher-e-Punjab Toss Algorithm',
      verdictTag: 'PUNJAB LAY DUMP FADE 🚨',
      pattern: 'PUNJAB_LAY_DUMP_FADE',
      reason: `Sher-e-Punjab Lay Resistance Dump on ${t2} (₹${fmtVol(l2)} Lay vs ₹${fmtVol(l1)}) -> Faded to ${t1}`,
    }
  }

  // 2. 🛡️ Lay Absorption Shield (Underdog has lay absorption, retail naked overload on favorite)
  if (l1 >= 25 && l1 >= b1 * 3.0 && prePnl1 > 0 && prePnl2 < 0 && b2 >= b1 * 5.0) {
    return {
      winner: t1,
      tier: 'PUNJAB_TOSS_SPECIAL',
      algoName: '🦁 Sher-e-Punjab Toss Algorithm',
      verdictTag: 'PUNJAB BOOKIE SHIELD',
      pattern: 'PUNJAB_BOOKIE_SHIELD',
      reason: `Sher-e-Punjab Lay Shield on ${t1} (Lay: ₹${fmtVol(l1)}, PnL: +${prePnl1.toFixed(0)})`,
    }
  }
  if (l2 >= 25 && l2 >= b2 * 3.0 && prePnl2 > 0 && prePnl1 < 0 && b1 >= b2 * 5.0) {
    return {
      winner: t2,
      tier: 'PUNJAB_TOSS_SPECIAL',
      algoName: '🦁 Sher-e-Punjab Toss Algorithm',
      verdictTag: 'PUNJAB BOOKIE SHIELD',
      pattern: 'PUNJAB_BOOKIE_SHIELD',
      reason: `Sher-e-Punjab Lay Shield on ${t2} (Lay: ₹${fmtVol(l2)}, PnL: +${prePnl2.toFixed(0)})`,
    }
  }

  if (prePnl1 !== prePnl2 && (prePnl1 < 0 || prePnl2 < 0)) {
    const win = prePnl1 > prePnl2 ? t1 : t2
    return {
      winner: win,
      tier: 'PUNJAB_TOSS_SPECIAL',
      algoName: '🦁 Sher-e-Punjab Toss Algorithm',
      verdictTag: 'PUNJAB BOOKIE SAFE',
      pattern: 'PUNJAB_BOOKIE_SAFE',
      reason: `Sher-e-Punjab Bookie Exposure Safe Side on ${win} (Fade Public)`,
    }
  }
  if (isZeroBack1 && prePnl1 > 0) {
    return {
      winner: t1,
      tier: 'PUNJAB_TOSS_SPECIAL',
      algoName: '🦁 Sher-e-Punjab Toss Algorithm',
      verdictTag: 'PUNJAB ZERO-BACK',
      pattern: 'PUNJAB_ZERO_BACK',
      reason: `Sher-e-Punjab Pure Profit on ${t1} (Zero Back Exposure)`,
    }
  }
  if (isZeroBack2 && prePnl2 > 0) {
    return {
      winner: t2,
      tier: 'PUNJAB_TOSS_SPECIAL',
      algoName: '🦁 Sher-e-Punjab Toss Algorithm',
      verdictTag: 'PUNJAB ZERO-BACK',
      pattern: 'PUNJAB_ZERO_BACK',
      reason: `Sher-e-Punjab Pure Profit on ${t2} (Zero Back Exposure)`,
    }
  }
  if (b1 < b2 && b1 > 0) {
    return {
      winner: t1,
      tier: 'PUNJAB_TOSS_SPECIAL',
      algoName: '🦁 Sher-e-Punjab Toss Algorithm',
      verdictTag: 'PUNJAB UNDERDOG FADE',
      pattern: 'PUNJAB_UNDERDOG_FADE',
      reason: `Sher-e-Punjab Public Overload Fade to ${t1}`,
    }
  }
  if (b2 < b1 && b2 > 0) {
    return {
      winner: t2,
      tier: 'PUNJAB_TOSS_SPECIAL',
      algoName: '🦁 Sher-e-Punjab Toss Algorithm',
      verdictTag: 'PUNJAB UNDERDOG FADE',
      pattern: 'PUNJAB_UNDERDOG_FADE',
      reason: `Sher-e-Punjab Public Overload Fade to ${t2}`,
    }
  }
  return null
}

/**
 * Central League Toss Prediction Dispatcher
 */
export function getLeagueTossPrediction(snap, compName = '') {
  if (!snap?.teamNames?.length) return null

  const comp = inferCompetition(snap, compName)
  const t1 = snap.teamNames?.[0] || 'Team 1'
  const t2 = snap.teamNames?.[1] || 'Team 2'

  const pv1 = snap.preMatchVolume?.team1 || snap.advancedMetricsV2?.team1 || snap.advancedMetrics?.team1 || {}
  const pv2 = snap.preMatchVolume?.team2 || snap.advancedMetricsV2?.team2 || snap.advancedMetrics?.team2 || {}

  const b1 = pv1.back ?? (snap.teams?.[t1]?.trades || []).filter((t) => t.type === 'back').reduce((s, t) => s + (t.size || 0), 0)
  const l1 = pv1.lay ?? (snap.teams?.[t1]?.trades || []).filter((t) => t.type === 'lay').reduce((s, t) => s + (t.size || 0), 0)
  const b2 = pv2.back ?? (snap.teams?.[t2]?.trades || []).filter((t) => t.type === 'back').reduce((s, t) => s + (t.size || 0), 0)
  const l2 = pv2.lay ?? (snap.teams?.[t2]?.trades || []).filter((t) => t.type === 'lay').reduce((s, t) => s + (t.size || 0), 0)

  const tot1 = snap.advancedMetricsV2?.team1?.totalBet ?? b1 + l1
  const tot2 = snap.advancedMetricsV2?.team2?.totalBet ?? b2 + l2
  const mTotal = tot1 + tot2

  if (mTotal <= 0 && b1 === 0 && l1 === 0 && b2 === 0 && l2 === 0) return null

  const prePnl1 = snap.preMatchPnl?.team1 ?? (l1 - b1)
  const prePnl2 = snap.preMatchPnl?.team2 ?? (l2 - b2)

  const backRatio = Math.min(b1, b2) > 0 ? Math.max(b1, b2) / Math.min(b1, b2) : (Math.max(b1, b2) > 0 ? 99 : 1)
  const totBack = b1 + b2
  const b1Pct = totBack > 0 ? b1 / totBack : 0.5
  const b2Pct = totBack > 0 ? b2 / totBack : 0.5

  const trap = snap.marketSignals?.trap?.level || 'none'
  const bookieFav = snap.marketSignals?.bookieFavouriteOutcome
  const stronger = snap.syntheticSupport?.strongerTeam
  const supRatio = snap.syntheticSupport?.supportRatio || 1

  const isZeroBack1 = b1 === 0 && b2 > 0
  const isZeroBack2 = b2 === 0 && b1 > 0
  const isLayAbsorbed1 = l1 >= b1 * 1.8 && l1 > l2 && l1 > 200
  const isLayAbsorbed2 = l2 >= b2 * 1.8 && l2 > l1 && l2 > 200

  const ctx = {
    comp,
    t1,
    t2,
    b1,
    b2,
    l1,
    l2,
    tot1,
    tot2,
    totBack,
    b1Pct,
    b2Pct,
    prePnl1,
    prePnl2,
    backRatio,
    trap,
    bookieFav,
    stronger,
    supRatio,
    isZeroBack1,
    isZeroBack2,
    isLayAbsorbed1,
    isLayAbsorbed2,
  }

  // 1. Caribbean Premier League (CPL)
  if (comp.includes('caribbean') || comp.includes('cpl')) {
    const p = getCPLTossPrediction(ctx)
    if (p) return p
  }

  // 2. Tamil Nadu Premier League (TNPL)
  if (comp.includes('tamil nadu') || comp.includes('tnpl')) {
    const p = getTNPLTossPrediction(ctx)
    if (p) return p
  }

  // 3. The Hundred & The Hundred Women's
  if (comp.includes('hundred')) {
    const p = getTheHundredTossPrediction(ctx)
    if (p) return p
  }

  // 4. Women's International T20 & Low Volume Women Matches
  if (comp.includes('womens') || comp.includes("women's") || comp.includes('women')) {
    const p = getWomensTossPrediction(ctx)
    if (p) return p
  }

  // 5. European T20 Premier League / ECS
  if (comp.includes('european') || comp.includes('ecs')) {
    const p = getECSTossPrediction(ctx)
    if (p) return p
  }

  // 6. International Matches (T20I, Test Matches, ODIs, ICC Events)
  if (
    comp.includes('international') ||
    comp.includes('t20i') ||
    comp.includes('icc') ||
    comp.includes('test') ||
    comp.includes('one day') ||
    comp.includes('odi')
  ) {
    const p = getIntlTossPrediction(ctx)
    if (p) return p
  }

  // 7. Kerala Cricket League
  if (comp.includes('kerala')) {
    const p = getKeralaTossPrediction(ctx)
    if (p) return p
  }

  // 8. Delhi Premier League (DPL)
  if (comp.includes('delhi') || comp.includes('dpl')) {
    const p = getDelhiTossPrediction(ctx)
    if (p) return p
  }

  // 9. Uttar Pradesh Premier League (UP T20)
  if (comp.includes('uttar pradesh') || comp.includes('up t20')) {
    const p = getUPTossPrediction(ctx)
    if (p) return p
  }

  // 10. Sri Lanka Major Clubs / LPL
  if (comp.includes('sri lanka') || comp.includes('lanka') || comp.includes('slc')) {
    const p = getSriLankaTossPrediction(ctx)
    if (p) return p
  }

  // 11. Sher E Punjab T20 League
  if (comp.includes('punjab') || comp.includes('sher e punjab') || comp.includes('sher-e-punjab')) {
    const p = getSherEPunjabTossPrediction(ctx)
    if (p) return p
  }

  return null
}
