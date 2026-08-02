const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  const targetMatches = matches.filter(m => 
    m.matchName.toLowerCase().includes('birmingham') || 
    m.matchName.toLowerCase().includes('london') || 
    m.matchName.toLowerCase().includes('trent')
  );
  
  for (const m of targetMatches) {
    if (m.matchName.includes(' W ')) continue; // Skip women matches for now to simplify
    console.log(`\n=== ${m.matchName} ===`);
    const snap = await getTossSnapshot(m.matchId);
    console.log("Deep Metrics:", JSON.stringify(snap.deepMetrics, null, 2));
    console.log("Support Metrics:", JSON.stringify(snap.supportMetrics, null, 2));
    console.log("Net Support:", JSON.stringify(snap.netSupport, null, 2));
  }
})();
