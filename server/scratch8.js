const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  for (const m of matches) {
    if (m.matchName === 'Ruby Trichy Warriors v Madurai Panthers' || m.matchName === 'Manchester Super Giants W v Welsh Fire W') {
      const tossSnap = await getTossSnapshot(m.matchId);
      console.log(`\n=== ${m.matchName} ===`);
      console.log(`syntheticSupport:`, JSON.stringify(tossSnap.syntheticSupport, null, 2));
      console.log(`supportMetrics:`, JSON.stringify(tossSnap.supportMetrics, null, 2));
    }
  }
})();
