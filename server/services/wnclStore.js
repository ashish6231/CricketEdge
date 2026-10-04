const path = require('node:path');
const { createTrackedLeagueStore, summarizeTrackedLeague } = require('./trackedLeagueStore');
const { isWNCLLeague, wnclTeamKey } = require('../utils/wnclMatchPredictor.mjs');
function createWNCLStore({ filePath = path.join(__dirname, '../data/wncl_dataset.json') } = {}) {
  return createTrackedLeagueStore({ filePath, leagueName:"Women's National Cricket League", isLeague:isWNCLLeague,
    normalizeTeam:wnclTeamKey,
    approvedHosts:['cricbuzz.com','espncricinfo.com','cricket.com.au'], evidenceLabel:'Cricbuzz, official Cricket Australia or ESPNcricinfo' });
}
let defaultStore;
const getDefaultWNCLStore = () => defaultStore ||= createWNCLStore();
module.exports = { createWNCLStore, getDefaultWNCLStore, summarizeWNCL:summarizeTrackedLeague };
