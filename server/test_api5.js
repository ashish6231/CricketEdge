const scraper = require('./services/scraper');
async function test() {
  const matches = await scraper.getAllSessionMatches();
  if (matches && matches.length > 0) {
    const trades = await scraper.getSessionTrades(matches[0].matchId);
    if (trades.markets) {
      console.log(trades.markets[0]);
    }
  }
}
test();
