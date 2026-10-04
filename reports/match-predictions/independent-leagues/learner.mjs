import { FEATURE_NAMES } from '../../../server/utils/matchNumericFeatures.mjs';
import { evaluateLeagueModel } from '../../../server/utils/leagueProfileRuntime.mjs';

const impurity = (ones, size) => size ? 2 * ones * (size - ones) / size : 0;

export function fitTree(rows, { maxDepth = 64, minLeaf = 1, features = FEATURE_NAMES.map((_, i) => i) } = {}, depth = 0) {
  if (!rows.length) return null;
  const ones = rows.reduce((sum, row) => sum + row.y, 0);
  const leaf = { side: ones > rows.length / 2 ? 1 : 0, samples: rows.length };
  if (!ones || ones === rows.length || depth >= maxDepth || rows.length < minLeaf * 2) return leaf;
  let best = null;
  for (const feature of features) {
    const ordered = [...rows].sort((a, b) => a.x[feature] - b.x[feature]);
    let leftOnes = 0;
    for (let index = 0; index < ordered.length - 1; index++) {
      leftOnes += ordered[index].y;
      const size = index + 1, low = ordered[index].x[feature], high = ordered[index + 1].x[feature];
      if (size < minLeaf || ordered.length - size < minLeaf || low === high) continue;
      const loss = impurity(leftOnes, size) + impurity(ones - leftOnes, ordered.length - size);
      if (!best || loss < best.loss - 1e-12) {
        let threshold = low + (high - low) / 2;
        if (threshold >= high) threshold = low;
        best = { feature, threshold, loss };
      }
    }
  }
  if (!best) return leaf;
  const left = rows.filter(row => row.x[best.feature] <= best.threshold);
  const right = rows.filter(row => row.x[best.feature] > best.threshold);
  return { feature: best.feature, threshold: best.threshold,
    left: fitTree(left, { maxDepth, minLeaf, features }, depth + 1), right: fitTree(right, { maxDepth, minLeaf, features }, depth + 1) };
}

export const CANDIDATES = Object.freeze([
  { id: 'league-rules', kind: 'rules', complexity: 0 },
  { id: 'tree-depth-1', kind: 'tree', maxDepth: 1, minLeaf: 2, complexity: 1 },
  { id: 'tree-depth-2', kind: 'tree', maxDepth: 2, minLeaf: 2, complexity: 2 },
  { id: 'tree-depth-3', kind: 'tree', maxDepth: 3, minLeaf: 2, complexity: 3 },
  { id: 'tree-depth-4', kind: 'tree', maxDepth: 4, minLeaf: 1, complexity: 4 },
  { id: 'tree-full', kind: 'tree', maxDepth: 64, minLeaf: 1, complexity: 5 },
  ...[2, 3, 4].map(minSupport => ({ id: `guarded-tree-${minSupport}`, kind: 'tree', maxDepth: 64, minLeaf: 1, minSupport, complexity: 5 })),
  ...[1, 2, 3, 4, 64].flatMap(maxDepth => [2, 3].map(minSupport => ({
    id: `correction-tree-${maxDepth}-support-${minSupport}`, kind: 'correction',
    maxDepth, minLeaf: 1, minSupport, complexity: 4,
  }))),
  ...[3, 64].flatMap(maxDepth => [.5, .7].map(consensus => ({ id: `forest-${maxDepth}-${consensus}`, kind: 'forest', maxDepth, minLeaf: 1, consensus, complexity: 7 }))),
  ...[.15, .35, .7, 1.4].flatMap(radius => [1, 3].map(neighbors => ({ id: `neighbors-${neighbors}-radius-${radius}`, kind: 'neighbors', radius, neighbors, complexity: 6 }))),
]);
export function fitCandidate(rows, candidate) {
  if (candidate.kind === 'correction') return {
    correctionTree: fitTree(rows.map(row => ({ ...row, y: row.base === row.y ? 0 : 1 })), candidate),
    minSupport: candidate.minSupport,
  };
  if (candidate.kind === 'tree') return { tree: fitTree(rows, candidate), minSupport: candidate.minSupport || 1 };
  if (candidate.kind === 'forest') {
    let state = 731;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const forest = Array.from({ length: 31 }, () => {
      const bootstrap = Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)]);
      const features = FEATURE_NAMES.map((_, i) => ({ index: i, random: random() })).sort((a, b) => a.random - b.random).slice(0, 4).map(item => item.index);
      return fitTree(bootstrap, { ...candidate, features });
    });
    return { forest, consensus: candidate.consensus };
  }
  if (candidate.kind === 'neighbors') return { neighbors: rows.map(row => ({ values: row.x, side: row.y })), radius: candidate.radius, count: candidate.neighbors };
  return {};
}
export function evaluateCandidate(model, values, baseline) {
  return evaluateLeagueModel(model, values, baseline).side;
}
const accuracy = rows => {
  const correct = rows.filter(row => row.correct).length;
  return { total: rows.length, correct, wrong: rows.length - correct, accuracy: rows.length ? Number((100 * correct / rows.length).toFixed(1)) : null };
};
export const score = accuracy;

export function selectProfile(input) {
  const rows = [...input].sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
  const base = CANDIDATES[0];
  if (rows.length < 6) return { candidate: base, tree: null, folds: [], selection: rows.length ? 'insufficient-history' : 'awaiting-data' };
  const folds = [.6, .8].map(fraction => {
    const cutoff = rows[Math.floor(rows.length * fraction)].date;
    return { fraction, train: rows.filter(row => row.date < cutoff), test: rows.filter(row => row.date >= cutoff) };
  }).filter(fold => fold.train.length >= 3 && fold.test.length >= 2);
  if (folds.length < 2) return { candidate: base, tree: null, folds: [], selection: 'insufficient-time-splits' };
  const baseTrainingCorrect = rows.filter(row => row.base === row.y).length;
  const options = CANDIDATES.map(candidate => {
    const validation = folds.map(fold => {
      const model = fitCandidate(fold.train, candidate);
      const correct = fold.test.filter(row => evaluateCandidate(model, row.x, row.base) === row.y).length;
      const baseCorrect = fold.test.filter(row => row.base === row.y).length;
      return { fraction: fold.fraction, trainingSamples: fold.train.length, testSamples: fold.test.length, correct, baseCorrect };
    });
    const model = fitCandidate(rows, candidate);
    const trainingCorrect = rows.filter(row => evaluateCandidate(model, row.x, row.base) === row.y).length;
    return { candidate, ...model, folds: validation, validationCorrect: validation.reduce((sum, fold) => sum + fold.correct, 0), trainingCorrect };
  }).filter(option => option.folds.every(fold => fold.correct >= fold.baseCorrect)
    && option.trainingCorrect >= baseTrainingCorrect
    && (option.candidate.kind === 'rules' || option.folds.some(fold => fold.correct > fold.baseCorrect)));
  options.sort((a, b) => b.validationCorrect - a.validationCorrect || b.trainingCorrect - a.trainingCorrect || a.candidate.complexity - b.candidate.complexity);
  return { ...options[0], selection: 'two-chronological-development-splits' };
}
