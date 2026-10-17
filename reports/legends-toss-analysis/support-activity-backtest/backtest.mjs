import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Research-only candidate. Not imported by the live toss predictor.
export function predictSupportAndActivity(snap) {
  const noPick = reason => ({ winner: null, winnerIdx: null, reason });
  const names = snap?.teamNames;
  if (!Array.isArray(names) || names.length !== 2
    || names.some(name => typeof name !== 'string' || !name.trim())
    || names[0].trim().toLowerCase() === names[1].trim().toLowerCase()) {
    return noPick('Two distinct toss participants are required.');
  }
  const sides = [1, 2].map(index => {
    const key = `team${index}`;
    return { back: snap.preMatchVolume?.[key]?.back, lay: snap.preMatchVolume?.[key]?.lay,
      activity: snap.preMatchTotalBets?.[key] };
  });
  if (sides.some(side => ![side.back, side.lay, side.activity].every(value => Number.isFinite(value) && value >= 0))) {
    return noPick('Usable back, lay and reported pre-match activity are required for both teams.');
  }
  const support1 = sides[0].back + sides[1].lay;
  const support2 = sides[1].back + sides[0].lay;
  const activity1 = sides[0].activity, activity2 = sides[1].activity;
  const supportTotal = support1 + support2, activityTotal = activity1 + activity2;
  if (![supportTotal, activityTotal].every(total => Number.isFinite(total) && total > 0)) {
    return noPick('Both support and activity totals must be positive and finite.');
  }
  const supportLeader = support1 === support2 ? null : support1 > support2 ? 0 : 1;
  const activityLeader = activity1 === activity2 ? null : activity1 > activity2 ? 0 : 1;
  const evidence = {
    support: { team1: support1, team2: support2,
      pct1: support1 / supportTotal * 100, pct2: support2 / supportTotal * 100, leaderIdx: supportLeader },
    activity: { team1: activity1, team2: activity2,
      pct1: activity1 / activityTotal * 100, pct2: activity2 / activityTotal * 100, leaderIdx: activityLeader },
  };
  if (supportLeader === null || activityLeader === null) {
    return { ...noPick('Corrected support or pre-match activity is tied.'), ...evidence };
  }
  if (supportLeader !== activityLeader) {
    return { ...noPick('Corrected support and pre-match activity favor different teams.'), ...evidence };
  }
  return { winner: names[supportLeader], winnerIdx: supportLeader,
    reason: 'Higher corrected support and higher pre-match activity agree.', ...evidence };
}

export function backtest(input) {
  const observations = input.rows.map(row => {
    const prediction = predictSupportAndActivity(row.snapshot);
    const reported = input.reportedOutcomes.find(outcome => outcome.matchId === row.matchId);
    const abandoned = row.status === 'abandoned' || row.actualWinner === 'No Result';
    const verified = row.status === 'verified' && row.actualWinner && !abandoned;
    const actualWinner = abandoned ? 'No Result' : verified ? row.actualWinner : reported?.actualWinner ?? null;
    const outcomeSource = verified ? 'database-verified' : reported && !abandoned ? 'user-reported; database pending' : 'excluded';
    const scorable = !abandoned && row.snapshot.teamNames.includes(actualWinner);
    const result = !scorable ? 'excluded' : !prediction.winner ? 'no-pick'
      : prediction.winner === actualWinner ? 'pass' : 'fail';
    return { matchId: row.matchId, match: row.matchName, teamNames: row.snapshot.teamNames,
      startTime: row.startTime, capturedAt: row.capturedAt, databaseStatus: row.status,
      outcomeSource, actualWinner, result, prediction,
      capturedAfterListedStart: Date.parse(row.capturedAt) >= Number(row.startTime) };
  }).sort((a, b) => Number(a.startTime) - Number(b.startTime));
  const summarize = rows => {
    const pass = rows.filter(row => row.result === 'pass').length;
    const fail = rows.filter(row => row.result === 'fail').length;
    const noPick = rows.filter(row => row.result === 'no-pick').length;
    return { knownOutcomes: rows.length, picks: pass + fail, pass, fail, noPick,
      passPctAmongPicks: pass + fail ? pass / (pass + fail) * 100 : null,
      coveragePct: rows.length ? (pass + fail) / rows.length * 100 : null };
  };
  const scored = observations.filter(row => row.result !== 'excluded');
  return {
    sourceQueriedAt: input.queriedAt,
    scope: 'All current World Championship of Legends toss records; verified and user-reported outcomes kept separate.',
    rule: 'Pick only when the same team has strictly higher corrected support AND strictly higher pre-match activity. Otherwise no pick.',
    correctedSupportFormula: 'Team A back + Team B lay; Team B back + Team A lay.',
    activitySource: 'snapshot.preMatchTotalBets; no fallback to match-market inputs, total stake or final money.',
    validation: 'Retrospective replay, not an independently held-out pre-toss accuracy estimate.',
    activeAlgorithmChanged: false,
    summary: {
      records: observations.length,
      verified: summarize(scored.filter(row => row.outcomeSource === 'database-verified')),
      userReported: summarize(scored.filter(row => row.outcomeSource.startsWith('user-reported'))),
      combined: summarize(scored),
      abandonedExcluded: observations.filter(row => row.actualWinner === 'No Result').length,
      otherExcluded: observations.filter(row => row.result === 'excluded' && row.actualWinner !== 'No Result').length,
      capturedAfterListedStart: scored.filter(row => row.capturedAfterListedStart).length,
      independentlyVerifiedPreTossSnapshots: 0,
    },
    observations,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(fs.readFileSync(new URL('inputs.json', import.meta.url), 'utf8'));
  const report = backtest(input);
  fs.writeFileSync(new URL('results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ summary: report.summary,
    failures: report.observations.filter(row => row.result === 'fail') }, null, 2));
}
