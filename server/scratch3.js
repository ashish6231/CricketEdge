const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  for (const m of matches) {
    const snap = await getTossSnapshot(m.matchId);
    if (!snap || !snap.teams) continue;
    
    const tossT1Name = snap.teamNames[0];
    const tossT2Name = snap.teamNames[1];
    
    const tossS1 = snap.syntheticSupport?.teamA || {tradeCount:0};
    const tossS2 = snap.syntheticSupport?.teamB || {tradeCount:0};
    const tossSup1 = snap.supportMetrics?.team1 || {support:0};
    const tossSup2 = snap.supportMetrics?.team2 || {support:0};

    console.log(`\n=== ${m.matchName} ===`);
    console.log(`T1: ${tossT1Name} (Sup: ${tossSup1.support.toFixed(2)}%) | T2: ${tossT2Name} (Sup: ${tossSup2.support.toFixed(2)}%)`);
  }
})();
