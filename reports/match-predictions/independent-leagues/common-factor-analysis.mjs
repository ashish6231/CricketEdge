import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMatchDataset } from '../../../server/services/adminMatchDataset.js';
import { checkMatchRecordQuality } from '../../../server/services/matchRecordQuality.js';
import { extractMatchFeatures, FEATURE_NAMES } from '../../../server/utils/matchNumericFeatures.mjs';
import { predictNormalLeagueMatch } from '../../../server/utils/normalLeagueMatchPredictor.mjs';
import { LEAGUE_PREMATCH_ADJUSTMENTS } from '../../../server/utils/leaguePreMatchAdjustments.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const percent = (correct, total) => total ? Number((100 * correct / total).toFixed(1)) : null;
const score = (rows, select) => {
  const correct = rows.filter(row => select(row) === row.winnerSide).length;
  return { total: rows.length, correct, wrong: rows.length - correct, accuracy: percent(correct, rows.length) };
};
const timestamp = row => Number(row.resultVerification?.source === 'CREX'
  ? row.startTime : row.resultVerification?.sourceStartTime || row.startTime);

const data = await loadMatchDataset({ predict: () => null });
const rows = data.records.filter(row => row.status === 'verified'
  && (row.resultVerification?.verification === 'verified' || row.resultVerification?.status === 'verified')
  && checkMatchRecordQuality(row).valid).map(row => {
    const snapshot = { ...row.snapshot, competitionName: row.competitionName };
    const features = extractMatchFeatures(snapshot);
    const active = predictNormalLeagueMatch(snapshot);
    const winnerSide = features.teams.findIndex(team =>
      normalize(snapshot.teamNames[team.index]) === normalize(row.actualWinner));
    const activeSide = features.teams.findIndex(team => team.index === active.winnerIdx);
    const leader = features.teams[0], other = features.teams[1];
    const side = field => leader[field] === other[field] ? activeSide : leader[field] > other[field] ? 0 : 1;
    return { matchId: String(row.matchId), league: row.league || row.competitionName,
      date: timestamp(row), values: features.values, winnerSide, activeSide,
      picks: { totalFlow: 0, backFlow: side('back'), layFlow: side('lay'),
        activity: side('bets'), higherPnl: side('pnl'), lowerPnl: 1 - side('pnl') } };
  }).sort((a, b) => a.date - b.date || a.matchId.localeCompare(b.matchId));

const factorScores = Object.fromEntries(['active', 'totalFlow', 'backFlow', 'layFlow', 'activity', 'higherPnl', 'lowerPnl'].map(name => [
  name, score(rows, row => name === 'active' ? row.activeSide : row.picks[name]),
]));
const cutoff = rows[Math.floor(rows.length * .8)].date;
const earlier = rows.filter(row => row.date < cutoff), later = rows.filter(row => row.date >= cutoff);
const chronological = {
  trainingExamples: earlier.length, laterExamples: later.length, cutoff,
  active: score(later, row => row.activeSide), totalFlow: score(later, row => row.picks.totalFlow),
  backFlow: score(later, row => row.picks.backFlow), layFlow: score(later, row => row.picks.layFlow),
};
const quintiles = Object.fromEntries(FEATURE_NAMES.map((name, feature) => {
  const ordered = [...rows].sort((a, b) => a.values[feature] - b.values[feature]);
  return [name, Array.from({ length: 5 }, (_, index) => {
    const slice = ordered.slice(Math.floor(index * ordered.length / 5), Math.floor((index + 1) * ordered.length / 5));
    const values = slice.map(row => row.values[feature]);
    const leaderWins = slice.filter(row => row.winnerSide === 0).length;
    return { bucket: index + 1, minimum: Math.min(...values), maximum: Math.max(...values),
      examples: slice.length, dominantFlowSideWon: leaderWins, accuracy: percent(leaderWins, slice.length) };
  })];
}));
const perLeague = [...new Set(rows.map(row => row.league))].sort().map(league => {
  const leagueRows = rows.filter(row => row.league === league);
  return { league, examples: leagueRows.length,
    active: score(leagueRows, row => row.activeSide),
    totalFlow: score(leagueRows, row => row.picks.totalFlow),
    validationStatus: data.leagues.find(item => item.league === league)?.validationStatus || 'unregistered' };
});
const updatedLeagues = Object.entries(LEAGUE_PREMATCH_ADJUSTMENTS)
  .filter(([, settings]) => settings.rules?.length).map(([league, settings]) => ({ league, rules: settings.rules.length }));
const report = {
  generatedAt: new Date().toISOString(), examples: rows.length, leagueProfiles: data.leagues.length,
  allowedInputs: ['preMatchVolume.back', 'preMatchVolume.lay', 'preMatchPnl', 'preMatchTotalBets'],
  excludedInputs: ['team identity', 'match ID', 'date as a feature', 'actual winner', 'final score', 'live fields'],
  factorScores, chronological, quintiles, perLeague, updatedLeagues,
  finding: {
    commonFactor: 'Relative market-flow dominance, expressed by total/back/lay share with P/L context.',
    evidence: `The dominant total-flow side won ${factorScores.totalFlow.correct}/${factorScores.totalFlow.total} (${factorScores.totalFlow.accuracy}%) overall.`,
    constraint: `On the latest chronological block it was ${chronological.totalFlow.correct}/${chronological.totalFlow.total} (${chronological.totalFlow.accuracy}%), so it is not safe as a universal override.`,
    deploymentDecision: 'Keep independent league rules; activate only league adjustments that do not regress on both internal chronological development splits.',
  },
};
fs.writeFileSync(path.join(directory, 'common-factor-results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ examples: report.examples, leagueProfiles: report.leagueProfiles,
  factorScores, chronological, updatedLeagues, finding: report.finding }, null, 2));
