// Retrospective research only. This module is not imported by the live predictor.
import { getTradeStats, tradeTimestamp } from '../../frontend/src/utils/bookiePl.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const ratio = (a, b) => b > 0 ? a / b : 0;
const sigmoid = x => 1 / (1 + Math.exp(-clamp(x, -35, 35)));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const mean = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
export const day = t => new Date(Number(t) + 19800000).toISOString().slice(0, 10);

// Feature construction never receives a winner label. All directional features
// reverse sign on a team swap; market-wide context remains unchanged.
export function extract(snapshot) {
  const names = snapshot?.teamNames;
  if (!Array.isArray(names) || names.length !== 2 || names[0] === names[1]) return null;
  const trades = names.map(name => snapshot.teams?.[name]?.trades);
  if (trades.some(t => !Array.isArray(t))) return null;
  const [a, b] = trades.map(getTradeStats);
  if (a.invalid || b.invalid) return null;
  const total = a.tBack + a.tLay + b.tBack + b.tLay;
  if (!(total > 0)) return null;
  const bl = a.tBackLiab + b.tBackLiab;
  const ll = a.tLayLiab + b.tLayLiab;
  const pl1 = -a.tBackLiab + a.tLayLiab + b.tBack - b.tLay;
  const pl2 = -b.tBackLiab + b.tLayLiab + a.tBack - a.tLay;
  const totalDelta = (a.tBack + a.tLay - b.tBack - b.tLay) / total;
  const backDelta = (a.tBack - b.tBack) / total;
  const layDelta = (a.tLay - b.tLay) / total;
  const effective = backDelta - layDelta;
  const liabilityDelta = ratio(pl2 - pl1, bl + ll + total);
  const shareDelta = ratio(a.tBack - b.tBack, a.tBack + b.tBack);
  const layShareDelta = ratio(a.tLay - b.tLay, a.tLay + b.tLay);
  const layFraction = (a.tLay + b.tLay) / total;
  const oddsBackDelta = a.tBack > 0 && b.tBack > 0 ? clamp(a.tBackLiab / a.tBack - b.tBackLiab / b.tBack, -2, 2) : 0;
  const oddsLayDelta = a.tLay > 0 && b.tLay > 0 ? clamp(a.tLayLiab / a.tLay - b.tLayLiab / b.tLay, -2, 2) : 0;
  const maxShare = tr => Math.max(0, ...tr.map(t => Number(t.size))) / total;
  const concentrationDelta = maxShare(trades[0]) - maxShare(trades[1]);
  const liquidity = clamp((Math.log1p(total) - Math.log(1001)) / 3, -2, 2);
  const featureGroups = {
    flow: [backDelta, layDelta],
    priced: [backDelta, layDelta, liabilityDelta, oddsBackDelta, oddsLayDelta],
    context: [backDelta, layDelta, liabilityDelta, oddsBackDelta, oddsLayDelta,
      effective * Math.abs(effective), effective * layFraction,
      effective * liquidity, concentrationDelta],
  };
  return {
    names, stats: [a, b], pl: [pl1, pl2], total,
    backDelta, layDelta, effective, liabilityDelta, totalDelta,
    shareDelta, layShareDelta, layFraction, concentrationDelta,
    featureGroups,
    treeX: [...featureGroups.priced, layFraction, liquidity, concentrationDelta],
    treeMirrored: [...featureGroups.priced.map(x => -x), layFraction, liquidity, -concentrationDelta],
    tradeTimes: trades.flat().map(tradeTimestamp),
  };
}

// Small, pre-declared candidate family: 1 chance baseline, 9 regularized
// logistic fits, and 4 shallow trees. No match IDs, team names, winner-side
// features, league identity, calendar-day rules or provider predictions.
export const candidates = [
  { id: 'chance', type: 'constant', complexity: 0 },
  ...['flow', 'priced', 'context'].flatMap((group, gi) => [1, 0.1, 0.01].map(lambda => ({
    id: `logistic-${group}-${lambda}`, type: 'logistic', group, lambda, complexity: 1 + gi,
  }))),
  ...[1, 2].flatMap(depth => [20, 12].map(minLeaf => ({
    id: `tree-depth${depth}-leaf${minLeaf}`, type: 'tree', depth, minLeaf, complexity: depth + 3,
  }))),
];

