const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  for (const m of matches) {
    const snap = await getTossSnapshot(m.matchId);
    if (!snap || !snap.teams) continue;
    console.log(`\n=== ${m.matchName} ===`);
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
      console.log(`Team: ${team} | Trades: ${tradeCount} | Total Vol: ${totalVol.toFixed(2)} | Back Stake: ${tBack.toFixed(2)} | Lay Stake: ${tLay.toFixed(2)} | Back Liab: ${tBackLiab.toFixed(2)} | Lay Liab: ${tLayLiab.toFixed(2)}`);
    }
  }
})();
