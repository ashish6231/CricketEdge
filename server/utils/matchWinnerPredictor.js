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
    // 🔴 STRICT PRE-MATCH DATA ONLY FOR VOLUMES
    const m1 = snap.preMatchVolume?.team1 || snap.advancedMetricsV2?.team1 || snap.advancedMetrics?.team1;
    const m2 = snap.preMatchVolume?.team2 || snap.advancedMetricsV2?.team2 || snap.advancedMetrics?.team2;

    b1 = m1?.back || 0;
    b2 = m2?.back || 0;
    l1 = m1?.lay || 0;
    l2 = m2?.lay || 0;

    if (!b1 && !b2) {
      let trades1 = snap.teams?.[team1]?.trades || [];
      let trades2 = snap.teams?.[team2]?.trades || [];

      if (snap.startTime) {
        const startTimeMs = new Date(snap.startTime).getTime();
        trades1 = trades1.filter(t => !t.updatedAt || t.updatedAt <= startTimeMs);
        trades2 = trades2.filter(t => !t.updatedAt || t.updatedAt <= startTimeMs);
      }

      b1 = trades1.filter(t => t.type === 'back').reduce((sum, t) => sum + (t.size || 0), 0);
      b2 = trades2.filter(t => t.type === 'back').reduce((sum, t) => sum + (t.size || 0), 0);
      l1 = trades1.filter(t => t.type === 'lay').reduce((sum, t) => sum + (t.size || 0), 0);
      l2 = trades2.filter(t => t.type === 'lay').reduce((sum, t) => sum + (t.size || 0), 0);
    }

    // 🎯 STRICT PRE-MATCH BOOKIE P/L (Does not flip when match goes live)
    const prePnl1 = snap?.preMatchPnl?.team1;
    const prePnl2 = snap?.preMatchPnl?.team2;

    if (prePnl1 != null && prePnl2 != null) {
      pnl1 = prePnl1;
      pnl2 = prePnl2;
    } else {
      const sp = snap.deepMetrics?.simplePL || {};
      const t1Data = snap.teams?.[team1] || {};
      const t2Data = snap.teams?.[team2] || {};

      if (sp.team1_win != null || t1Data.pnlIfWins != null) {
        pnl1 = sp.team1_win ?? t1Data.pnlIfWins ?? 0;
        pnl2 = sp.team2_win ?? t2Data.pnlIfWins ?? 0;
      } else {
        // Fallback if API simplePL is not present
        pnl1 = (l1 - b1) + (b2 - l2);
        pnl2 = (l2 - b2) + (b1 - l1);
      }
    }

    // Freeze it on the very first call!
    if (matchId) {
      preMatchVolumeCache.set(matchId, { b1, b2, l1, l2, pnl1, pnl2 });
    }
  }

  const compName = (snap.competitionName || '');
  
  // Try league specific algorithms first
  const leaguePred = getLeagueAlgorithmPrediction(compName, b1, b2, l1, l2, pnl1, pnl2, team1, team2, snap);
  if (leaguePred) return leaguePred;

  // Fallback to default algorithm
  return getDefaultAlgorithmPrediction(b1, b2, l1, l2, pnl1, pnl2, team1, team2);
}

module.exports = { predictMatchWinner };
