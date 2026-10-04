const { captureTrackedLeague, timestamp } = require('./trackedLeagueCapture');
const { getDefaultWNCLStore, summarizeWNCL } = require('./wnclStore');
const { WNCL_ALGORITHM, isWNCLLeague, wnclTeamKey } = require('../utils/wnclMatchPredictor.mjs');
const DEFAULT_WNCL_SERIES_URL = 'https://crex.com/series/womens-national-cricket-league-2026-27-2NG/matches';

function configuredWNCLSeriesUrls() {
  return [...new Set((process.env.WNCL_SERIES_URLS || DEFAULT_WNCL_SERIES_URL).split(',').map(s => s.trim()).filter(Boolean))];
}
function overviewFixtures(matches) {
  return matches.filter(m => isWNCLLeague(m.seriesName || m.competitionName)).flatMap(m => {
    const startTime = timestamp(m.startTime), id = m.crexMatchId || m.slug;
    if (!id || !startTime || !m.team1Name || !m.team2Name) return [];
    const status = ['completed','ended'].includes(m.status) ? 'completed' : m.status === 'live' ? 'live' : 'upcoming';
    const winnerText = String(m.statusText || '').match(/^\s*(.*?)\s+(?:have\s+|has\s+)?won\s+by\b/i)?.[1];
    const candidates = [[m.team1Name,m.team1Short],[m.team2Name,m.team2Short]].filter(names =>
      winnerText && names.some(name => name && wnclTeamKey(name) === wnclTeamKey(winnerText)));
    return [{recordId:`crex:wncl:${id}`,crexMatchId:String(id),seriesId:m.seriesName || m.competitionName,
      competitionName:WNCL_ALGORITHM.league,matchName:`${m.team1Name} v ${m.team2Name}`,
      team1:m.team1Name,team2:m.team2Name,startTime,status,score1:m.score1 || null,score2:m.score2 || null,
      reportedWinner:status === 'completed' && candidates.length === 1 ? candidates[0][0] : null,
      resultText:m.statusText || null,sourceProvider:'CREX',sourceUrl:m.url ? new URL(m.url,'https://crex.com').href : null,
      sourceFixture:m}];
  });
}
async function captureWNCL(options = {}) {
  const scraper = options.scraper || require('./dataCache');
  let initialFixtures = options.initialFixtures || [];
  const sourceErrors = [];
  if (!options.initialFixtures && scraper.getCrexOverview) {
    try {
      const overview = await scraper.getCrexOverview();
      if (Array.isArray(overview)) initialFixtures = overviewFixtures(overview);
    } catch (error) { sourceErrors.push({source:'fixture-overview',message:error.message}); }
  }
  return captureTrackedLeague({ store:getDefaultWNCLStore(), seriesUrls:configuredWNCLSeriesUrls(),
    leagueName:WNCL_ALGORITHM.league,isLeague:isWNCLLeague,normalizeTeam:wnclTeamKey,
    summarize:summarizeWNCL, ...options, scraper, initialFixtures, sourceErrors, preMatchOnly:true });
}
module.exports = { captureWNCL, overviewFixtures, configuredWNCLSeriesUrls, DEFAULT_WNCL_SERIES_URL };
