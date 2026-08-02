const { getAllTossMatches } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  console.log(JSON.stringify(matches, null, 2));
})();
