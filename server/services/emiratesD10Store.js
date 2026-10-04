const path = require('node:path');
const { createTrackedLeagueStore, summarizeTrackedLeague, validateResultEvidence: validateEvidence } = require('./trackedLeagueStore');
const { isEmiratesD10League } = require('../utils/emiratesD10MatchPredictor.mjs');
const approvedHosts = ['cricbuzz.com','espncricinfo.com','emiratescricket.com'];
const evidenceLabel = 'Cricbuzz, official ECB or ESPNcricinfo';
function createD10Store({filePath = path.join(__dirname, '../data/emirates_d10_dataset.json')} = {}) {
  return createTrackedLeagueStore({filePath, leagueName:'Emirates D10 League', isLeague:isEmiratesD10League, approvedHosts, evidenceLabel});
}
let defaultStore;
const getDefaultD10Store = () => defaultStore ||= createD10Store();
const validateResultEvidence = url => validateEvidence(url,approvedHosts,evidenceLabel);
module.exports = { createD10Store, getDefaultD10Store, summarizeD10:summarizeTrackedLeague, validateResultEvidence };
