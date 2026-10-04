import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLeagueMatchAlgorithm, predictNormalLeagueMatch } from '../../../server/utils/normalLeagueMatchPredictor.mjs';
import { extractMatchFeatures } from '../../../server/utils/matchNumericFeatures.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const records = JSON.parse(fs.readFileSync(path.join(root, 'server/data/match_dataset.json'))).records;
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const samples = records.filter(row => row.status === 'verified'
  && row.actualWinner !== 'No Result'
  && row.resultVerification?.verification === 'verified')
  .flatMap(row => {
    const input = { ...row.snapshot, competitionName: row.competitionName };
    const prediction = predictNormalLeagueMatch(input), features = extractMatchFeatures(input);
    if (!prediction || !features) return [];
    const actualIndex = row.snapshot.teamNames.findIndex(name => normalize(name) === normalize(row.actualWinner));
    if (actualIndex < 0) throw new Error(`Actual winner outside fixture ${row.matchId}`);
    return [{ matchId: String(row.matchId), league: getLeagueMatchAlgorithm(row.competitionName)?.league || row.competitionName,
      matchName: row.snapshot.teamNames.join(' v '), startTime: Number(row.startTime), actualWinner: row.actualWinner,
      predictedWinner: prediction.winner, correct: prediction.winnerIdx === actualIndex,
      algorithmId: prediction.algorithmId, profileVersion: prediction.profileVersion,
      reason: prediction.reason, featureVector: features.values }];
  }).sort((a, b) => a.startTime - b.startTime || a.matchId.localeCompare(b.matchId));

const baselinePath = path.join(directory, 'v7-baseline.json');
if (process.argv.includes('--capture-baseline')) {
  if (fs.existsSync(baselinePath)) throw new Error('v7 baseline already exists; refusing to overwrite it');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(baselinePath, JSON.stringify({ generatedAt: new Date().toISOString(),
    purpose: 'Immutable pre-v8 comparison baseline', rows: samples }, null, 2) + '\n');
  console.log(`Captured ${samples.length} v7 predictions at ${baselinePath}`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath));
const currentById = new Map(samples.map(row => [row.matchId, row]));
const comparisons = baseline.rows.map(previous => {
  const current = currentById.get(previous.matchId);
  if (!current) throw new Error(`Current replay missing ${previous.matchId}`);
  return { matchId: previous.matchId, league: previous.league, matchName: previous.matchName,
    actualWinner: previous.actualWinner, previousPrediction: previous.predictedWinner,
    currentPrediction: current.predictedWinner, previousCorrect: previous.correct, currentCorrect: current.correct,
    status: previous.correct ? current.correct ? 'preserved-correct' : 'regressed' : current.correct ? 'corrected' : 'still-failed',
    currentReason: current.reason, featureVector: current.featureVector };
});
const previousCorrect = comparisons.filter(row => row.previousCorrect).length;
const currentCorrect = comparisons.filter(row => row.currentCorrect).length;
const regressions = comparisons.filter(row => row.status === 'regressed');
const corrections = comparisons.filter(row => row.status === 'corrected');
const failures = comparisons.filter(row => row.status === 'still-failed');
const leagues = [...new Set(comparisons.map(row => row.league))].map(league => {
  const rows = comparisons.filter(row => row.league === league);
  return { league, total: rows.length, previousMisses: rows.filter(row => !row.previousCorrect).length,
    corrected: rows.filter(row => row.status === 'corrected').length,
    regressions: rows.filter(row => row.status === 'regressed').length,
    remainingMisses: rows.filter(row => row.status === 'still-failed').length };
}).filter(row => row.previousMisses || row.regressions).sort((a, b) => b.previousMisses - a.previousMisses || a.league.localeCompare(b.league));
const report = { generatedAt: new Date().toISOString(), baselineGeneratedAt: baseline.generatedAt,
  examples: comparisons.length, previous: { correct: previousCorrect, wrong: comparisons.length - previousCorrect },
  current: { correct: currentCorrect, wrong: comparisons.length - currentCorrect },
  corrections: corrections.length, regressions: regressions.length, regressionGatePassed: regressions.length === 0,
  leagues, auditedFailures: comparisons.filter(row => !row.previousCorrect), methods: [
    'Only independently verified winner records with usable frozen pre-match inputs are scored.',
    'The immutable v7 prediction baseline is compared match-by-match with the current algorithm.',
    'A release fails this audit if any previously correct v7 match becomes wrong.',
    'Corrections are retrospective development evidence, not a future accuracy guarantee.',
  ] };
fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(report, null, 2) + '\n');
const table = leagues.map(row => `| ${row.league} | ${row.previousMisses} | ${row.corrected} | ${row.remainingMisses} | ${row.regressions} |`).join('\n');
fs.writeFileSync(path.join(directory, 'README.md'), `# Failed-match regression audit\n\n`
  + `The immutable v7 baseline scored **${previousCorrect}/${comparisons.length}**. The current replay scores **${currentCorrect}/${comparisons.length}**, with **${corrections.length} corrections**, **${failures.length} remaining failures**, and **${regressions.length} regressions**.\n\n`
  + `| League | v7 misses | Corrected | Remaining | Regressions |\n|---|---:|---:|---:|---:|\n${table}\n\n`
  + `Every v7 failure is listed in \`results.json\`. Previously correct matches are protected by a hard zero-regression gate. Results are retrospective and do not guarantee future accuracy.\n`);
console.log(JSON.stringify({ examples: report.examples, previous: report.previous, current: report.current,
  corrections: report.corrections, remainingFailures: failures.length, regressions: report.regressions,
  regressionGatePassed: report.regressionGatePassed }, null, 2));
if (regressions.length) process.exitCode = 1;
