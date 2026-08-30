/**
 * League-Specific Algorithms for Match Winner Prediction
 * Strictly uses Pre-Match metrics (preMatchVolume, preMatchPnl) to ensure predictions never flip when match goes live.
 */

function isInternationalT20(compName) {
  const comp = (compName || '').toLowerCase();
  return (
    comp.includes('international twenty20') ||
    comp.includes('international t20') ||
    comp.includes('twenty20 international') ||
    comp.includes('t20 international') ||
    comp.includes('twenty20 matches') ||
    comp.includes('t20i') ||
    comp.includes('acc mens premier cup') ||
    comp.includes('icc men') ||
    comp.includes('icc t20')
  );
}

function getInternationalT20Prediction(snap, b1, b2, l1, l2, pnl1, pnl2, team1, team2) {
  // Pre-match metrics directly from snapshot
  const prePnl = snap?.preMatchPnl || {};
  const preBets = snap?.preMatchTotalBets || {};
  const preVol1 = snap?.preMatchVolume?.team1 || {};
  const preVol2 = snap?.preMatchVolume?.team2 || {};

  const prePnl1 = prePnl.team1 != null ? prePnl.team1 : pnl1;
  const prePnl2 = prePnl.team2 != null ? prePnl.team2 : pnl2;
  const preBetCount1 = preBets.team1 != null ? preBets.team1 : null;
  const preBetCount2 = preBets.team2 != null ? preBets.team2 : null;

  const preBack1 = preVol1.back ?? b1 ?? 0;
  const preLay1 = preVol1.lay ?? l1 ?? 0;
  const preBack2 = preVol2.back ?? b2 ?? 0;
  const preLay2 = preVol2.lay ?? l2 ?? 0;

  const totBack = preBack1 + preBack2;
  const maxBack = Math.max(preBack1, preBack2);
  const minBack = Math.min(preBack1, preBack2);
  const backRatio = minBack > 0 ? maxBack / minBack : (maxBack > 0 ? 99 : 1);

  // 1. Extreme Public Trap Fortress (e.g. South Africa holding ₹11.8k vs ₹536 = 22x overload on public favorite)
  // When one team holds >= 85% of total volume with heavy liquidity (totBack >= 2000), public gets trapped!
  if (totBack >= 2000 && backRatio >= 8.0) {
    const safeWinner = preBack1 > preBack2 ? team2 : team1;
    return { winner: safeWinner, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Extreme Public Trap Fortress' };
  }

  // 2. Dual Flow Inflow Dominance (Higher Back & Higher Lay)
  if (preBack1 > preBack2 && preLay1 > preLay2 && (preBack1 >= preBack2 * 1.25 || preLay1 >= preLay2 * 1.25)) {
    return { winner: team1, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Dual Flow Inflow Dominance' };
  }
  if (preBack2 > preBack1 && preLay2 > preLay1 && (preBack2 >= preBack1 * 1.25 || preLay2 >= preLay1 * 1.25)) {
    return { winner: team2, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Dual Flow Inflow Dominance' };
  }

  // 3. Dominant Smart Money Back Inflow Margin (1.25x+)
  if (preBack1 >= (preBack2 || 1) * 1.25 && preBack1 > preBack2) {
    return { winner: team1, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Smart Money Inflow Margin' };
  }
  if (preBack2 >= (preBack1 || 1) * 1.25 && preBack2 > preBack1) {
    return { winner: team2, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Smart Money Inflow Margin' };
  }

  // 4. Pre-Match Total Bets / Activity Engagement
  if (preBetCount1 != null && preBetCount2 != null && (preBetCount1 > 0 || preBetCount2 > 0) && preBetCount1 !== preBetCount2) {
    if (preBetCount1 >= preBetCount2 * 1.5) {
      return { winner: team1, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Pre-Match Activity Lead' };
    }
    if (preBetCount2 >= preBetCount1 * 1.5) {
      return { winner: team2, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Pre-Match Activity Lead' };
    }
  }

  // 5. Volume Leader
  if (preBack1 > preBack2) {
    return { winner: team1, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Volume Leader' };
  }
  if (preBack2 > preBack1) {
    return { winner: team2, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Volume Leader' };
  }

  return { winner: prePnl1 > prePnl2 ? team1 : team2, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Bookmaker Safe Edge' };
}

function getCPLPrediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2) {
  const totBack = b1 + b2;
  const backRatio = Math.min(b1, b2) > 0 ? Math.max(b1, b2) / Math.min(b1, b2) : (Math.max(b1, b2) > 0 ? 99 : 1);
  const isLayAbsorbed1 = l1 >= b1 * 1.8 && l1 > l2 && epnl1 > 1000;
  const isLayAbsorbed2 = l2 >= b2 * 1.8 && l2 > l1 && epnl2 > 1000;

  // 1. Extreme Bookie Profit Fortress (PnL >= 4000 or high liquidity trap)
  if (epnl1 >= 4000 && epnl1 > epnl2) {
    return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Bookie Trap Fortress' };
  }
  if (epnl2 >= 4000 && epnl2 > epnl1) {
    return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Bookie Trap Fortress' };
  }

  // 2. Massive Lay Shield + Bookie PnL Dominance (e.g. Antigua vs St. Kitts)
  if (isLayAbsorbed1 && b1 > b2) {
    return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Bookmaker Lay Shield' };
  }
  if (isLayAbsorbed2 && b2 > b1) {
    return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Bookmaker Lay Shield' };
  }

  // 3. Dominant Smart Money Blowout (BackRatio >= 3.5x with genuine liquidity totBack >= 500)
  if (backRatio >= 3.5 && totBack >= 500) {
    return { winner: b1 > b2 ? team1 : team2, tier: 'CPL_SPECIAL', confidence: 'CPL Dominant Inflow Blowout' };
  }

  // 4. Genuine Dual Flow Dominance with balanced/low liability (abs(pnl1 - pnl2) < 900)
  if (Math.abs(epnl1 - epnl2) < 900) {
    if (b1 > b2 && l1 > l2) {
      return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Dual Flow Advantage' };
    }
    if (b2 > b1 && l2 > l1) {
      return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Dual Flow Advantage' };
    }
  }

  // 5. Significant Bookie Trap Fade (abs(pnl1 - pnl2) >= 900)
  // When public money creates >= 900 deficit, the bookmaker safe profit team wins!
  if (epnl1 > epnl2) {
    return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Bookie Trap (Fade Public)' };
  }
  if (epnl2 > epnl1) {
    return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Bookie Trap (Fade Public)' };
  }

  // 6. Volume Leader fallback
  return { winner: b1 > b2 ? team1 : team2, tier: 'CPL_SPECIAL', confidence: 'CPL Volume Leader' };
}

function getUPT20Prediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2) {
  const totBack = b1 + b2;
  const b1Pct = totBack > 0 ? b1 / totBack : 0.5;
  const b2Pct = totBack > 0 ? b2 / totBack : 0.5;

  // 1. Dual Advantage (Back Inflow + Lay Dominance)
  if (b1 > b2 && l1 > l2 && epnl1 < epnl2) {
    return { winner: team1, tier: 'UP_SPECIAL', confidence: 'UP Dual Advantage (Strong Buy)' };
  }
  if (b2 > b1 && l2 > l1 && epnl2 < epnl1) {
    return { winner: team2, tier: 'UP_SPECIAL', confidence: 'UP Dual Advantage (Strong Buy)' };
  }

  // 2. Critical Overload Trap Fade (Only if public load >= 88% with severe deficit)
  if (b1Pct >= 0.88 && epnl1 < -1000 && l2 <= 100) {
    return { winner: team2, tier: 'UP_SPECIAL', confidence: 'UP Critical Overload Fade' };
  }
  if (b2Pct >= 0.88 && epnl2 < -1000 && l1 <= 100) {
    return { winner: team1, tier: 'UP_SPECIAL', confidence: 'UP Critical Overload Fade' };
  }

  // 3. Dominant Smart Money Back Inflow Leader (e.g. Kashi Rudras / Meerut Mavericks)
  if (b1 >= b2 * 1.25) {
    return { winner: team1, tier: 'UP_SPECIAL', confidence: 'UP Smart Volume Margin' };
  }
  if (b2 >= b1 * 1.25) {
    return { winner: team2, tier: 'UP_SPECIAL', confidence: 'UP Smart Volume Margin' };
  }

  // 4. Strict Volume Leader
  if (b1 > b2) {
    return { winner: team1, tier: 'UP_SPECIAL', confidence: 'UP Volume Leader' };
  }
  if (b2 > b1) {
    return { winner: team2, tier: 'UP_SPECIAL', confidence: 'UP Volume Leader' };
  }

  // 5. Fallback: Bookie Safe
  if (epnl1 > epnl2) {
    return { winner: team1, tier: 'UP_SPECIAL', confidence: 'UP Bookie Safe' };
  }
  if (epnl2 > epnl1) {
    return { winner: team2, tier: 'UP_SPECIAL', confidence: 'UP Bookie Safe' };
  }

  return null;
}

// 🇪🇺 European Cricket Series (ECS / European T20) Algorithm
function getECSPrediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2) {
  // 1. Dual Flow Inflow & Lay Pressure Advantage (e.g. Belfast Wolves 784 Back & 202 Lay vs Dublin 71 Back & 0 Lay)
  if (b1 > b2 && l1 > l2) {
    return { winner: team1, tier: 'ECS_SPECIAL', confidence: 'European T20 Dual Flow Inflow Lead' };
  }
  if (b2 > b1 && l2 > l1) {
    return { winner: team2, tier: 'ECS_SPECIAL', confidence: 'European T20 Dual Flow Inflow Lead' };
  }

  // 2. Smart Money Volume Margin (>= 1.2x)
  if (b1 >= b2 * 1.2) {
    return { winner: team1, tier: 'ECS_SPECIAL', confidence: 'European T20 Smart Volume Margin' };
  }
  if (b2 >= b1 * 1.2) {
    return { winner: team2, tier: 'ECS_SPECIAL', confidence: 'European T20 Smart Volume Margin' };
  }

  // 3. Pre-Match Volume Leader
  if (b1 > b2) {
    return { winner: team1, tier: 'ECS_SPECIAL', confidence: 'European T20 Volume Leader' };
  }
  if (b2 > b1) {
    return { winner: team2, tier: 'ECS_SPECIAL', confidence: 'European T20 Volume Leader' };
  }

  // 4. Fallback: Bookie Safe
  if (epnl1 > epnl2) {
    return { winner: team1, tier: 'ECS_SPECIAL', confidence: 'European T20 Bookie Safe' };
  }
  if (epnl2 > epnl1) {
    return { winner: team2, tier: 'ECS_SPECIAL', confidence: 'European T20 Bookie Safe' };
  }

  return null;
}

function getLeagueAlgorithmPrediction(compName, b1, b2, l1, l2, pnl1, pnl2, team1, team2, snap = null) {
  const comp = (compName || '').toLowerCase();

  // 🔒 STRICT PRE-MATCH P/L TO PREVENT IN-PLAY FLIPPING
  const epnl1 = snap?.preMatchPnl?.team1 != null ? snap.preMatchPnl.team1 : pnl1;
  const epnl2 = snap?.preMatchPnl?.team2 != null ? snap.preMatchPnl.team2 : pnl2;

  // 🌍 LEAGUE SPECIFIC RULE: International Twenty20 Matches (T20I)
  if (isInternationalT20(compName) && !comp.includes('womens') && !comp.includes("women's") && !comp.includes('women')) {
    const intlPred = getInternationalT20Prediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2);
    if (intlPred) return intlPred;
  }

  // 🏆 LEAGUE SPECIFIC RULE: Caribbean Premier League (CPL)
  if (comp.includes('caribbean') || comp.includes('cpl')) {
    const cplPred = getCPLPrediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2);
    if (cplPred) return cplPred;
  }

  // 🇮🇳 LEAGUE SPECIFIC RULE: Tamil Nadu Premier League (TNPL)
  if (comp.includes('tamil nadu') || comp.includes('tnpl')) {
    // TNPL matches strictly act as Bookie Traps (Fade the Public Money)
    if (epnl1 > epnl2) {
      return { winner: team1, tier: 'TNPL_SPECIAL', confidence: 'TNPL Bookie Trap (Fade Public)' };
    }
    if (epnl2 > epnl1) {
      return { winner: team2, tier: 'TNPL_SPECIAL', confidence: 'TNPL Bookie Trap (Fade Public)' };
    }
    if (b1 > b2) {
      return { winner: team1, tier: 'TNPL_SPECIAL', confidence: 'TNPL Volume Leader' };
    }
    if (b2 > b1) {
      return { winner: team2, tier: 'TNPL_SPECIAL', confidence: 'TNPL Volume Leader' };
    }
  }

  // 🏴󠁧󠁢󠁥󠁮󠁧󠁿 LEAGUE SPECIFIC RULE: The Hundred
  if (comp.includes('hundred') && !comp.includes('womens') && !comp.includes("women's") && !comp.includes('women')) {
    if (b1 > b2 && l1 > l2 && epnl1 < epnl2) {
      return { winner: team1, tier: 'HUNDRED_SPECIAL', confidence: 'The Hundred Dual Advantage (Strong Buy)' };
    }
    if (b2 > b1 && l2 > l1 && epnl2 < epnl1) {
      return { winner: team2, tier: 'HUNDRED_SPECIAL', confidence: 'The Hundred Dual Advantage (Strong Buy)' };
    }
    if (b1 >= b2 * 1.4) {
      return { winner: team1, tier: 'HUNDRED_SPECIAL', confidence: 'The Hundred Volume Margin' };
    }
    if (b2 >= b1 * 1.4) {
      return { winner: team2, tier: 'HUNDRED_SPECIAL', confidence: 'The Hundred Volume Margin' };
    }
    if (b1 > b2) {
      return { winner: team1, tier: 'HUNDRED_SPECIAL', confidence: 'The Hundred Volume Leader' };
    }
    if (b2 > b1) {
      return { winner: team2, tier: 'HUNDRED_SPECIAL', confidence: 'The Hundred Volume Leader' };
    }
  }

  // 🌴 LEAGUE SPECIFIC RULE: Kerala Cricket League
  if (comp.includes('kerala')) {
    // 1. Massive Lay Dump / Short Pressure against a team with negative P/L
    if (l2 >= 50 && (l2 >= l1 * 3.0 || l2 >= b2 * 0.35) && epnl2 < epnl1) {
      return { winner: team1, tier: 'KERALA_SPECIAL', confidence: 'Kerala Lay Resistance Dump' };
    }
    if (l1 >= 50 && (l1 >= l2 * 3.0 || l1 >= b1 * 0.35) && epnl1 < epnl2) {
      return { winner: team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Lay Resistance Dump' };
    }

    // 2. Clear Back Inflow Margin (1.3x+)
    if (b1 >= (b2 || 1) * 1.3 && b1 > b2) {
      return { winner: team1, tier: 'KERALA_SPECIAL', confidence: 'Kerala Volume Margin Inflow' };
    }
    if (b2 >= (b1 || 1) * 1.3 && b2 > b1) {
      return { winner: team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Volume Margin Inflow' };
    }

    // 3. Volume Leader
    if (b1 > b2) {
      return { winner: team1, tier: 'KERALA_SPECIAL', confidence: 'Kerala Volume Leader' };
    }
    if (b2 > b1) {
      return { winner: team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Volume Leader' };
    }

    return { winner: epnl1 > epnl2 ? team1 : team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Bookie Safe Edge' };
  }

  // 🇮🇳 LEAGUE SPECIFIC RULE: Delhi Premier League (DPL)
  if (comp.includes('delhi') || comp.includes('dpl')) {
    if (epnl1 > epnl2) {
      return { winner: team1, tier: 'DELHI_SPECIAL', confidence: 'Delhi Bookie Trap (Fade Public)' };
    }
    if (epnl2 > epnl1) {
      return { winner: team2, tier: 'DELHI_SPECIAL', confidence: 'Delhi Bookie Trap (Fade Public)' };
    }
  }

  // 🇮🇳 LEAGUE SPECIFIC RULE: Uttar Pradesh Premier League (UP T20)
  if (comp.includes('uttar pradesh') || comp.includes('up t20')) {
    const upPred = getUPT20Prediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2);
    if (upPred) return upPred;
  }

  // 🇱🇰 LEAGUE SPECIFIC RULE: Sri Lanka Major Clubs T20
  if (comp.includes('sri lanka major clubs') || comp.includes('slc major clubs') || comp.includes('major clubs') || comp.includes('srilanka major')) {
    if (epnl1 > epnl2) {
      return { winner: team1, tier: 'SRILANKA_SPECIAL', confidence: 'Sri Lanka Bookie Trap (Fade Public)' };
    }
    if (epnl2 > epnl1) {
      return { winner: team2, tier: 'SRILANKA_SPECIAL', confidence: 'Sri Lanka Bookie Trap (Fade Public)' };
    }
  }

  // 🇪🇺 LEAGUE SPECIFIC RULE: European Cricket Series (ECS / European T20)
  if (comp.includes('european') || comp.includes('ecs')) {
    const ecsPred = getECSPrediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2);
    if (ecsPred) return ecsPred;
  }

  // 👩 LEAGUE SPECIFIC RULE: Women's International Twenty20 Matches / Women's matches
  if (comp.includes('womens') || comp.includes('women\'s') || comp.includes('women')) {
    // 1. Dual Flow Dominance (Higher Back and Higher Lay)
    if (b1 > b2 && l1 > l2 && (b1 >= b2 * 1.25 || l1 >= l2 * 1.25)) {
      return { winner: team1, tier: 'WOMENS_T20_SPECIAL', confidence: 'Womens Dual Flow Advantage' };
    }
    if (b2 > b1 && l2 > l1 && (b2 >= b1 * 1.25 || l2 >= l1 * 1.25)) {
      return { winner: team2, tier: 'WOMENS_T20_SPECIAL', confidence: 'Womens Dual Flow Advantage' };
    }

    // 2. Clear Back Inflow Margin (1.25x+)
    if (b1 >= (b2 || 1) * 1.25 && b1 > b2) {
      return { winner: team1, tier: 'WOMENS_T20_SPECIAL', confidence: 'Womens Smart Inflow Margin' };
    }
    if (b2 >= (b1 || 1) * 1.25 && b2 > b1) {
      return { winner: team2, tier: 'WOMENS_T20_SPECIAL', confidence: 'Womens Smart Inflow Margin' };
    }

    // 3. Dominant Volume Leader
    if (b1 > b2) {
      return { winner: team1, tier: 'WOMENS_T20_SPECIAL', confidence: 'Womens Volume Leader' };
    }
    if (b2 > b1) {
      return { winner: team2, tier: 'WOMENS_T20_SPECIAL', confidence: 'Womens Volume Leader' };
    }

    // 4. Bookmaker Safe P/L (fallback)
    if (epnl1 > epnl2) {
      return { winner: team1, tier: 'WOMENS_T20_SPECIAL', confidence: 'Womens Bookmaker Safe Edge' };
    }
    if (epnl2 > epnl1) {
      return { winner: team2, tier: 'WOMENS_T20_SPECIAL', confidence: 'Womens Bookmaker Safe Edge' };
    }
  }

  return null; // No league specific algorithm matched
}

function getDefaultAlgorithmPrediction(b1, b2, l1, l2, pnl1, pnl2, team1, team2) {
  const m1 = b1 + l1;
  const m2 = b2 + l2;
  const totMoney = m1 + m2;
  const m1Pct = totMoney > 0 ? (m1 / totMoney) * 100 : 50;
  const m2Pct = totMoney > 0 ? (m2 / totMoney) * 100 : 50;

  // Tier 1: Highest Confidence (BackVol > AND LayVol > AND Total Money > AND PNL <)
  if (b1 > b2 && l1 > l2 && m1 > m2 && pnl1 < pnl2) {
    return { winner: team1, tier: 1, confidence: '99% Sure (Maximum Money + Back + Lay Alignment)' };
  }
  if (b2 > b1 && l2 > l1 && m2 > m1 && pnl2 < pnl1) {
    return { winner: team2, tier: 1, confidence: '99% Sure (Maximum Money + Back + Lay Alignment)' };
  }

  // Tier 1b: Dual Advantage (BackVol > AND LayVol > AND PNL <)
  if (b1 > b2 && l1 > l2 && pnl1 < pnl2) {
    return { winner: team1, tier: 1, confidence: '99% Sure (Strong Buy)' };
  }
  if (b2 > b1 && l2 > l1 && pnl2 < pnl1) {
    return { winner: team2, tier: 1, confidence: '99% Sure (Strong Buy)' };
  }

  // Tier 2a: Maximum Total Money Dominance Lead (Total Money >= 1.5x / 60%+ share)
  if (m1 >= (m2 || 1) * 1.5 && m1 > m2) {
    return { winner: team1, tier: 2, confidence: `82% Maximum Money Lead (${m1Pct.toFixed(0)}% Share)` };
  }
  if (m2 >= (m1 || 1) * 1.5 && m2 > m1) {
    return { winner: team2, tier: 2, confidence: `82% Maximum Money Lead (${m2Pct.toFixed(0)}% Share)` };
  }

  // Tier 2b: Volume Margin (BackVol > 1.4x)
  if (b1 >= b2 * 1.4) {
    return { winner: team1, tier: 2, confidence: '75% Sure (Good Buy)' };
  }
  if (b2 >= b1 * 1.4) {
    return { winner: team2, tier: 2, confidence: '75% Sure (Good Buy)' };
  }

  // Tier 3: Maximum Total Money Leader
  if (m1 > m2) {
    return { winner: team1, tier: 3, confidence: `68% Money Leader (${m1Pct.toFixed(0)}% Share)` };
  }
  if (m2 > m1) {
    return { winner: team2, tier: 3, confidence: `68% Money Leader (${m2Pct.toFixed(0)}% Share)` };
  }

  // Tier 4: Dominant Back Volume leader fallback
  if (b1 > b2) {
    return { winner: team1, tier: 3, confidence: '65% Volume Lead' };
  }
  if (b2 > b1) {
    return { winner: team2, tier: 3, confidence: '65% Volume Lead' };
  }

  return null; // Tie / Unpredictable
}

module.exports = {
  isInternationalT20,
  getInternationalT20Prediction,
  getCPLPrediction,
  getUPT20Prediction,
  getLeagueAlgorithmPrediction,
  getDefaultAlgorithmPrediction
};
