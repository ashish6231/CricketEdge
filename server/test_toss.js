const { getTossSnapshot, getAllTossMatches } = require('./services/scraper');
(async () => {
  const matches = await getAllTossMatches();
  if (!matches || matches.length === 0) { console.log('no matches'); return; }
  const matchId = matches[0].matchId;
  const snap = await getTossSnapshot(matchId);
  console.log(JSON.stringify(snap?.teams, null, 2));
})();
