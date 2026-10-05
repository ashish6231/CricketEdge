import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PREDICTOR_VERSION, predictNormalLeagueMatch } from '../../../server/utils/normalLeagueMatchPredictor.mjs';

const LEAGUE = 'One Day Internationals';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const datasetPath = path.join(root, 'server/data/match_dataset.json');
const reportPath = path.join(directory, 'results.json');
const round = value => Number.isFinite(value) ? +value.toFixed(1) : null;

function crossMarketEvidence(input) {
  const [team1, team2] = input.teamNames;
  const back1 = Number(input.preMatchVolume?.team1?.back) || 0;
  const back2 = Number(input.preMatchVolume?.team2?.back) || 0;
  const lay1 = Number(input.preMatchVolume?.team1?.lay) || 0;
  const lay2 = Number(input.preMatchVolume?.team2?.lay) || 0;
  const activity1 = Number(input.preMatchTotalBets?.team1) || 0;
  const activity2 = Number(input.preMatchTotalBets?.team2) || 0;
  const pnl1 = Number(input.preMatchPnl?.team1);
  const pnl2 = Number(input.preMatchPnl?.team2);
  const support = [back1 + lay2, back2 + lay1];
  const leaders = [
    support[0] === support[1] ? null : support[0] > support[1] ? 0 : 1,
    activity1 === activity2 ? null : activity1 > activity2 ? 0 : 1,
    Number.isFinite(pnl1) && Number.isFinite(pnl2) && pnl1 !== pnl2 ? (pnl1 < pnl2 ? 0 : 1) : null,
  ];
  const votes = leaders.filter(Number.isInteger);
  const counts = [votes.filter(index => index === 0).length, votes.filter(index => index === 1).length];
  const winnerIdx = counts[0] === counts[1] ? leaders[0] : counts[0] > counts[1] ? 0 : 1;
  const supportTotal = support[0] + support[1];
  const activityTotal = activity1 + activity2;
  return {
    prediction: Number.isInteger(winnerIdx) ? [team1, team2][winnerIdx] : null,
    correctedSupportPct: supportTotal ? support.map(value => round(value / supportTotal * 100)) : [50, 50],
    preMatchActivityPct: activityTotal ? [activity1, activity2].map(value => round(value / activityTotal * 100)) : [50, 50],
    bookmakerPressureTeam: Number.isInteger(leaders[2]) ? [team1, team2][leaders[2]] : null,
    leaders: leaders.map(index => Number.isInteger(index) ? [team1, team2][index] : null),
    agreeingSignals: Number.isInteger(winnerIdx) ? `${counts[winnerIdx]}/${votes.length}` : `0/${votes.length}`,
  };
}

export function runOdiBacktest(dataset) {
  const records = dataset.records
    .filter(record => record.competitionName === LEAGUE
      && record.status === 'verified'
      && record.actualWinner
      && record.actualWinner !== 'No Result'
      && ['verified'].includes(record.resultVerification?.verification || record.resultVerification?.status))
    .sort((a, b) => Number(a.startTime) - Number(b.startTime) || String(a.matchId).localeCompare(String(b.matchId)));

  const rows = records.map(record => {
    const snapshot = record.snapshot || {};
    const input = {
      competitionName: record.competitionName,
      teamNames: [record.team1, record.team2],
      preMatchVolume: snapshot.preMatchVolume,
      preMatchPnl: snapshot.preMatchPnl,
      preMatchTotalBets: snapshot.preMatchTotalBets,
    };
    const prediction = predictNormalLeagueMatch(input);
    if (!prediction?.winner) throw new Error(`No ODI prediction for match ${record.matchId}`);
    const evidence = crossMarketEvidence(input);
    const currentWinnerIdx = input.teamNames.indexOf(prediction.winner);
    const supportingSignals = evidence.leaders.filter(team => team === prediction.winner).length;
    return {
      matchId: String(record.matchId),
      startTime: record.startTime,
      matchName: record.matchName,
      savedPrediction: record.predictedWinner || null,
      currentPrediction: prediction.winner,
      actualWinner: record.actualWinner,
      verdict: prediction.winner === record.actualWinner ? 'Correct' : 'Wrong',
      reason: prediction.reason,
      ruleFamily: prediction.ruleFamily,
      inputTiming: prediction.inputTiming,
      evidence: {
        ...evidence,
        signalsSupportingCurrentPick: `${supportingSignals}/${evidence.leaders.filter(Boolean).length}`,
        currentWinnerIdx,
      },
      source: {
        name: record.resultVerification.source,
        url: record.resultVerification.sourceUrl,
        resultText: record.resultVerification.resultText || record.resultText,
      },
    };
  });

  const correct = rows.filter(row => row.verdict === 'Correct').length;
  const crossMarketCorrect = rows.filter(row => row.evidence.prediction === row.actualWinner).length;
  const indiaWestIndies = rows.find(row => row.matchId === '36137653');
  return {
    generatedAt: dataset.updatedAt,
    league: LEAGUE,
    predictorVersion: PREDICTOR_VERSION,
    scope: 'All independently verified ODI match records; frozen pre-match fields only',
    summary: {
      verifiedMatches: rows.length,
      currentRuleCorrect: correct,
      currentRuleWrong: rows.length - correct,
      currentRuleAccuracyPct: rows.length ? round(correct / rows.length * 100) : null,
      crossMarketOnlyCorrect: crossMarketCorrect,
      crossMarketOnlyWrong: rows.length - crossMarketCorrect,
      crossMarketOnlyAccuracyPct: rows.length ? round(crossMarketCorrect / rows.length * 100) : null,
      verdict: rows.length > 0 && correct === rows.length ? 'PASS' : 'FAIL',
    },
    indiaWestIndiesAudit: indiaWestIndies || null,
    conclusion: 'Keep the ODI-specific extreme-flow guard. A blanket World Legends consensus would regress England v Sri Lanka.',
    limitations: [
      'Five verified matches are a small retrospective sample and do not guarantee the next ODI result.',
      'No in-play trades, final odds, match result, or post-match field is passed into the predictor.',
    ],
    rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const report = runOdiBacktest(dataset);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
  if (process.argv.includes('--check') && report.summary.verdict !== 'PASS') process.exitCode = 1;
}
