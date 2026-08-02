const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  const targetMatches = matches.filter(m => 
    m.matchName === 'Colombo Kaps v Galle Marvels' || 
    m.matchName === 'Sri Lanka W v Pakistan W'
  );
  
  for (const m of targetMatches) {
    const snap = await getTossSnapshot(m.matchId);
    if (!snap || !snap.teams) continue;
    console.log(`\n=== ${m.matchName} ===`);
    
    // Print basic totals
    for (const team of snap.teamNames) {
      const tData = snap.teams[team];
      const trades = tData.trades || [];
      const tradeCount = trades.length;
      
      let tBack = 0, tLay = 0, tBackLiab = 0, tLayLiab = 0;
      for (const t of trades) {
         if (t.type === 'back') { tBack += t.size; tBackLiab += t.size * (t.price - 1); }
         if (t.type === 'lay') { tLay += t.size; tLayLiab += t.size * (t.price - 1); }
      }
      
      const totalVol = trades.reduce((sum, t) => sum + t.size, 0);
      const avgSize = tradeCount > 0 ? totalVol / tradeCount : 0;
      
      console.log(`Team: ${team} | Trades: ${tradeCount} | Total Vol: ${totalVol.toFixed(2)} | Avg Size: ${avgSize.toFixed(2)}`);
      console.log(`  Back Stake: ${tBack.toFixed(2)} | Lay Stake: ${tLay.toFixed(2)}`);
      console.log(`  Back Liab: ${tBackLiab.toFixed(2)} | Lay Liab: ${tLayLiab.toFixed(2)}`);
    }
    
    // Print Market Analysis & Bookie P&L
    console.log("Market Analysis:", JSON.stringify(snap.marketAnalysis?.totalNetVolume, null, 2));
  }
})();