function solve(matrix, vector) {
  const m = matrix.map((row, i) => [...row, vector[i]]), n = vector.length;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    const v = m[c][c];
    if (Math.abs(v) < 1e-14) throw new Error('Singular logistic Hessian');
    for (let j = c; j <= n; j++) m[c][j] /= v;
    for (let r = 0; r < n; r++) if (r !== c) {
      const k = m[r][c];
      for (let j = c; j <= n; j++) m[r][j] -= k * m[c][j];
    }
  }
  return m.map(row => row[n]);
}

export function fit(spec, rows) {
  if (spec.type === 'constant') return { predict: () => 0.5, parameters: {} };
  if (spec.type === 'logistic') {
    const xs = rows.map(r => r.f.featureGroups[spec.group]), n = rows.length, k = xs[0].length;
    // RMS scaling is learned on training only. Zero intercept preserves symmetry.
    const scale = Array.from({ length: k }, (_, j) => Math.max(0.05, Math.sqrt(mean(xs.map(x => x[j] ** 2)))));
    const z = xs.map(x => x.map((v, j) => v / scale[j]));
    let w = Array(k).fill(0);
    for (let iteration = 0; iteration < 40; iteration++) {
      const g = w.map(v => spec.lambda * v);
      const h = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => i === j ? spec.lambda : 0));
      for (let i = 0; i < n; i++) {
        const p = sigmoid(dot(w, z[i])), d = p - rows[i].y;
        for (let j = 0; j < k; j++) {
          g[j] += d * z[i][j] / n;
          for (let q = 0; q < k; q++) h[j][q] += p * (1 - p) * z[i][j] * z[i][q] / n;
        }
      }
      const step = solve(h, g);
      w = w.map((v, j) => v - step[j]);
      if (Math.max(...step.map(Math.abs)) < 1e-8) break;
    }
    return { predict: f => sigmoid(dot(w, f.featureGroups[spec.group].map((v, j) => v / scale[j]))), parameters: { weights: w, scale } };
  }
  const augmented = rows.flatMap(r => [{ x: r.f.treeX, y: r.y }, { x: r.f.treeMirrored, y: 1 - r.y }]);
  function build(data, depth) {
    const successes = data.reduce((s, r) => s + r.y, 0);
    const node = { p: (successes + 2) / (data.length + 4), n: data.length };
    if (!depth || data.length < 4 * spec.minLeaf) return node;
    let best = null, bestLoss = successes - successes ** 2 / data.length;
    for (let j = 0; j < data[0].x.length; j++) {
      const sorted = [...data].sort((a, b) => a.x[j] - b.x[j]);
      let leftY = 0;
      for (let i = 1; i < sorted.length; i++) {
        leftY += sorted[i - 1].y;
        if (i < 2 * spec.minLeaf || sorted.length - i < 2 * spec.minLeaf || sorted[i].x[j] === sorted[i - 1].x[j]) continue;
        const rightY = successes - leftY;
        const loss = leftY - leftY ** 2 / i + rightY - rightY ** 2 / (sorted.length - i);
        if (loss < bestLoss - 1e-9) {
          bestLoss = loss;
          best = { feature: j, threshold: (sorted[i].x[j] + sorted[i - 1].x[j]) / 2 };
        }
      }
    }
    if (!best) return node;
    return { ...node, ...best, left: build(data.filter(r => r.x[best.feature] <= best.threshold), depth - 1), right: build(data.filter(r => r.x[best.feature] > best.threshold), depth - 1) };
  }
  const tree = build(augmented, spec.depth);
  const predict = (node, x) => node.left ? predict(x[node.feature] <= node.threshold ? node.left : node.right, x) : node.p;
  return { predict: f => (predict(tree, f.treeX) + 1 - predict(tree, f.treeMirrored)) / 2, parameters: tree };
}

