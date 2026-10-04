export const FEATURE_NAMES = Object.freeze(['backShare', 'layShare', 'totalShare', 'pnlGap', 'pnlLeader', 'pnlOther', 'logVolume', 'betShare']);
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const nonnegative = value => Math.max(0, finite(value) ?? 0);
const share = (a, b) => a + b > 0 ? a / (a + b) : 0.5;

export function extractMatchFeatures(snapshot) {
  if (!Array.isArray(snapshot?.teamNames) || snapshot.teamNames.length < 2) return null;
  const teams = [0, 1].map(index => {
    const key = `team${index + 1}`, volume = snapshot.preMatchVolume?.[key] || {};
    const back = nonnegative(volume.back), lay = nonnegative(volume.lay);
    return { index, back, lay, total: back + lay, pnl: finite(snapshot.preMatchPnl?.[key]), bets: nonnegative(snapshot.preMatchTotalBets?.[key]) };
  });
  if (teams.every(team => team.total === 0)) return null;
  const compare = (a, b) => a.total - b.total || a.back - b.back || a.lay - b.lay || (a.pnl ?? 0) - (b.pnl ?? 0) || a.bets - b.bets;
  if (compare(teams[0], teams[1]) === 0) return null;
  teams.sort((a, b) => compare(b, a));
  const [leader, other] = teams;
  const pnlLeader = leader.pnl ?? leader.lay - leader.back + other.back - other.lay;
  const pnlOther = other.pnl ?? other.lay - other.back + leader.back - leader.lay;
  const scale = Math.max(Math.abs(pnlLeader), Math.abs(pnlOther), leader.total + other.total, 1);
  return { teams, values: [share(leader.back, other.back), share(leader.lay, other.lay), share(leader.total, other.total),
    (pnlLeader - pnlOther) / scale, pnlLeader / scale, pnlOther / scale, Math.log1p(leader.total + other.total), share(leader.bets, other.bets)] };
}

export function evaluateNumericTree(tree, values) {
  const path = [];
  while (tree && tree.feature !== undefined) {
    const left = values[tree.feature] <= tree.threshold;
    path.push(`${FEATURE_NAMES[tree.feature]} ${left ? '<=' : '>'} ${tree.threshold.toFixed(4)}`);
    tree = left ? tree.left : tree.right;
  }
  return tree ? { side: tree.side, samples: tree.samples, path } : null;
}

export function describeCommonFactors(features, predictedWinnerIdx) {
  if (!features?.teams?.length || features.teams.length < 2) return null;
  const [leader, other] = features.teams;
  const pick = field => leader[field] === other[field] ? null : leader[field] > other[field] ? leader.index : other.index;
  const signals = {
    totalFlow: leader.index,
    backFlow: pick('back'),
    layFlow: pick('lay'),
    activity: pick('bets'),
    higherPnl: pick('pnl'),
  };
  const flowSignals = [signals.totalFlow, signals.backFlow, signals.layFlow].filter(Number.isInteger);
  return {
    family: 'relative-market-flow',
    dominantTeamIndex: leader.index,
    totalShare: features.values[2], backShare: features.values[0], layShare: features.values[1],
    activityShare: features.values[7], normalizedPnlGap: features.values[3],
    flowAgreement: flowSignals.filter(index => index === leader.index).length,
    predictionAgreement: flowSignals.filter(index => index === predictedWinnerIdx).length,
    signals,
    validation: 'retrospective-descriptive-factor; not a calibrated probability',
  };
}
