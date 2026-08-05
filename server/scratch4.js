const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  for (const m of matches) {
    const snap = await getTossSnapshot(m.matchId);
    if (!snap || !snap.teams || !snap.marketAnalysis) continue;
    
    const t1Name = snap.teamNames[0];
    const t2Name = snap.teamNames[1];
    
    const pl1 = snap.marketAnalysis.totalNetVolume?.team1?.profitLoss || 0;
    const pl2 = snap.marketAnalysis.totalNetVolume?.team2?.profitLoss || 0;

    console.log(`\n=== ${m.matchName} ===`);
    console.log(`${t1Name} PL: ${pl1.toFixed(2)} | ${t2Name} PL: ${pl2.toFixed(2)}`);
  }
})();
