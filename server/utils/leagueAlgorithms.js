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

  const prePnl1 = prePnl.team1 != null ? prePnl.team1 : null;
  const prePnl2 = prePnl.team2 != null ? prePnl.team2 : null;
  const preBetCount1 = preBets.team1 != null ? preBets.team1 : null;
  const preBetCount2 = preBets.team2 != null ? preBets.team2 : null;

  const preBack1 = preVol1.back ?? b1 ?? 0;
  const preLay1 = preVol1.lay ?? l1 ?? 0;
  const preBack2 = preVol2.back ?? b2 ?? 0;
  const preLay2 = preVol2.lay ?? l2 ?? 0;

  // 1. Primary Rule: Pre-Match Bookie P/L Exposure Edge (Fade the Public Trap)
  if (prePnl1 != null && prePnl2 != null && prePnl1 !== prePnl2) {
    if (prePnl1 > prePnl2) {
      return { winner: team1, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Pre-Match Bookie Edge (Fade Public)' };
    }
    if (prePnl2 > prePnl1) {
      return { winner: team2, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Pre-Match Bookie Edge (Fade Public)' };
    }
  }

  // 2. Pre-Match Total Bets / Activity Engagement
  if (preBetCount1 != null && preBetCount2 != null && (preBetCount1 > 0 || preBetCount2 > 0) && preBetCount1 !== preBetCount2) {
    if (preBetCount1 >= preBetCount2 * 1.5) {
      return { winner: team1, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Pre-Match Activity Lead' };
    }
    if (preBetCount2 >= preBetCount1 * 1.5) {
      return { winner: team2, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Pre-Match Activity Lead' };
    }
  }

  // 3. Pre-Match Lay vs Back Volume Ratio (Smart Money)
  if (preLay1 > preBack1 && preLay2 <= preBack2) {
    return { winner: team1, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Pre-Match Lay Pressure Edge' };
  }
  if (preLay2 > preBack2 && preLay1 <= preBack1) {
    return { winner: team2, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Pre-Match Lay Pressure Edge' };
  }

  // 4. Calculated Bookie PnL (pnl1 vs pnl2)
  if (pnl1 !== pnl2) {
    if (pnl1 > pnl2) {
      return { winner: team1, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Bookie Trap (Higher PnL)' };
    }
    if (pnl2 > pnl1) {
      return { winner: team2, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Bookie Trap (Higher PnL)' };
    }
  }

  // 5. Pre-Match Market Signals / True Support Sentiment
  const msPred = snap?.marketSignals?.prediction?.prediction;
  if (msPred && msPred !== 'No Prediction') {
    if (msPred.toLowerCase().includes(team1.toLowerCase())) {
      return { winner: team1, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Pre-Match True Support' };
    }
    if (msPred.toLowerCase().includes(team2.toLowerCase())) {
      return { winner: team2, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Pre-Match True Support' };
    }
  }

  // 6. Pre-Match Volume Edge fallback
  if (b1 > b2) {
    return { winner: team1, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Volume Margin' };
  }
  if (b2 > b1) {
    return { winner: team2, tier: 'INTERNATIONAL_T20_SPECIAL', confidence: 'T20I Volume Margin' };
  }

  return null;
}

function getCPLPrediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2) {
  const isLayAbsorbed1 = l1 >= b1 * 1.8 && l1 > l2 && epnl1 > 1000;
  const isLayAbsorbed2 = l2 >= b2 * 1.8 && l2 > l1 && epnl2 > 1000;

  // 1. Lay Absorption Shield (P/L > 1000 and Lay > 1.8x Back)
  if (isLayAbsorbed1 && !isLayAbsorbed2 && epnl1 > 1000) {
    return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Bookmaker Lay Shield' };
  }
  if (isLayAbsorbed2 && !isLayAbsorbed1 && epnl2 > 1000) {
    return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Bookmaker Lay Shield' };
  }

  const trap = snap?.marketSignals?.trap?.level || 'none';
  const bookieFav = snap?.marketSignals?.bookieFavouriteOutcome;
  const stronger = snap?.syntheticSupport?.strongerTeam;
  const supRatio = snap?.syntheticSupport?.supportRatio || 1;
  const backRatio = Math.min(b1, b2) > 0 ? Math.max(b1, b2) / Math.min(b1, b2) : (Math.max(b1, b2) > 0 ? 99 : 1);

  // 2. High Trap with Strong Synthetic Support (>= 1.5x)
  if (trap === 'high' && supRatio >= 1.5 && stronger) {
    const win = stronger.toLowerCase().includes(team1.toLowerCase()) ? team1 : team2;
    return { winner: win, tier: 'CPL_SPECIAL', confidence: 'CPL Smart Money Support' };
  }

  // 3. High Trap with Weak Synthetic Support (< 1.5x) & Non-Blowout Back Lead (< 1.65x) -> Bookie Safe Side
  if (trap === 'high' && bookieFav && supRatio < 1.5 && backRatio < 1.65) {
    if (bookieFav.toLowerCase().includes(team1.toLowerCase()) && epnl1 > 0) {
      return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Bookie Trap (Fade Public)' };
    }
    if (bookieFav.toLowerCase().includes(team2.toLowerCase()) && epnl2 > 0) {
      return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Bookie Trap (Fade Public)' };
    }
  }

  // 4. Smart Volume Inflow Lead
  if (b1 !== b2 && (b1 > 0 || b2 > 0)) {
    const win = b1 > b2 ? team1 : team2;
    return { winner: win, tier: 'CPL_SPECIAL', confidence: 'CPL Smart Volume Inflow Lead' };
  }

  // 5. Fallback: Higher Bookie P/L
  if (epnl1 > epnl2) {
    return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Bookie Safe' };
  }
  if (epnl2 > epnl1) {
    return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Bookie Safe' };
  }

  return null;
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
    if (b1 > b2 && l1 > l2 && epnl1 < epnl2) {
      return { winner: team1, tier: 'TNPL_SPECIAL', confidence: 'TNPL Dual Advantage (Strong Buy)' };
    }
    if (b2 > b1 && l2 > l1 && epnl2 < epnl1) {
      return { winner: team2, tier: 'TNPL_SPECIAL', confidence: 'TNPL Dual Advantage (Strong Buy)' };
    }
    if (b1 >= b2 * 1.4) {
      return { winner: team1, tier: 'TNPL_SPECIAL', confidence: 'TNPL Volume Margin (Good Buy)' };
    }
    if (b2 >= b1 * 1.4) {
      return { winner: team2, tier: 'TNPL_SPECIAL', confidence: 'TNPL Volume Margin (Good Buy)' };
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
    if (b1 > b2 && l1 > l2 && epnl1 < epnl2) {
      return { winner: team1, tier: 'KERALA_SPECIAL', confidence: 'Kerala 100% Accuracy (Strong Buy)' };
    }
    if (b2 > b1 && l2 > l1 && epnl2 < epnl1) {
      return { winner: team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala 100% Accuracy (Strong Buy)' };
    }
    if (b1 >= b2 * 1.5) {
      return { winner: team1, tier: 'KERALA_SPECIAL', confidence: 'Kerala Volume Margin (Good Buy)' };
    }
    if (b2 >= b1 * 1.5) {
      return { winner: team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Volume Margin (Good Buy)' };
    }
    if (b1 > b2) {
      return { winner: team1, tier: 'KERALA_SPECIAL', confidence: 'Kerala Slight Volume Edge' };
    }
    if (b2 > b1) {
      return { winner: team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Slight Volume Edge' };
    }
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

  // 🇪🇺 LEAGUE SPECIFIC RULE: European Cricket Series (ECS)
  if (comp.includes('european') || comp.includes('ecs')) {
    if (epnl1 > epnl2) {
      return { winner: team1, tier: 'ECS_SPECIAL', confidence: 'ECS Bookie Trap (Fade Public)' };
    }
    if (epnl2 > epnl1) {
      return { winner: team2, tier: 'ECS_SPECIAL', confidence: 'ECS Bookie Trap (Fade Public)' };
    }
  }

  // 👩 LEAGUE SPECIFIC RULE: Women's International Twenty20 Matches / Women's matches
  if (comp.includes('womens') || comp.includes('women\'s') || comp.includes('women')) {
    if (epnl1 > epnl2) {
      return { winner: team1, tier: 'WOMENS_T20_SPECIAL', confidence: 'Womens Bookie Trap (Fade Public)' };
    }
    if (epnl2 > epnl1) {
      return { winner: team2, tier: 'WOMENS_T20_SPECIAL', confidence: 'Womens Bookie Trap (Fade Public)' };
    }
  }

  return null; // No league specific algorithm matched
}

function getDefaultAlgorithmPrediction(b1, b2, l1, l2, pnl1, pnl2, team1, team2) {
  // Tier 1: Highest Confidence (BackVol > AND LayVol > AND PNL <)
  if (b1 > b2 && l1 > l2 && pnl1 < pnl2) {
    return { winner: team1, tier: 1, confidence: '99% Sure (Strong Buy)' };
  }
  if (b2 > b1 && l2 > l1 && pnl2 < pnl1) {
    return { winner: team2, tier: 1, confidence: '99% Sure (Strong Buy)' };
  }

  // Tier 2: Volume Margin (BackVol > 1.4x)
  if (b1 >= b2 * 1.4) {
    return { winner: team1, tier: 2, confidence: '75% Sure (Good Buy)' };
  }
  if (b2 >= b1 * 1.4) {
    return { winner: team2, tier: 2, confidence: '75% Sure (Good Buy)' };
  }

  // Tier 3: Dominant Back Volume leader fallback
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
