import model from './matchLeagueModels.js'

export const MATCH_PREDICTOR_VERSION = 'match-v2-league-trees-retrospective'
export const FEATURE_NAMES = ['backShare', 'layShare', 'totalShare', 'pnlGap', 'pnlLeader', 'pnlOther', 'logVolume', 'betShare']

export function normalizeLeague(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null
const nonnegative = value => Math.max(0, finite(value) ?? 0)
const share = (a, b) => a + b > 0 ? a / (a + b) : 0.5

export function extractMatchFeatures(snapshot) {
  if (!Array.isArray(snapshot?.teamNames) || snapshot.teamNames.length < 2) return null
  // Only explicitly frozen pre-match fields are eligible. Never use live trades,
  // market signals, final odds, scores, in-play P/L or supplied actual outcomes.
  const teams = [0, 1].map(i => {
    const key = `team${i + 1}`, v = snapshot.preMatchVolume?.[key] || {}
    const back = nonnegative(v.back), lay = nonnegative(v.lay)
    return { index: i, back, lay, total: back + lay, pnl: finite(snapshot.preMatchPnl?.[key]), bets: nonnegative(snapshot.preMatchTotalBets?.[key]) }
  })
  if (teams.every(t => t.total === 0)) return null
  // Orient by market inputs, never team identity or original team position.
  const compare = (a, b) => a.total - b.total || a.back - b.back || a.lay - b.lay || (a.pnl ?? 0) - (b.pnl ?? 0) || a.bets - b.bets
  if (compare(teams[0], teams[1]) === 0) return null
  teams.sort((a, b) => compare(b, a))
  const [leader, other] = teams
  const pnlLeader = leader.pnl ?? (leader.lay - leader.back + other.back - other.lay)
  const pnlOther = other.pnl ?? (other.lay - other.back + leader.back - leader.lay)
  const scale = Math.max(Math.abs(pnlLeader), Math.abs(pnlOther), leader.total + other.total, 1)
  return { teams, values: [share(leader.back, other.back), share(leader.lay, other.lay), share(leader.total, other.total), (pnlLeader - pnlOther) / scale, pnlLeader / scale, pnlOther / scale, Math.log1p(leader.total + other.total), share(leader.bets, other.bets)] }
}

export function evaluateTree(tree, values) {
  const path = []
  while (tree && tree.feature !== undefined) {
    const left = values[tree.feature] <= tree.threshold
    path.push(`${FEATURE_NAMES[tree.feature]} ${left ? '<=' : '>'} ${tree.threshold.toFixed(4)}`)
    tree = left ? tree.left : tree.right
  }
  return tree ? { side: tree.side, samples: tree.samples, path } : null
}

export function predictLeagueMatch(snapshot, trainedModel = model) {
  const features = extractMatchFeatures(snapshot)
  if (!features) return null
  const key = normalizeLeague(snapshot.competitionName || snapshot.seriesName)
  const league = trainedModel.leagues[key]
  const tree = league?.tree || trainedModel.globalTree
  const result = evaluateTree(tree, features.values)
  if (!result) return null
  const winnerIdx = features.teams[result.side].index
  const outsideTrainingRange = !!league && features.values.some((v, i) => v < league.ranges[i][0] || v > league.ranges[i][1])
  const reason = `${league ? 'League' : 'Global fallback'} historical-fit tree: ${result.path.join('; ') || 'single observed market-flow class'}`
  return {
    winner: snapshot.teamNames[winnerIdx], winnerIdx,
    tier: 'LEAGUE_HISTORICAL_TREE', predictorVersion: MATCH_PREDICTOR_VERSION,
    reason, confidence: 'Historical fit only; future accuracy unvalidated',
    confidenceCalibrated: false, validation: 'in-sample', inputTiming: 'frozen-pre-match-fields',
    modelScope: league ? 'league' : 'global-fallback', trainingSamples: league?.samples || trainedModel.samples,
    leafSamples: result.samples, outsideTrainingRange,
    modelDatasetHash: trainedModel.datasetSha256,
  }
}
