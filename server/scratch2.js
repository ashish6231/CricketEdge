const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  for (const m of matches) {
    const tossSnap = await getTossSnapshot(m.matchId);
    if (!tossSnap || !tossSnap.teams) continue;
    
    const tossT1Name = tossSnap.teamNames[0];
    const tossT2Name = tossSnap.teamNames[1];
    const tossM1 = tossSnap.advancedMetricsV2?.team1 || {lay:0, back:0, totalBet:0};
    const tossM2 = tossSnap.advancedMetricsV2?.team2 || {lay:0, back:0, totalBet:0};
    const tossS1 = tossSnap.syntheticSupport?.teamA || {tradeCount:0};
    const tossS2 = tossSnap.syntheticSupport?.teamB || {tradeCount:0};
    
    const t1LayTrades = tossS1.tradeCount;
    const t2LayTrades = tossS2.tradeCount;
    const t1LayVol = tossM1.lay;
    const t2LayVol = tossM2.lay;

    let predictedTossWinner = 'Waiting for more data...';
    if (tossM1 && tossM2) {
      const t1Back = tossM1.back ?? 0;
      const t2Back = tossM2.back ?? 0;
      const t1Total = tossM1.totalBet ?? 0;
      const t2Total = tossM2.totalBet ?? 0;
      const mTotal = t1Total + t2Total;

      if (mTotal > 0) {
        const t1LoadPct = t1Total / mTotal;
        const t2LoadPct = t2Total / mTotal;

        const t1IsTrapWinner = t2LoadPct > 0.74 && t1LayVol > t2LayVol && t1LayVol > t1Back;
        const t2IsTrapWinner = t1LoadPct > 0.74 && t2LayVol > t1LayVol && t2LayVol > t2Back;

        if (t1IsTrapWinner) {
          predictedTossWinner = tossT1Name;
        } else if (t2IsTrapWinner) {
          predictedTossWinner = tossT2Name;
        } else {
          predictedTossWinner = t1LayTrades > t2LayTrades ? tossT1Name
            : t2LayTrades > t1LayTrades ? tossT2Name
            : (t1LayVol > t2LayVol ? tossT1Name : t2LayVol > t1LayVol ? tossT2Name : 'Waiting for more data...');
        }
      }
    }

    console.log(`\n=== ${m.matchName} ===`);
    console.log(`Current Prediction: ${predictedTossWinner}`);
  }
})();
