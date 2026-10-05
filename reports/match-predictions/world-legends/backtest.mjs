import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PREDICTOR_VERSION, predictNormalLeagueMatch } from '../../../server/utils/normalLeagueMatchPredictor.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const datasetPath = path.join(root, 'server/data/match_dataset.json');
const outcomesPath = path.join(directory, 'outcomes.json');
const reportPath = path.join(directory, 'results.json');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const round = value => Number.isFinite(value) ? +value.toFixed(1) : null;

export function runWorldLegendsBacktest(dataset, outcomes) {
  const league = outcomes.league;
  const cutoffTime = Date.parse(outcomes.cutoff);
  if (!Number.isFinite(cutoffTime)) throw new Error('Invalid World Legends backtest cutoff');
  const records = dataset.records
    .filter(record => record.competitionName === league && Number(record.startTime) <= cutoffTime)
    .sort((a, b) => Number(a.startTime) - Number(b.startTime) || String(a.matchId).localeCompare(String(b.matchId)));
  const outcomeById = new Map(outcomes.fixtures.map(fixture => [String(fixture.matchId), fixture]));
  if (outcomeById.size !== outcomes.fixtures.length) throw new Error('Duplicate World Legends outcome matchId');

  const rows = records.map(record => {
    const snapshot = record.snapshot || {};
    // Deliberately omit every in-play/derived field. This is the exact input
    // boundary used to prove that the replay cannot learn from the result.
    const frozenInput = {
      competitionName: record.competitionName,
      teamNames: [record.team1, record.team2],
      preMatchVolume: snapshot.preMatchVolume,
      preMatchPnl: snapshot.preMatchPnl,
      preMatchTotalBets: snapshot.preMatchTotalBets,
    };
    const prediction = predictNormalLeagueMatch(frozenInput);
    if (!prediction?.winner) throw new Error(`No prediction for World Legends match ${record.matchId}`);
    const result = outcomeById.get(String(record.matchId));
    const scored = result?.outcome === 'winner';
    if (scored && ![record.team1, record.team2].includes(result.actualWinner)) {
      throw new Error(`Invalid verified winner for World Legends match ${record.matchId}`);
    }
    const evidence = prediction.marketEvidence;
    return {
      matchId: String(record.matchId),
      startTime: record.startTime,
      matchName: record.matchName,
      savedPrediction: record.predictedWinner || null,
      currentPrediction: prediction.winner,
      actualWinner: scored ? result.actualWinner : null,
      verdict: !scored ? 'Unscored' : prediction.winner === result.actualWinner ? 'Correct' : 'Wrong',
      exclusionReason: scored ? null : result?.exclusionReason || 'No independently verified completed result',
      evidence: evidence ? {
        correctedSupportPct: [round(evidence.support.pct1), round(evidence.support.pct2)],
        preMatchActivityPct: [round(evidence.activity.pct1), round(evidence.activity.pct2)],
        bookmakerPressureTeam: Number.isInteger(evidence.bookmakerPressureIdx)
          ? frozenInput.teamNames[evidence.bookmakerPressureIdx] : null,
        agreeingSignals: `${evidence.agreeingSignals}/${evidence.signalCount}`,
      } : null,
      inputTiming: prediction.inputTiming,
      source: result ? { name: result.source, url: result.sourceUrl, resultText: result.resultText } : null,
    };
  });

  const scored = rows.filter(row => row.verdict !== 'Unscored');
  const correct = scored.filter(row => row.verdict === 'Correct').length;
  const wrong = scored.filter(row => row.verdict === 'Wrong').length;
  const missingArchiveIds = outcomes.fixtures
    .filter(fixture => !records.some(record => String(record.matchId) === String(fixture.matchId)))
    .map(fixture => String(fixture.matchId));
  if (missingArchiveIds.length) throw new Error(`Outcome fixtures missing from archive: ${missingArchiveIds.join(', ')}`);

  return {
    generatedAt: outcomes.cutoff,
    league,
    predictorVersion: PREDICTOR_VERSION,
    scope: 'Retrospective replay of frozen pre-match fields only',
    summary: {
      archivedMarkets: rows.length,
      completedWithVerifiedWinner: scored.length,
      correct,
      wrong,
      unscored: rows.length - scored.length,
      accuracyPct: scored.length ? round(correct / scored.length * 100) : null,
      verdict: scored.length > 0 && wrong === 0 ? 'PASS' : 'FAIL',
    },
    limitations: [
      'This is a three-match retrospective sample, not an independent estimate of future accuracy.',
      'The Pakistan Legends v Bangladesh Champions market is unscored because no completed winner was published by the cutoff.',
      'No in-play trades, final odds, team identity rule, match result, or post-match field is passed into the predictor.',
    ],
    rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = runWorldLegendsBacktest(readJson(datasetPath), readJson(outcomesPath));
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
  if (process.argv.includes('--check') && report.summary.verdict !== 'PASS') process.exitCode = 1;
}
