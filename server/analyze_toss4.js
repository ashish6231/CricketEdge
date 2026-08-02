const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  const targetMatches = matches.filter(m => 
    !m.matchName.includes(' W ') && (
    m.matchName.toLowerCase().includes('birmingham') || 
    m.matchName.toLowerCase().includes('london') || 
    m.matchName.toLowerCase().includes('trent'))
  );
  
  for (const m of targetMatches) {
    console.log(`\n=== ${m.matchName} ===`);
    const snap = await getTossSnapshot(m.matchId);
    console.log("True Market Load:", JSON.stringify(snap.trueMarketLoad, null, 2));
  }
})();
