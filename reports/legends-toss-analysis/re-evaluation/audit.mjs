import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getWorldLegendsTossPrediction as baseline } from './baseline-v1.mjs';
import { getWorldLegendsTossPrediction as revised, WORLD_LEGENDS_TOSS_PARAMETERS } from './baseline-v2.mjs';
import { getTradeStats, calcBookiePlFromTrades } from '../../../frontend/src/utils/bookiePl.js';

const input = JSON.parse(fs.readFileSync(new URL('inputs.json', import.meta.url), 'utf8'));
const original = JSON.parse(fs.readFileSync(new URL('../inputs.json', import.meta.url), 'utf8'));
const originalIds = new Set(original.rows.filter(r => r.status === 'verified').map(r => r.matchId));
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.02;
const observations = input.rows.map(row => {
  const snap = row.snapshot;
  const reported = input.reportedOutcomes.find(r => r.matchId === row.matchId);
  const actual = row.status === 'verified' ? row.actualWinner : reported?.actualWinner ?? null;
  const scored = !!actual && actual !== 'No Result' && row.status !== 'abandoned';
  const before = baseline(snap), after = revised(snap);
  const sides = snap.teamNames.map((team, index) => {
    const key = `team${index + 1}`;
    const stats = getTradeStats(snap.teams?.[team]?.trades || []);
    const vol = snap.preMatchVolume[key], exp = snap.bookmakerExposure[key];
    return { team, back: vol.back, lay: vol.lay, reportedTotal: vol.total,
      ownBackPlusLay: vol.back + vol.lay,
      backMatchesLedger: close(vol.back, stats.tBack),
      layMatchesLedger: close(vol.lay, stats.tLay),
      exposureMatchesLedger: close(exp.netExposure, stats.tBackLiab - stats.tLayLiab),
      providerNetExposure: exp.netExposure,
      ledgerNetExposure: stats.tBackLiab - stats.tLayLiab,
      invalidTradeRows: stats.invalid };
  });
  const pnl = calcBookiePlFromTrades(...snap.teamNames.map(name => snap.teams?.[name]?.trades || []));
  const startMs = Number(row.startTime), capturedMs = Date.parse(row.capturedAt);
  return { matchId: row.matchId, match: row.matchName, status: row.status,
    outcomeSource: scored ? reported ? 'user-reported; database pending' : 'database-verified' : 'excluded',
    actualWinner: actual, scored, originalFit: originalIds.has(row.matchId),
    savedPrediction: row.predictedWinner, savedVersion: row.predictorVersion,
    baselinePrediction: before.winner, revisedPrediction: after.winner,
    baselineCorrect: scored ? before.winner === actual : null,
    revisedCorrect: scored ? after.winner === actual : null,
    baselinePattern: before.pattern, revisedPattern: after.pattern,
    evidence: after.evidence, revisedReason: after.reason, sides,
    pnlMatchesLedger: close(snap.preMatchPnl.team1, pnl.team1Win) && close(snap.preMatchPnl.team2, pnl.team2Win),
    capturedAt: row.capturedAt, startTime: new Date(startMs).toISOString(),
    capturedAfterListedStart: capturedMs >= startMs,
    preTossCaptureVerified: false,
  };
});
const score = rows => ({ samples: rows.length,
  baselineCorrect: rows.filter(r => r.baselineCorrect).length,
  revisedCorrect: rows.filter(r => r.revisedCorrect).length });
const scored = observations.filter(r => r.scored);
const failure = scored.find(r => r.matchId === '36194408');
assert.equal(failure.baselinePrediction, 'West Indies Legends');
assert.equal(failure.revisedPrediction, 'Australia Legends');
assert.equal(scored.length, 9);
assert.equal(score(scored).revisedCorrect, 9);

// Sensitivity is retrospective too. A wide range fitting these outcomes is
// evidence of underdetermined thresholds, not independent validation.
const sensitivity = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 5.15, 6].map(minBackLead => {
  let correct = 0;
  for (const row of scored) {
    const e = row.evidence;
    const leader = e.exposureLeader;
    const other = row.sides.find(s => s.team !== leader).team;
    const highLay = e.layBackRatio >= WORLD_LEGENDS_TOSS_PARAMETERS.layBackResistance
      && (e.backLead === null || e.backLead >= minBackLead);
    const zeroLay = e.bothZeroLay && e.backLead !== null
      && e.backLead < WORLD_LEGENDS_TOSS_PARAMETERS.zeroLayBackLead;
    if ((highLay || zeroLay ? other : leader) === row.actualWinner) correct++;
  }
  return { minBackLead, correct, samples: scored.length };
});
const output = {
  sourceQueriedAt: input.queriedAt,
  scope: 'All 11 Legends toss records after user correction, including two abandoned records; outcomes scored separately by provenance.',
  validation: 'Retrospective, outcome-informed revision. Zero independently held-out pre-toss samples.',
  parameters: WORLD_LEGENDS_TOSS_PARAMETERS,
  summary: {
    records: observations.length, abandonedExcluded: observations.filter(r => r.status === 'abandoned').length,
    databaseVerified: score(scored.filter(r => r.outcomeSource === 'database-verified')),
    userReported: score(scored.filter(r => r.outcomeSource.startsWith('user-reported'))),
    combinedKnownOutcomes: score(scored), originalRetained: score(scored.filter(r => r.originalFit)),
    additionalRetrospectiveChecks: score(scored.filter(r => !r.originalFit)),
    capturedAfterListedStart: scored.filter(r => r.capturedAfterListedStart).length,
    preTossCaptureVerified: 0,
    rowsWithLedgerMismatch: observations.filter(r => !r.pnlMatchesLedger || r.sides.some(s => !s.backMatchesLedger || !s.layMatchesLedger || !s.exposureMatchesLedger || s.invalidTradeRows)).map(r => r.matchId),
  },
  findings: [
    'v1 reversed the exposure/P&L selection on 14.29% lay/back without requiring back dominance; this confused a 1.34x back lead with the original 5.14x high-lay training case.',
    'v2 requires both at least 10% lay/back and at least 3x back lead for the high-lay reversal. The existing zero-lay rule is unchanged.',
    'The 3x high-lay cutoff is chosen after seeing the failure. Matching all known outcomes is an in-sample fit, not a future accuracy estimate.',
    'All scored snapshots were captured after listed match start. The preMatch field name alone does not establish a verified pre-toss observation time.',
    'Provider preMatchVolume.total is not always own back plus own lay. This field is not used by the dedicated Legends decision.',
    'Bangladesh/England has a 0.1441 provider-versus-ledger net-exposure discrepancy on Bangladesh. It does not change the exposure leader or decision. The Australia failure has matching back, lay, net exposure and P/L inputs.',
    'The database still marks the Australia result pending; this audit uses the user report and does not change verified results or saved predictions.',
  ],
  sensitivity, observations,
};
fs.writeFileSync(new URL('results.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output.summary, null, 2));
