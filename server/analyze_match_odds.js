const { getAllCricketMatches, getCricketSnapshot } = require('./services/scraper');

(async () => {
  const matches = await getAllCricketMatches();
  // Filter for Men's matches that are ended (exclude "Womens" and "W v ")
  const targetMatches = matches.filter(m => 
    m.status === 'ended' &&
    !m.competitionName.includes('Womens') &&
    !m.matchName.includes(' W v ') &&
    !m.matchName.includes(' W ')
  );
  
  console.log(`Found ${targetMatches.length} ended men's matches.`);
  
  for (const m of targetMatches) {
    const snap = await getCricketSnapshot(m.matchId);
    if (!snap || !snap.teams) continue;
    
    console.log(`\n===========================================`);
    console.log(`MATCH: ${m.matchName} | Comp: ${m.competitionName}`);
    
    let winner = "Unknown";
    let winnerLastPrice = 999;
    
    for (const team of snap.teamNames) {
      const tData = snap.teams[team];
      const trades = tData.trades || [];
      if (trades.length > 0) {
        // Look at the lowest matched price
        const minPrice = Math.min(...trades.map(t => t.price));
        if (minPrice < winnerLastPrice && minPrice <= 1.05) {
          winnerLastPrice = minPrice;
          winner = team;
        }
      }
    }
    
    console.log(`Predicted Winner (based on odds): ${winner}`);
    
    // Print Market Analysis
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
      const isWinner = team === winner ? '🏆 WINNER' : '❌ LOSER';
      
      console.log(`\nTeam: ${team} ${isWinner} | Total Vol: ${totalVol.toFixed(2)}`);
      console.log(`  Back Stake: ${tBack.toFixed(2)} | Lay Stake: ${tLay.toFixed(2)}`);
      console.log(`  Back Liab: ${tBackLiab.toFixed(2)} | Lay Liab: ${tLayLiab.toFixed(2)}`);
    }
    
    console.log("\nBookie Analysis:");
    if (snap.marketAnalysis?.totalNetVolume) {
      console.log(JSON.stringify(snap.marketAnalysis.totalNetVolume, null, 2));
    } else {
      console.log("No Market Analysis Available");
    }
  }
})();
