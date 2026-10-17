import fs from 'node:fs';

// Exploratory thresholds chosen after inspecting this sample. This report is
// deliberately separate from the production toss predictor.
const analysis = JSON.parse(fs.readFileSync(new URL('results.json', import.meta.url), 'utf8'));
const parameters = { layBackResistance: 0.10, zeroLayBackLead: 3 };
export function candidate(sides, settings = parameters) {
  if (sides.length !== 2 || sides.some(s => ![s.back, s.lay, s.pnl, s.netExposure].every(Number.isFinite))) return null;
  if (sides[0].netExposure === sides[1].netExposure) return null;
  const leader = sides[0].netExposure > sides[1].netExposure ? sides[0] : sides[1];
  const other = sides.find(side => side !== leader);
  if (!(leader.netExposure > 0 && leader.pnl < 0 && other.pnl > 0 && leader.back > 0)) return null;
  const layBackRatio = leader.lay / leader.back;
  const bothZeroLay = leader.lay === 0 && other.lay === 0;
  const backLead = other.back > 0 ? leader.back / other.back : null;
  let rule = 'EXPOSURE_AND_NEGATIVE_PL';
  if (layBackRatio >= settings.layBackResistance) rule = 'HIGH_LAY_RELATIVE_TO_BACK';
  else if (bothZeroLay && backLead !== null && backLead < settings.zeroLayBackLead) rule = 'ZERO_LAY_MODERATE_BACK_LEAD';
  return { winner: rule === 'EXPOSURE_AND_NEGATIVE_PL' ? leader.team : other.team,
    exposureLeader: leader.team, leaderLayBackPct: layBackRatio * 100, backLead,
    leaderExposure: leader.netExposure, otherExposure: other.netExposure,
    leaderPnl: leader.pnl, otherPnl: other.pnl, rule };
}
const rows = analysis.observations.map(row => {
  const result = candidate(row.sides);
  return { match: row.match, actualWinner: row.actualWinner, savedPrediction: row.predictedWinner,
    ...result, candidatePass: result?.winner === row.actualWinner,
    baselinePass: result?.exposureLeader === row.actualWinner };
});
const report = {
  sourceQueriedAt: analysis.queriedAt,
  scope: 'Exploratory fit to eight verified archived tosses; one abandoned toss excluded',
  validation: 'in-sample-only; features and thresholds chosen after observing outcomes',
  parameters, scored: rows.length,
  baselineCorrect: rows.filter(row => row.baselinePass).length,
  candidateCorrect: rows.filter(row => row.candidatePass).length,
  noPick: rows.filter(row => !row.winner).length,
  branches: [...new Set(rows.map(row => row.rule))].map(rule => ({ rule,
    samples: rows.filter(row => row.rule === rule).length,
    correct: rows.filter(row => row.rule === rule && row.candidatePass).length })),
  rows,
};
fs.writeFileSync(new URL('exploratory-rules.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
