const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  const targetMatches = matches.filter(m => 
    m.matchName.toLowerCase().includes('birmingham') || 
    m.matchName.toLowerCase().includes('london') || 
    m.matchName.toLowerCase().includes('trent')
  );
  
  for (const m of targetMatches) {
    const snap = await getTossSnapshot(m.matchId);
    if (!snap || !snap.teams) continue;
    console.log(`\n=== ${m.matchName} ===`);
    for (const team of snap.teamNames) {
      const tData = snap.teams[team];
      const trades = tData.trades || [];
      const tradeCount = trades.length;
      const totalVol = trades.reduce((sum, t) => sum + t.size, 0);
      const avgSize = tradeCount > 0 ? totalVol / tradeCount : 0;
      console.log(`Team: ${team} | Trades: ${tradeCount} | Total Vol: ${totalVol.toFixed(2)} | Avg Size: ${avgSize.toFixed(2)}`);
    }
  }
})();
