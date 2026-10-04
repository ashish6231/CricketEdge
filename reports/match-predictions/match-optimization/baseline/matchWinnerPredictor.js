const { getLeagueAlgorithmPrediction, getDefaultAlgorithmPrediction } = require('./leagueAlgorithms');

// Memory cache to freeze volume metrics at match start, preventing prediction flips
const preMatchVolumeCache = new Map();

function predictMatchWinner(snap) {
  if (!snap || !snap.teamNames || snap.teamNames.length < 2) {
    return null;
  }

  const team1 = snap.teamNames[0];
  const team2 = snap.teamNames[1];
  const matchId = snap.matchId;

  let b1 = 0, b2 = 0, l1 = 0, l2 = 0, pnl1 = 0, pnl2 = 0;

  if (matchId && preMatchVolumeCache.has(matchId)) {
    const cached = preMatchVolumeCache.get(matchId);
    b1 = cached.b1; b2 = cached.b2; l1 = cached.l1; l2 = cached.l2;
    pnl1 = cached.pnl1; pnl2 = cached.pnl2;
  } else {
    // Always use pre-match volume — never live trades
    const pmv1 = snap.preMatchVolume?.team1;
    const pmv2 = snap.preMatchVolume?.team2;
    const m1 = pmv1 || snap.advancedMetricsV2?.team1 || snap.advancedMetrics?.team1;
    const m2 = pmv2 || snap.advancedMetricsV2?.team2 || snap.advancedMetrics?.team2;

    b1 = m1?.back || 0;
    b2 = m2?.back || 0;
    l1 = m1?.lay || 0;
    l2 = m2?.lay || 0;

    // Always use pre-match PnL — never live pnlIfWins
    const prePnl1 = snap?.preMatchPnl?.team1;
    const prePnl2 = snap?.preMatchPnl?.team2;
    const sp = snap.deepMetrics?.simplePL || {};

    if (prePnl1 != null && prePnl2 != null) {
      pnl1 = prePnl1;
      pnl2 = prePnl2;
    } else if (sp.team1_win != null) {
      pnl1 = sp.team1_win;
      pnl2 = sp.team2_win ?? 0;
    } else {
      pnl1 = (l1 - b1) + (b2 - l2);
      pnl2 = (l2 - b2) + (b1 - l1);
    }

    // Freeze it on the very first call!
    if (matchId) {
      preMatchVolumeCache.set(matchId, { b1, b2, l1, l2, pnl1, pnl2 });
    }
  }

  const compName = (snap.competitionName || '');
  
  // Try league specific algorithms first
  const leaguePred = getLeagueAlgorithmPrediction(compName, b1, b2, l1, l2, pnl1, pnl2, team1, team2, snap);
  
  console.log(`[PREDICT_DEBUG] Match: ${team1} vs ${team2} | b1:${b1} b2:${b2} l1:${l1} l2:${l2} pnl1:${pnl1} pnl2:${pnl2}`);
  console.log(`[PREDICT_DEBUG] LeaguePred:`, leaguePred);

  if (leaguePred) return leaguePred;

  // Fallback to default algorithm
  const defPred = getDefaultAlgorithmPrediction(b1, b2, l1, l2, pnl1, pnl2, team1, team2);
  console.log(`[PREDICT_DEBUG] DefPred:`, defPred);
  return defPred;
}

module.exports = { predictMatchWinner };
