const { captureTrackedLeague, matchFixture, timestamp, teamKey } = require('./trackedLeagueCapture');
const { getDefaultD10Store, summarizeD10 } = require('./emiratesD10Store');
const { isEmiratesD10League } = require('../utils/emiratesD10MatchPredictor.mjs');
const DEFAULT_SERIES_URL = 'https://crex.com/series/emirates-d10-league-2026-2NK/matches';
function configuredSeriesUrls() {
  return [...new Set((process.env.EMIRATES_D10_SERIES_URLS || DEFAULT_SERIES_URL).split(',').map(s => s.trim()).filter(Boolean))];
}
function captureEmiratesD10(options = {}) {
  return captureTrackedLeague({ store: getDefaultD10Store(), seriesUrls: configuredSeriesUrls(),
    leagueName: 'Emirates D10 League', isLeague: isEmiratesD10League, summarize: summarizeD10, ...options, preMatchOnly:true });
}
module.exports = { captureEmiratesD10, configuredSeriesUrls, matchFixture, timestamp, teamKey, DEFAULT_SERIES_URL };
