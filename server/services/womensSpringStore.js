const path = require('node:path');
const { createTrackedLeagueStore, summarizeTrackedLeague } = require('./trackedLeagueStore');
const { isWomensSpringT20, springTeamKey, WOMENS_SPRING_LEAGUE } = require('../utils/womensSpringMatchPredictor.mjs');

function createWomensSpringStore({ filePath = path.join(__dirname, '../data/womens_spring_dataset.json') } = {}) {
  return createTrackedLeagueStore({ filePath, leagueName: WOMENS_SPRING_LEAGUE,
    isLeague: isWomensSpringT20, normalizeTeam: springTeamKey, persistFixtures: true,
    approvedHosts: ['crex.com', 'cricket.com.au', 'cricbuzz.com', 'espncricinfo.com'],
    evidenceLabel: 'CREX, Cricket Australia, Cricbuzz or ESPNcricinfo' });
}
let defaultStore;
const getDefaultWomensSpringStore = () => defaultStore ||= createWomensSpringStore();
module.exports = { createWomensSpringStore, getDefaultWomensSpringStore, summarizeWomensSpring: summarizeTrackedLeague };
