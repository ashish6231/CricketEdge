const scraper = require('./services/scraper');
async function test() {
  const matches = await scraper.getAllSessionMatches();
  if (matches && matches.length > 0) {
    const trades = await scraper.getSessionTrades(matches[0].matchId);
    console.log(Object.keys(trades));
    if (trades.odds) {
      console.log(trades.odds.length, "odds objects");
      console.log(trades.odds[0]);
    }
  }
}
test();
