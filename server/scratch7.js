const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  for (const m of matches) {
    const tossSnap = await getTossSnapshot(m.matchId);
    if (!tossSnap || !tossSnap.teams) continue;
    
    const tossM1 = tossSnap.advancedMetricsV2?.team1 || {lay:0, back:0, totalBet:0};
    const tossM2 = tossSnap.advancedMetricsV2?.team2 || {lay:0, back:0, totalBet:0};
    
    const t1Total = tossM1.totalBet ?? 0;
    const t2Total = tossM2.totalBet ?? 0;
    const mTotal = t1Total + t2Total;
    
    if (mTotal > 0) {
      if (tossM1.lay === 0 || tossM2.lay === 0) {
        console.log(`\n=== ${m.matchName} ===`);
        if (tossM1.lay === 0) {
          console.log(`${tossSnap.teamNames[0]} has 0 Lay Vol. Load: ${(t1Total/mTotal*100).toFixed(1)}%`);
        }
        if (tossM2.lay === 0) {
          console.log(`${tossSnap.teamNames[1]} has 0 Lay Vol. Load: ${(t2Total/mTotal*100).toFixed(1)}%`);
        }
      }
    }
  }
})();
