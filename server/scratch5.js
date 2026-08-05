const { getAllTossMatches, getTossSnapshot } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  for (const m of matches) {
    if (m.matchName !== 'Ruby Trichy Warriors v Madurai Panthers') continue;
    const tossSnap = await getTossSnapshot(m.matchId);
    if (!tossSnap || !tossSnap.teams) continue;
    
    const tossT1Name = tossSnap.teamNames[0];
    const tossT2Name = tossSnap.teamNames[1];
    
    console.log(`=== ${m.matchName} ===`);
    console.log(`${tossT1Name} trades:`, tossSnap.teams[tossT1Name]?.trades);
    console.log(`${tossT2Name} trades:`, tossSnap.teams[tossT2Name]?.trades);
  }
})();
