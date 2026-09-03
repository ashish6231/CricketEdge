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
  const preBetCount1 = preBets.team1 != null ? preBets.team1 : (snap?.advancedMetricsV2?.team1?.totalBet ?? snap?.deepMetrics?.totals?.totalBetTeam1 ?? snap?.teams?.[team1]?.totalBet ?? null);
  const preBetCount2 = preBets.team2 != null ? preBets.team2 : (snap?.advancedMetricsV2?.team2?.totalBet ?? snap?.deepMetrics?.totals?.totalBetTeam2 ?? snap?.teams?.[team2]?.totalBet ?? null);

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
  const tot1 = b1 + l1;
  const tot2 = b2 + l2;
  const maxBack = Math.max(b1, b2);
  const minBack = Math.min(b1, b2);
  const backRatio = minBack > 0 ? maxBack / minBack : (maxBack > 0 ? 99 : 1);
  const pnlDiff = Math.abs(epnl1 - epnl2);

  const pb1 = snap?.preMatchTotalBets?.team1 ?? snap?.advancedMetricsV2?.team1?.totalBet ?? 0;
  const pb2 = snap?.preMatchTotalBets?.team2 ?? snap?.advancedMetricsV2?.team2?.totalBet ?? 0;

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 1 — 🚨 Massive Lay Dump on Favorite Fade
  //   Favorite is shorted heavily (Lay >= 15k & Lay >= 1.7x Back & Lay >= opponent Lay * 2.0).
  //   Smart money heavily short-sells the favorite in the lay market, creating massive resistance.
  // ─────────────────────────────────────────────────────────────────────────
  if (l1 >= 15000 && l1 >= b1 * 1.7 && l1 >= l2 * 2.0) {
    return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Favorite Short Resistance Fade' };
  }
  if (l2 >= 15000 && l2 >= b2 * 1.7 && l2 >= l1 * 2.0) {
    return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Favorite Short Resistance Fade' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 2 — 🛡️ Massive Lay Absorption Shield & Volume Dominance
  //   Bookmaker scooped heavy lay on team (l >= 2000 & 3x+ opponent lay) with
  //   total volume dominance (2.0x+) and positive bookmaker PnL (>1000).
  // ─────────────────────────────────────────────────────────────────────────
  if (l1 >= 2000 && l1 >= l2 * 3.0 && tot1 >= tot2 * 2.0 && epnl1 > 1000 && pb1 >= 500) {
    return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Lay Shield & Volume Dominance' };
  }
  if (l2 >= 2000 && l2 >= l1 * 3.0 && tot2 >= tot1 * 2.0 && epnl2 > 1000 && pb2 >= 500) {
    return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Lay Shield & Volume Dominance' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 3 — 📉 Heavy Lay Resistance Short Dump on Underdog
  //   Underdog has severe Lay dump (Lay >= 3x Back & Lay >= 500), while the
  //   favorite has strong Back volume (>= 2x underdog back).
  // ─────────────────────────────────────────────────────────────────────────
  if (l1 >= b1 * 3.0 && l1 >= 500 && b2 >= b1 * 2.0) {
    return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Lay Resistance Dump Short' };
  }
  if (l2 >= b2 * 3.0 && l2 >= 500 && b1 >= b2 * 2.0) {
    return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Lay Resistance Dump Short' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 4 — 🌊 Dual Flow Blowout Inflow (Smart Money Accumulation)
  //   One team dominates both Back (>= 2.5x) and Lay (>= 1.5x) with massive
  //   overall liquidity (>= 20k volume).
  // ─────────────────────────────────────────────────────────────────────────
  if (b1 >= b2 * 2.5 && l1 >= l2 * 1.5 && tot1 >= 20000) {
    return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Dual Flow Blowout Inflow' };
  }
  if (b2 >= b1 * 2.5 && l2 >= l1 * 1.5 && tot2 >= 20000) {
    return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Dual Flow Blowout Inflow' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 5 — 🚨 Severe Public Overload Shielded Trap Fade
  //   Heavy retail favorite (Back >= 3x), but underdog has Lay Shield
  //   (Lay >= 1.5x Back) and Bookie PnL >= 2000 with favorite in deficit.
  // ─────────────────────────────────────────────────────────────────────────
  if (b2 >= b1 * 3.0 && l1 >= b1 * 1.5 && epnl1 >= 2000 && epnl2 < 0) {
    return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Shielded Public Overload Trap Fade' };
  }
  if (b1 >= b2 * 3.0 && l2 >= b2 * 1.5 && epnl2 >= 2000 && epnl1 < 0) {
    return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Shielded Public Overload Trap Fade' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 6 — 💰 Moderate Public Overload Trap Fade
  //   Back ratio between 1.5x and 2.5x, but Bookmaker in strong deficit on
  //   the back leader and profits significantly (gap >= 1000) from underdog.
  // ─────────────────────────────────────────────────────────────────────────
  if (backRatio >= 1.5 && backRatio <= 2.5 && pnlDiff >= 1000) {
    if (b2 > b1 && epnl2 < 0 && epnl1 > 0) {
      return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Bookmaker Trap (Fade Public Favorite)' };
    }
    if (b1 > b2 && epnl1 < 0 && epnl2 > 0) {
      return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Bookmaker Trap (Fade Public Favorite)' };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 7 — 📊 Back Volume Leader (Default Core Signal)
  // ─────────────────────────────────────────────────────────────────────────
  if (b1 > b2) {
    return { winner: team1, tier: 'CPL_SPECIAL', confidence: 'CPL Back Volume Leader' };
  }
  if (b2 > b1) {
    return { winner: team2, tier: 'CPL_SPECIAL', confidence: 'CPL Back Volume Leader' };
  }

  // Fallback
  return { winner: epnl1 > epnl2 ? team1 : team2, tier: 'CPL_SPECIAL', confidence: 'CPL Safe PnL Fallback' };
}


// 🇮🇳 Uttar Pradesh Premier League (UP T20) Algorithm
function getUPT20Prediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2) {
  const preBets = snap?.preMatchTotalBets || {};
  const preBetCount1 = preBets.team1 != null ? preBets.team1 : (snap?.advancedMetricsV2?.team1?.totalBet ?? null);
  const preBetCount2 = preBets.team2 != null ? preBets.team2 : (snap?.advancedMetricsV2?.team2?.totalBet ?? null);

  const preVol = snap?.preMatchVolume || {};
  const preBack1 = preVol.team1?.back ?? b1 ?? 0;
  const preLay1 = preVol.team1?.lay ?? l1 ?? 0;
  const preBack2 = preVol.team2?.back ?? b2 ?? 0;
  const preLay2 = preVol.team2?.lay ?? l2 ?? 0;

  const prePnl = snap?.preMatchPnl || {};
  const pnl1 = prePnl.team1 != null ? prePnl.team1 : epnl1;
  const pnl2 = prePnl.team2 != null ? prePnl.team2 : epnl2;
  const pnlDiff = Math.abs(pnl1 - pnl2);

  // 1. Extreme Lay Shield / Resistance Dump & Bookmaker Deficit Fortress
  if (preLay1 >= 50 && (preLay1 >= preLay2 * 2.0 || preLay1 >= preBack1 * 1.5) && (pnl1 > pnl2 || pnl2 < -50)) {
    return { winner: team1, tier: 'UP_SPECIAL', confidence: 'UP Bookmaker Lay Shield' };
  }
  if (preLay2 >= 50 && (preLay2 >= preLay1 * 2.0 || preLay2 >= preBack2 * 1.5) && (pnl2 > pnl1 || pnl1 < -50)) {
    return { winner: team2, tier: 'UP_SPECIAL', confidence: 'UP Bookmaker Lay Shield' };
  }
  if (pnlDiff >= 150 && (pnl1 < -50 || pnl2 < -50)) {
    return { winner: pnl1 > pnl2 ? team1 : team2, tier: 'UP_SPECIAL', confidence: 'UP Bookie Trap Fortress' };
  }

  // 2. Pre-Match Total Bets / Activity Engagement Lead (>= 1.3x Bet Count Lead)
  if (preBetCount1 != null && preBetCount2 != null && (preBetCount1 > 0 || preBetCount2 > 0) && preBetCount1 !== preBetCount2) {
    if (preBetCount1 >= preBetCount2 * 1.3 && preBetCount1 >= 10) {
      return { winner: team1, tier: 'UP_SPECIAL', confidence: 'UP Pre-Match Activity Lead' };
    }
    if (preBetCount2 >= preBetCount1 * 1.3 && preBetCount2 >= 10) {
      return { winner: team2, tier: 'UP_SPECIAL', confidence: 'UP Pre-Match Activity Lead' };
    }
  }

  // 3. Pre-Match Clean Back Inflow Margin (>= 1.2x)
  if (preBack1 >= (preBack2 || 1) * 1.2 && preBack1 > preBack2) {
    return { winner: team1, tier: 'UP_SPECIAL', confidence: 'UP Smart Volume Margin' };
  }
  if (preBack2 >= (preBack1 || 1) * 1.2 && preBack2 > preBack1) {
    return { winner: team2, tier: 'UP_SPECIAL', confidence: 'UP Smart Volume Margin' };
  }

  // 4. Pre-Match Back Volume Leader
  if (preBack1 > preBack2) {
    return { winner: team1, tier: 'UP_SPECIAL', confidence: 'UP Volume Leader' };
  }
  if (preBack2 > preBack1) {
    return { winner: team2, tier: 'UP_SPECIAL', confidence: 'UP Volume Leader' };
  }

  // 5. Significant Bookie Profit Side (Deficit fade)
  if (pnlDiff >= 50 && (pnl1 < 0 || pnl2 < 0)) {
    return { winner: pnl1 > pnl2 ? team1 : team2, tier: 'UP_SPECIAL', confidence: 'UP Bookie Trap (Fade Public)' };
  }

  // 6. Fallback Safe PnL Edge
  return { winner: pnl1 > pnl2 ? team1 : team2, tier: 'UP_SPECIAL', confidence: 'UP Bookie Safe Edge' };
}

// 🌴 Kerala Cricket League Algorithm
function getKeralaPrediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2) {
  const preBets = snap?.preMatchTotalBets || {};
  const preBetCount1 = preBets.team1 != null ? preBets.team1 : (snap?.advancedMetricsV2?.team1?.totalBet ?? null);
  const preBetCount2 = preBets.team2 != null ? preBets.team2 : (snap?.advancedMetricsV2?.team2?.totalBet ?? null);

  const sup1 = snap?.supportMetrics?.team1?.supportMoney || 0;
  const sup2 = snap?.supportMetrics?.team2?.supportMoney || 0;
  const totSup = sup1 + sup2;
  const sup1Pct = totSup > 0 ? (sup1 / totSup) * 100 : 50;
  const sup2Pct = totSup > 0 ? (sup2 / totSup) * 100 : 50;

  // 1. Extreme Pre-Match Lay Dump / Short Resistance
  if (l1 >= 50 && (l1 >= l2 * 2.5 || l1 >= b1 * 0.4 || l1 >= b1 * 1.8) && (epnl1 < epnl2 || epnl1 < 0 || l1 > l2 * 3.0)) {
    return { winner: team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Lay Resistance Dump' };
  }
  if (l2 >= 50 && (l2 >= l1 * 2.5 || l2 >= b2 * 0.4 || l2 >= b2 * 1.8) && (epnl2 < epnl1 || epnl2 < 0 || l2 > l1 * 3.0)) {
    return { winner: team1, tier: 'KERALA_SPECIAL', confidence: 'Kerala Lay Resistance Dump' };
  }

  // 2. Pre-Match Market Activity / Trade Count Engagement (>= 1.4x Bet Count Lead)
  if (preBetCount1 != null && preBetCount2 != null && (preBetCount1 > 0 || preBetCount2 > 0) && preBetCount1 !== preBetCount2) {
    if (preBetCount1 >= preBetCount2 * 1.4 && preBetCount1 >= 25) {
      return { winner: team1, tier: 'KERALA_SPECIAL', confidence: 'Kerala Pre-Match Activity Lead' };
    }
    if (preBetCount2 >= preBetCount1 * 1.4 && preBetCount2 >= 25) {
      return { winner: team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Pre-Match Activity Lead' };
    }
  }

  // 3. Pre-Match Clean Back Inflow Margin (1.25x+ without high lay resistance)
  if (b1 >= (b2 || 1) * 1.25 && b1 > b2 && l1 < b1 * 1.5) {
    return { winner: team1, tier: 'KERALA_SPECIAL', confidence: 'Kerala Volume Margin Inflow' };
  }
  if (b2 >= (b1 || 1) * 1.25 && b2 > b1 && l2 < b2 * 1.5) {
    return { winner: team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Volume Margin Inflow' };
  }

  // 4. Pre-Match Back Volume Leader (without high lay resistance)
  if (b1 > b2 && l1 < b1 * 1.5 && (b1 > 0 || b2 > 0)) {
    return { winner: team1, tier: 'KERALA_SPECIAL', confidence: 'Kerala Volume Leader' };
  }
  if (b2 > b1 && l2 < b2 * 1.5 && (b1 > 0 || b2 > 0)) {
    return { winner: team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Volume Leader' };
  }

  // 5. Bookie Safe Stance (when deficit exists on one team)
  if (epnl1 !== epnl2 && (epnl1 < 0 || epnl2 < 0)) {
    return { winner: epnl1 > epnl2 ? team1 : team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Bookie Trap (Fade Public)' };
  }

  // 6. Strong Support Money Majority (>= 58% Support Share)
  if (totSup >= 50000) {
    if (sup1Pct >= 58) {
      return { winner: team1, tier: 'KERALA_SPECIAL', confidence: 'Kerala Market Support Majority' };
    }
    if (sup2Pct >= 58) {
      return { winner: team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Market Support Majority' };
    }
  }

  // 7. Bookie Safe Fallback
  return { winner: epnl1 > epnl2 ? team1 : team2, tier: 'KERALA_SPECIAL', confidence: 'Kerala Bookie Safe Edge' };
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

// 🦁 Sher E Punjab T20 League Algorithm (Bookie Trap & Inflow Dynamic)
function getSherEPunjabPrediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2) {
  const prePnl = snap?.preMatchPnl || {};
  const prePnl1 = prePnl.team1 != null ? prePnl.team1 : epnl1;
  const prePnl2 = prePnl.team2 != null ? prePnl.team2 : epnl2;

  const sp = snap?.deepMetrics?.simplePL || {};
  const t1Pnl = prePnl1 != null ? prePnl1 : (sp.team1_win ?? (snap?.teams?.[team1]?.pnlIfWins ?? (l1 - b1)));
  const t2Pnl = prePnl2 != null ? prePnl2 : (sp.team2_win ?? (snap?.teams?.[team2]?.pnlIfWins ?? (l2 - b2)));

  // 1. 📉 Lay Resistance Dump / Short Fade (One team has heavy lay dump >= 50 & >= 1.5x its back, other team has clean back)
  // e.g. Bathinda vs Ludhiana: Bathinda has ₹74 Lay vs ₹0 on Ludhiana -> Faded to Ludhiana Lion
  if (l1 >= 50 && l1 >= b1 * 1.5 && b2 > b1 && l2 <= 20) {
    return { winner: team2, tier: 'PUNJAB_SPECIAL', confidence: 'Sher-e-Punjab Lay Resistance Dump (Fade to Clean Inflow)' };
  }
  if (l2 >= 50 && l2 >= b2 * 1.5 && b1 > b2 && l1 <= 20) {
    return { winner: team1, tier: 'PUNJAB_SPECIAL', confidence: 'Sher-e-Punjab Lay Resistance Dump (Fade to Clean Inflow)' };
  }

  // 2. 🛡️ Lay Absorption Shield (Underdog has lay absorption >= 25 & >= 3x its back, retail naked overload on favorite >= 5x)
  // e.g. Mohali (₹106 Back, ₹0 Lay) vs Bathinda (₹7 Back, ₹36 Lay, +156 PnL) -> Bathinda wins!
  if (l1 >= 25 && l1 >= b1 * 3.0 && t1Pnl > 0 && t2Pnl < 0 && b2 >= b1 * 5.0) {
    return { winner: team1, tier: 'PUNJAB_SPECIAL', confidence: 'Sher-e-Punjab Lay Shield (Lay Absorbed)' };
  }
  if (l2 >= 25 && l2 >= b2 * 3.0 && t2Pnl > 0 && t1Pnl < 0 && b1 >= b2 * 5.0) {
    return { winner: team2, tier: 'PUNJAB_SPECIAL', confidence: 'Sher-e-Punjab Lay Shield (Lay Absorbed)' };
  }

  // 3. 🛡️ Heavy Lay Absorption Shield & Total Bet Activity Lead
  // e.g. Match 36015901: Jalandhar has Lay ₹2160 (3x lay absorption) & 3455 Total Bet vs Amritsar ₹701 Lay & 2422 Total Bet
  const totBet1 = snap?.advancedMetricsV2?.team1?.totalBet ?? (snap?.preMatchTotalBets?.team1 ?? (b1 + l1));
  const totBet2 = snap?.advancedMetricsV2?.team2?.totalBet ?? (snap?.preMatchTotalBets?.team2 ?? (b2 + l2));
  const snapL1 = snap?.advancedMetricsV2?.team1?.lay ?? l1;
  const snapL2 = snap?.advancedMetricsV2?.team2?.lay ?? l2;

  if (snapL1 >= 500 && snapL1 >= snapL2 * 1.5 && totBet1 > totBet2) {
    return { winner: team1, tier: 'PUNJAB_SPECIAL', confidence: 'Sher-e-Punjab Lay Shield & Activity Lead' };
  }
  if (snapL2 >= 500 && snapL2 >= snapL1 * 1.5 && totBet2 > totBet1) {
    return { winner: team2, tier: 'PUNJAB_SPECIAL', confidence: 'Sher-e-Punjab Lay Shield & Activity Lead' };
  }

  // 4. Primary Rule: Strict Bookie Profit Side (Fade Public Overload)
  if (t1Pnl !== t2Pnl && (t1Pnl < 0 || t2Pnl < 0)) {
    if (t1Pnl > t2Pnl) {
      return { winner: team1, tier: 'PUNJAB_SPECIAL', confidence: 'Sher-e-Punjab Bookie Trap (Fade Public)' };
    }
    if (t2Pnl > t1Pnl) {
      return { winner: team2, tier: 'PUNJAB_SPECIAL', confidence: 'Sher-e-Punjab Bookie Trap (Fade Public)' };
    }
  }

  // 4. Underdog Trap Fade (Lower Back Volume Side)
  if (b1 < b2 && b1 > 0) {
    return { winner: team1, tier: 'PUNJAB_SPECIAL', confidence: 'Sher-e-Punjab Underdog Trap Fade' };
  }
  if (b2 < b1 && b2 > 0) {
    return { winner: team2, tier: 'PUNJAB_SPECIAL', confidence: 'Sher-e-Punjab Underdog Trap Fade' };
  }

  // 5. Fallback: Safe PnL Edge
  return { winner: t1Pnl > t2Pnl ? team1 : team2, tier: 'PUNJAB_SPECIAL', confidence: 'Sher-e-Punjab Bookie Trap (Fade Public)' };
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
    return getKeralaPrediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2);
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

  // 🦁 LEAGUE SPECIFIC RULE: Sher E Punjab T20 League
  if (comp.includes('punjab') || comp.includes('sher e punjab') || comp.includes('sher-e-punjab')) {
    const punjabPred = getSherEPunjabPrediction(snap, b1, b2, l1, l2, epnl1, epnl2, team1, team2);
    if (punjabPred) return punjabPred;
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
  getKeralaPrediction,
  getSherEPunjabPrediction,
  getLeagueAlgorithmPrediction,
  getDefaultAlgorithmPrediction
};
