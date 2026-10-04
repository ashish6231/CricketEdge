const { predictNormalLeagueMatch, PREDICTOR_VERSION, DEFAULT_MATCH_MODE } = require('./normalLeagueMatchPredictor.mjs');
const HISTORICAL_FIT_VERSION = 'match-v2-league-trees-retrospective';

function predictMatchWinner(snap, { mode = DEFAULT_MATCH_MODE } = {}) {
  if (mode === 'rules') return predictNormalLeagueMatch(snap);
  // Fitted models load only when explicitly requested by an offline caller.
  if (mode === 'historical-fit') return require('./matchLeagueModel.js').predictLeagueMatch(snap);
  throw new Error(`Unknown match prediction mode: ${mode}`);
}

module.exports = { predictMatchWinner, PREDICTOR_VERSION, DEFAULT_MATCH_MODE, HISTORICAL_FIT_VERSION };
