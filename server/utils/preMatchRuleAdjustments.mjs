// Numeric features and small, inspectable rule adjustments for normal mode.
// Callers supply only normalized frozen inputs. No labels, dates or fixture IDs.
export const BASE_PREMATCH_FEATURES = Object.freeze(['back', 'lay', 'total', 'activity', 'pnl', 'ownLay', 'oppLay', 'volume']);
export const PREMATCH_FEATURE_THRESHOLDS = Object.freeze({
  back: [.55, .65, .75, .9, .99], lay: [.1, .25, .5, .75, .9],
  total: [.5, .65, .75, .9], activity: [.25, .5, .75, .9],
  pnl: [-1, -.5, 0, .5, 1], ownLay: [.5, 1, 2, 4],
  oppLay: [.5, 1, 2, 4], volume: [1, 2, 3, 4],
  activitySurplus: [-.5, -.25, 0, .25, .5], pnlPressure: [-1, -.25, 0, .25, 1],
  netFlow: [-.5, -.25, 0, .25, .5],
  layFraction: [.1, .25, .5, .75, .9], otherLayFraction: [.1, .25, .5, .75, .9],
});
export const BASE_PREMATCH_ACTIONS = Object.freeze(['back', 'total', 'activity', 'pnl', 'pnlFade', 'lay']);
export const PREMATCH_ACTIONS = Object.freeze([...BASE_PREMATCH_ACTIONS, 'backFade', 'activityFade']);
const share = (a, b) => a + b ? a / (a + b) : .5;
export function extractRuleAdjustmentFeatures(snap, baselineIndex) {
  const teams = [0, 1].map(i => {
    const key = `team${i + 1}`, v = snap.preMatchVolume[key];
    return { i, b: v.back, l: v.lay, v: v.back + v.lay, p: snap.preMatchPnl[key], n: snap.preMatchTotalBets[key] };
  });
  teams.sort((a, b) => b.b - a.b || b.l - a.l || b.p - a.p || b.n - a.n);
  const [a, b] = teams;
  const volume = a.v + b.v;
  const leader = key => a[key] === b[key] ? baselineIndex : a[key] > b[key] ? a.i : b.i;
  return {
    x: {
      back: share(a.b, b.b), lay: share(a.l, b.l), total: share(a.v, b.v), activity: share(a.n, b.n),
      pnl: (a.p - b.p) / Math.max(Math.abs(a.p), Math.abs(b.p), 1),
      ownLay: a.l / Math.max(a.b, 1), oppLay: b.l / Math.max(b.b, 1), volume: Math.log10(volume + 1),
      activitySurplus: ((a.n - a.v) - (b.n - b.v)) / Math.max(volume, a.n + b.n, 1),
      pnlPressure: (a.p - b.p) / Math.max(volume, 1),
      netFlow: ((a.b - a.l) - (b.b - b.l)) / Math.max(volume, 1),
      layFraction: a.l / Math.max(a.v, 1), otherLayFraction: b.l / Math.max(b.v, 1),
    },
    picks: { base: baselineIndex, back: leader('b'), lay: leader('l'), total: leader('v'), activity: leader('n'), pnl: leader('p'), pnlFade: a.p === b.p ? baselineIndex : 1 - leader('p'), backFade: a.b === b.b ? baselineIndex : 1 - leader('b'), activityFade: a.n === b.n ? baselineIndex : 1 - leader('n') },
  };
}
export function matchesAdjustment(features, rule) {
  return rule.conditions.every(c => c.op === '<=' ? features.x[c.feature] <= c.threshold : features.x[c.feature] >= c.threshold);
}
export function applyRuleAdjustments(features, rules) {
  for (const rule of rules) if (matchesAdjustment(features, rule)) return { index: features.picks[rule.action], rule };
  return { index: features.picks.base, rule: null };
}
export function describeAdjustment(rule) {
  const labels = { back: 'back share', lay: 'lay share', total: 'total-flow share', activity: 'activity share', pnl: 'normalized P/L difference', ownLay: 'lay/back ratio', oppLay: 'opponent lay/back ratio', volume: 'log10 total flow', activitySurplus: 'normalized activity surplus', pnlPressure: 'P/L pressure per total flow', netFlow: 'net back-minus-lay flow', layFraction: 'lay fraction', otherLayFraction: 'opponent lay fraction' };
  const action = {back: 'back leader', lay: 'lay leader', total: 'total-flow leader', activity: 'activity leader', pnl: 'higher pre-match P/L', pnlFade: 'lower pre-match P/L', backFade: 'opposite back leader', activityFade: 'opposite activity leader'}[rule.action];
  return `Pre-match league rule: ${rule.conditions.map(c => `${labels[c.feature]} ${c.op} ${c.threshold}`).join(' and ')} → ${action}`;
}
