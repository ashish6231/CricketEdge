const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  const m = matches.find(m => m.matchName === 'Birmingham Phoenix v Welsh Fire');
  const snap = await getTossSnapshot(m.matchId);
  console.log("=== Birmingham Phoenix v Welsh Fire ===");
  console.log("Market Analysis:", JSON.stringify(snap.marketAnalysis, null, 2));
  console.log("Advanced Metrics V2:", JSON.stringify(snap.advancedMetricsV2, null, 2));
})();
