const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  if (!matches) return console.log('No matches');
  const targetMatches = matches.filter(m => 
    m.matchName.toLowerCase().includes('birmingham') || 
    m.matchName.toLowerCase().includes('london') || 
    m.matchName.toLowerCase().includes('trent')
  );
  
  for (const m of targetMatches) {
    console.log(`\n=== MATCH: ${m.matchName} ===`);
    const snap = await getTossSnapshot(m.matchId);
    if (!snap || !snap.teams) { console.log('No toss data'); continue; }
    
    for (const team of snap.teamNames) {
      const tData = snap.teams[team];
      let tBack = 0, tLay = 0, tBackLiab = 0, tLayLiab = 0;
      for (const t of (tData.trades || [])) {
         if (t.type === 'back') { tBack += t.size; tBackLiab += t.size * (t.price - 1); }
         if (t.type === 'lay') { tLay += t.size; tLayLiab += t.size * (t.price - 1); }
      }
      console.log(`Team: ${team}`);
      console.log(`  Total Volume: ${tData.totalBet}`);
      console.log(`  Back Stake: ${tBack.toFixed(2)} | Lay Stake: ${tLay.toFixed(2)}`);
      console.log(`  Back Liab: ${tBackLiab.toFixed(2)} | Lay Liab: ${tLayLiab.toFixed(2)}`);
    }
  }
})();
