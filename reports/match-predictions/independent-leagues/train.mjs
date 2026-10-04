import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LEAGUE_MATCH_ALGORITHMS, getLeagueMatchAlgorithm, predictFrozenLeagueRules } from '../../../server/utils/normalLeagueMatchPredictor.mjs';
import { LEAGUE_PREMATCH_ADJUSTMENTS } from '../../../server/utils/leaguePreMatchAdjustments.mjs';
import { checkMatchRecordQuality } from '../../../server/services/matchRecordQuality.js';
import { loadMatchDataset } from '../../../server/services/adminMatchDataset.js';
import { extractMatchFeatures, evaluateNumericTree, FEATURE_NAMES } from '../../../server/utils/matchNumericFeatures.mjs';
import { fitTree, selectProfile, score, evaluateCandidate } from './learner.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const sourceHashes = Object.fromEntries(['match_dataset.json', 'emirates_d10_dataset.json', 'wncl_dataset.json'].map(name => [
  name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'server/data', name))).digest('hex'),
]));
const data = await loadMatchDataset({ predict: () => null });
const milliseconds = value => {
  const numeric = Number(value);
  return value === null || value === undefined || value === '' ? NaN : Number.isFinite(numeric)
    ? numeric < 1e12 ? numeric * 1000 : numeric : Date.parse(value);
};
const samples = data.records.filter(row => row.status === 'verified'
  && (row.resultVerification?.verification === 'verified' || row.resultVerification?.status === 'verified')
  && checkMatchRecordQuality(row).valid)
  .map(row => {
    const input = { ...row.snapshot, competitionName: row.competitionName };
    const features = extractMatchFeatures(input), baseline = predictFrozenLeagueRules(input);
    if (!features || !baseline) throw new Error(`Unscorable verified row: ${row.matchId}`);
    return { id: String(row.matchId), league: getLeagueMatchAlgorithm(row.competitionName).league,
      date: milliseconds(row.resultVerification.source === 'CREX' ? row.startTime : row.resultVerification.sourceStartTime || row.startTime), x: features.values,
      y: features.teams.findIndex(team => row.snapshot.teamNames[team.index] === row.actualWinner),
      base: features.teams.findIndex(team => team.index === baseline.winnerIdx) };
  }).sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
