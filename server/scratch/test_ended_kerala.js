require('dotenv').config({ path: '/Users/ashish/Desktop/workspace-019f9b6f-8b54-705e-9229-bba56237fc4c/server/.env' });
const scraper = require('/Users/ashish/Desktop/workspace-019f9b6f-8b54-705e-9229-bba56237fc4c/server/services/scraper.js');

scraper.getAllCricketMatches().then(async res => {
  if (res?.error) { console.error(res); return; }
  const matches = res.matches || res;
  const endedKerala = matches.filter(m => m.status === 'ended' && m.competitionName?.toLowerCase().includes('kerala'));
  
  if (endedKerala.length > 0) {
    const id = endedKerala[0].matchId || endedKerala[0].marketId;
    console.log(`Found ended Kerala match: ${endedKerala[0].name} (ID: ${id})`);
    
    const snap = await scraper.getCricketSnapshot(id);
    const { predictMatchWinner } = require('/Users/ashish/Desktop/workspace-019f9b6f-8b54-705e-9229-bba56237fc4c/server/utils/matchWinnerPredictor.js');
    
    snap.competitionName = endedKerala[0].competitionName;
    snap.status = 'ended';
    
    console.log("Prediction output:", predictMatchWinner(snap));
  } else {
    console.log("No ended Kerala matches found.");
  }
}).catch(console.error);
