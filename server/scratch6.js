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
    
    const t1TotalTrades = tossS1.tradeCount;
    const t2TotalTrades = tossS2.tradeCount;
    
    let t1ActualLayTrades = 0, t2ActualLayTrades = 0;
    (tossSnap.teams[tossT1Name]?.trades || []).forEach(t => { if (t.type === 'lay') t1ActualLayTrades++; });
    (tossSnap.teams[tossT2Name]?.trades || []).forEach(t => { if (t.type === 'lay') t2ActualLayTrades++; });

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

        // NEW TRAP LOGIC
        const t1IsTrapWinner = t2LoadPct > 0.74 && t1LayVol > t2LayVol && t1LayVol > t1Back;
        const t2IsTrapWinner = t1LoadPct > 0.74 && t2LayVol > t1LayVol && t2LayVol > t2Back;

        // ACTUAL LAY TRADES LOGIC vs TOTAL TRADES LOGIC
        const fallbackTotalTrades = t1TotalTrades > t2TotalTrades ? tossT1Name
          : t2TotalTrades > t1TotalTrades ? tossT2Name
          : (t1LayVol > t2LayVol ? tossT1Name : t2LayVol > t1LayVol ? tossT2Name : 'Waiting for more data...');
          
        const fallbackLayTrades = t1ActualLayTrades > t2ActualLayTrades ? tossT1Name
          : t2ActualLayTrades > t1ActualLayTrades ? tossT2Name
          : (t1LayVol > t2LayVol ? tossT1Name : t2LayVol > t1LayVol ? tossT2Name : 'Waiting for more data...');

        let currentLogic = fallbackTotalTrades;
        if (t1IsTrapWinner) currentLogic = tossT1Name;
        else if (t2IsTrapWinner) currentLogic = tossT2Name;
        
        let newLogic = fallbackLayTrades;
        if (t1IsTrapWinner) newLogic = tossT1Name;
        else if (t2IsTrapWinner) newLogic = tossT2Name;

        console.log(`\n=== ${m.matchName} ===`);
        console.log(`Current Logic: ${currentLogic}`);
        console.log(`New Logic (Actual Lay Trades): ${newLogic}`);
      }
    }
  }
})();
