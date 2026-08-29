require('dotenv').config();
const scraper = require('./services/scraper.js');
const { predictMatchWinner } = require('./utils/matchWinnerPredictor.js');

scraper.getAllCricketMatches().then(async res => {
  const mInfo = res.find(x => x.competitionName && x.competitionName.toLowerCase().includes('uttar pradesh'));
  if (mInfo) {
    const data = await scraper.getCricketSnapshot(mInfo.matchId);
    console.log("Team 1:", data.teamNames[0]);
    console.log("Team 2:", data.teamNames[1]);
    
    // Reproduce logic inline to see values
    const team1 = data.teamNames[0];
    const team2 = data.teamNames[1];
    let b1 = 0, b2 = 0, l1 = 0, l2 = 0;
    const m1 = data.preMatchVolume?.team1 || data.advancedMetricsV2?.team1 || data.advancedMetrics?.team1;
    const m2 = data.preMatchVolume?.team2 || data.advancedMetricsV2?.team2 || data.advancedMetrics?.team2;
    console.log("m1:", m1);
    console.log("m2:", m2);

    if (m1 && m2) {
      b1 = m1.back || 0;
      l1 = m1.lay || 0;
      b2 = m2.back || 0;
      l2 = m2.lay || 0;
      console.log("Using m1/m2 metrics:", {b1, b2, l1, l2});
    } else {
      let trades1 = data.teams?.[team1]?.trades || [];
      let trades2 = data.teams?.[team2]?.trades || [];
      if (data.startTime) {
        const startTimeMs = new Date(data.startTime).getTime();
        trades1 = trades1.filter(t => !t.updatedAt || t.updatedAt <= startTimeMs);
        trades2 = trades2.filter(t => !t.updatedAt || t.updatedAt <= startTimeMs);
      }
      b1 = trades1.filter(t => t.type === 'back').reduce((sum, t) => sum + (t.size || 0), 0);
      b2 = trades2.filter(t => t.type === 'back').reduce((sum, t) => sum + (t.size || 0), 0);
      l1 = trades1.filter(t => t.type === 'lay').reduce((sum, t) => sum + (t.size || 0), 0);
      l2 = trades2.filter(t => t.type === 'lay').reduce((sum, t) => sum + (t.size || 0), 0);
      console.log("Using trades array:", {b1, b2, l1, l2});
    }
    const pnl1 = (l1 - b1) + (b2 - l2);
    const pnl2 = (l2 - b2) + (b1 - l1);
    console.log({pnl1, pnl2});
    
    console.log("Predictor returns:", predictMatchWinner(data));
  } else {
    console.log("No UP match found.");
  }
}).catch(console.error);
