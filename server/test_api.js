const scraper = require('./services/scraper');
async function test() {
  const matches = await scraper.getAllSessionMatches();
  if (matches && matches.length > 0) {
    console.log('Match ID:', matches[0].matchId);
    const trades = await scraper.getSessionTrades(matches[0].matchId);
    console.log(JSON.stringify(trades, null, 2).substring(0, 800));
  } else {
    console.log("No session matches.");
  }
}
test();
