const scraper = require('./server/services/scraper');
const fs = require('fs');

async function testScraper() {
  console.log('Testing cricket matches...');
  const cricketMatches = await scraper.getAllCricketMatches();
  
  if (Array.isArray(cricketMatches) && cricketMatches.length > 0) {
    const matchId = cricketMatches[0].matchId;
    console.log('Testing cricket snapshot for matchId:', matchId);
    const snapshot = await scraper.getCricketSnapshot(matchId);
    fs.writeFileSync('sample_snapshot.json', JSON.stringify(snapshot, null, 2));
    console.log('Saved sample_snapshot.json');
  } else {
    console.log('No cricket matches found or error:', cricketMatches);
  }
}

testScraper().then(() => console.log('Done')).catch(console.error);