if (samples.some(row => row.y < 0 || !Number.isFinite(row.date))) throw new Error('Invalid training label or timestamp');
const results = LEAGUE_MATCH_ALGORITHMS.map(algorithm => {
  const rows = samples.filter(row => row.league === algorithm.league);
  const selected = selectProfile(rows);
  const replay = score(rows.map(row => ({ correct: evaluateCandidate(selected, row.x, row.base) === row.y })));
  const baseline = score(rows.map(row => ({ correct: row.base === row.y })));
  const historicalTree = fitTree(rows);
  const trainingFit = score(rows.map(row => ({ correct: evaluateNumericTree(historicalTree, row.x).side === row.y })));
  const walk = rows.map(row => {
    const earlier = rows.filter(item => item.date < row.date);
    const profile = selectProfile(earlier);
    return { matchId: row.id, trainingSamples: earlier.length, correct: evaluateCandidate(profile, row.x, row.base) === row.y, baseCorrect: row.base === row.y };
  });
  return { league: algorithm.league, ...selected, replay, baseline, trainingFit, historicalTree,
    walkForward: score(walk), walkForwardBaseline: score(walk.map(row => ({ correct: row.baseCorrect }))),
    walkForwardRows: walk,
    ranges: rows.length ? FEATURE_NAMES.map((_, i) => [Math.min(...rows.map(row => row.x[i])), Math.max(...rows.map(row => row.x[i]))]) : null,
  };
});
const aggregate = key => ({ total: results.reduce((sum, row) => sum + row[key].total, 0), correct: results.reduce((sum, row) => sum + row[key].correct, 0), wrong: results.reduce((sum, row) => sum + row[key].wrong, 0) });
const cutoff = samples[Math.floor(samples.length * .8)].date;
const earlierSamples = samples.filter(row => row.date < cutoff);
const laterSamples = samples.filter(row => row.date >= cutoff);
const holdoutRows = laterSamples.map(row => {
  const profile = selectProfile(earlierSamples.filter(item => item.league === row.league));
  return { matchId: row.id, correct: evaluateCandidate(profile, row.x, row.base) === row.y, baseCorrect: row.base === row.y };
});
const report = { generatedAt: new Date().toISOString(), sourceHashes,
  datasetHash: crypto.createHash('sha256').update(JSON.stringify(sourceHashes)).digest('hex'),
  leagueCount: results.length, baseline: aggregate('baseline'), activeReplay: aggregate('replay'), trainingFit: aggregate('trainingFit'),
  walkForward: aggregate('walkForward'), walkForwardBaseline: aggregate('walkForwardBaseline'),
  chronological: { trainingSamples: earlierSamples.length, testSamples: laterSamples.length, selected: score(holdoutRows), baseline: score(holdoutRows.map(row => ({ correct: row.baseCorrect }))) },
  methods: ['Source-verified winners are loaded from the same quality-gated, deduplicated main, WNCL and Emirates D10 datasets as the admin view.',
    'Only frozen numeric back/lay volume, P/L and activity are features. IDs, team identity, dates and outcomes are excluded from inference.',
    'Each league is fitted independently. Candidate selection uses 60% and 80% chronological development splits and rejects regression against the fixed v4 rules on either split.',
    'Less than six verified league examples retain a dedicated league rules profile. Unrestricted trees are fitted separately for historical training-fit inspection only.',
    'Walk-forward fits each model on strictly earlier league labels. Equal-time examples cannot train on each other.',
    'The dataset and v4 rules were already used during previous development; temporal checks are retrospective diagnostics, not pristine holdouts or guarantees of future accuracy.'],
  results };
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(report, null, 2) + '\n');
const profileDirectory = path.join(root, 'server/utils/matchLeagueProfiles');
fs.mkdirSync(profileDirectory, { recursive: true });
const manifest = [];
for (const [index, result] of results.entries()) {
  const slug = result.league.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const algorithm = LEAGUE_MATCH_ALGORITHMS.find(item => item.league === result.league);
  const parameters = { ...algorithm.parameters };
  const baselineAdjustments = LEAGUE_PREMATCH_ADJUSTMENTS[result.league]?.rules || [];
  const model = result.candidate.kind === 'rules' ? null : Object.fromEntries(['tree', 'correctionTree', 'minSupport', 'forest', 'consensus', 'neighbors', 'radius', 'count'].filter(key => result[key] !== undefined).map(key => [key, result[key]]));
  const profileHash = crypto.createHash('sha256').update(JSON.stringify({ league: result.league, parameters, baselineAdjustments, model, trainingTree: result.historicalTree })).digest('hex').slice(0, 12);
  const configuration = {
    league: result.league, algorithmId: `match-${slug}-independent-v1`,
    profileVersion: `league-v1-${profileHash}`, strategy: result.candidate.id,
    parameters, baselineAdjustments, model, trainingTree: result.historicalTree,
    trainingSamples: result.replay.total, ranges: result.ranges,
    validationStatus: result.replay.total < 6 ? result.replay.total ? 'insufficient-history' : 'awaiting-data'
      : result.folds.length < 2 ? 'insufficient-time-splits' : 'retrospective-development-checks',
    evaluation: { baseline: result.baseline, replay: result.replay, trainingFit: result.trainingFit,
      walkForward: result.walkForward, walkForwardBaseline: result.walkForwardBaseline,
      developmentFolds: result.folds, selection: result.selection },
    datasetHash: report.datasetHash,
  };
  fs.writeFileSync(path.join(profileDirectory, `${slug}.mjs`),
    `// Generated by reports/match-predictions/independent-leagues/train.mjs.\nimport { defineLeagueProfile } from '../leagueProfileRuntime.mjs';\n\nexport default defineLeagueProfile(${JSON.stringify(configuration, null, 2)});\n`);
  manifest.push({ slug, name: `profile${index}` });
}
fs.writeFileSync(path.join(profileDirectory, 'index.mjs'),
  manifest.map(item => `import ${item.name} from './${item.slug}.mjs';`).join('\n')
    + `\n\nexport const INDEPENDENT_LEAGUE_PROFILES = Object.freeze([${manifest.map(item => item.name).join(', ')}]);\n`);
console.log(JSON.stringify({ leagueCount: report.leagueCount, baseline: report.baseline, activeReplay: report.activeReplay, trainingFit: report.trainingFit, walkForward: report.walkForward, selected: results.filter(row => row.candidate.kind !== 'rules').map(row => ({ league: row.league, candidate: row.candidate.id, replay: row.replay, walkForward: row.walkForward })) }, null, 2));