export function dateFolds(rows, fraction = 0.4, count = 4) {
  const days = [...new Set(rows.map(r => r.date))].sort();
  const first = Math.max(3, Math.floor(days.length * fraction)), remaining = days.length - first;
  return Array.from({ length: count }, (_, i) => {
    const start = first + Math.floor(remaining * i / count), end = first + Math.floor(remaining * (i + 1) / count);
    const train = rows.filter(r => r.date < days[start]);
    const test = rows.filter(r => r.date >= days[start] && (end === days.length || r.date < days[end]));
    if (!train.length || !test.length || train.some(a => test.some(b => a.id === b.id || a.date >= b.date))) throw new Error('Invalid temporal split');
    return { train, test };
  });
}

export function evaluate(rows, predict) {
  return rows.map(r => ({ id: r.id, date: r.date, league: r.league, y: r.y, p: clamp(predict(r.f), 1e-9, 1 - 1e-9) }));
}

export function summarize(predictions) {
  const n = predictions.length, picked = predictions.filter(r => Math.abs(r.p - 0.5) > 1e-10);
  const correct = picked.filter(r => (r.p > 0.5 ? 1 : 0) === r.y).length;
  const count = picked.length, z = 1.959964, rate = count ? correct / count : 0;
  const center = count ? (rate + z*z/(2*count))/(1+z*z/count) : null;
  const margin = count ? z*Math.sqrt(rate*(1-rate)/count+z*z/(4*count*count))/(1+z*z/count) : null;
  return {
    n, picks: count, correct, wrong: count - correct, abstained: n - count,
    accuracy: count ? correct / count : null, coverage: n ? count / n : 0,
    wilson95: count ? [center - margin, center + margin] : null,
    brier: mean(predictions.map(r => (r.p - r.y) ** 2)),
    logLoss: mean(predictions.map(r => -(r.y * Math.log(r.p) + (1-r.y) * Math.log(1-r.p)))),
  };
}

export function selectModel(rows) {
  const folds = dateFolds(rows, 0.5, 3);
  const scores = candidates.map(spec => {
    const losses = folds.map(({ train, test }) => summarize(evaluate(test, fit(spec, train).predict)).brier);
    const avg = mean(losses);
    const se = Math.sqrt(losses.reduce((s, x) => s + (x - avg)**2, 0) / (losses.length - 1) / losses.length);
    return { spec, loss: avg, se };
  });
  const best = [...scores].sort((a,b) => a.loss-b.loss)[0];
  // One-standard-error choice favours fewer features / stronger regularization.
  const selected = scores.filter(s => s.loss <= best.loss + best.se + 1e-12).sort((a,b) => a.spec.complexity-b.spec.complexity || (b.spec.lambda||0)-(a.spec.lambda||0) || a.loss-b.loss)[0];
  return { spec: selected.spec, innerBrier: selected.loss, scores: scores.map(s => ({ model:s.spec.id, brier:s.loss, se:s.se })) };
}

export const factorRules = [
  ['total', 'Higher total matched stakes', f => f.totalDelta],
  ['back', 'Higher Back stakes', f => f.backDelta],
  ['lay_fade', 'Lower Lay stakes', f => -f.layDelta],
  ['lay_follow', 'Higher Lay stakes', f => f.layDelta],
  ['effective', 'Back(A) + Lay(B) dominates', f => f.effective],
  ['liability', 'Lower bookie P/L outcome', f => f.liabilityDelta],
  ['liability_fade', 'Higher bookie P/L outcome', f => -f.liabilityDelta],
  ['overload90', 'Follow total; fade at 90% share', f => Math.abs(f.totalDelta) >= 0.8 ? -f.totalDelta : f.totalDelta],
];
export const directionProbability = v => Math.abs(v) < 1e-10 ? 0.5 : v > 0 ? 0.6 : 0.4;
