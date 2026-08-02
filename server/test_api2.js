const scraper = require('./services/scraper');
async function test() {
  const matches = await scraper.getAllSessionMatches();
  if (matches && matches.length > 0) {
    const matchInfo = matches.find(m => m.matchId === '35882785') || matches[0];
    console.log(JSON.stringify(matchInfo, null, 2).substring(0, 1500));
  }
}
test();
