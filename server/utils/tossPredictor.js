// Shared by the backend and the standalone/embedded toss UI.
import { getUniversalTossPrediction, UNIVERSAL_TOSS_VERSION } from './universalTossAlgorithm.mjs'
export { inferCompetition } from './tossLeagueAlgorithms.js'
export const PREDICTOR_VERSION = UNIVERSAL_TOSS_VERSION

export function predictTossWinner(snapshot, competition = '') {
  const prediction = getUniversalTossPrediction(snapshot,competition)
  return prediction.abstain ? null : prediction
}

export function getLeagueTossPrediction(snapshot, competition = '') {
  return getUniversalTossPrediction(snapshot,competition)
}

export default predictTossWinner
