import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { predictSupportAndActivity, backtest } from './backtest.mjs';
import { getWorldLegendsTossPrediction, WORLD_LEGENDS_TOSS_VERSION } from '../../../server/utils/worldLegendsTossAlgorithm.js';
import { getWorldLegendsTossPrediction as archivedV2 } from '../re-evaluation/baseline-v2.mjs';

// Existing v2 cutoffs, reused for this retrospective comparison. These were
// chosen after inspecting outcomes earlier in the conversation, not held out.
export const PARAMETERS = Object.freeze({ highLayBackRatio: 0.10, minDominantBackLead: 3, maxZeroLayBackLead: 3 });

export function features(snap) {
  const baseline = predictSupportAndActivity(snap);
  if (!baseline.winner) return { baseline, factors: null };
  const i = baseline.winnerIdx;
  const selected = snap.preMatchVolume[`team${i + 1}`];
  const other = snap.preMatchVolume[`team${2 - i}`];
  const layBackRatio = selected.back > 0 ? selected.lay / selected.back : null;
  const backLead = other.back > 0 ? selected.back / other.back : null;
  return { baseline, factors: {
    leaderTeam: baseline.winner, otherTeam: snap.teamNames[1 - i],
    leaderBack: selected.back, leaderLay: selected.lay, otherBack: other.back, otherLay: other.lay,
    anyLayZero: selected.lay === 0 || other.lay === 0,
    bothLaysZero: selected.lay === 0 && other.lay === 0,
    layBackRatio, backLead,
    highLay: layBackRatio !== null && layBackRatio >= PARAMETERS.highLayBackRatio,
    dominantBack: selected.back > 0 && (other.back === 0 || backLead >= PARAMETERS.minDominantBackLead),
    moderateBack: backLead !== null && backLead < PARAMETERS.maxZeroLayBackLead,
  } };
}

export const CANDIDATES = Object.freeze([
  { id: 'baseline', label: 'Support + activity only', condition: 'No reversal', reverse: f => false },
  { id: 'any-zero-lay', label: 'Reverse if either lay is zero', condition: 'At least one lay = 0', reverse: f => f.anyLayZero },
  { id: 'both-zero-lay', label: 'Reverse if both lays are zero', condition: 'Both lays = 0', reverse: f => f.bothLaysZero },
  { id: 'high-lay-only', label: 'Reverse on high lay/back alone', condition: 'Selected lay/back ≥10%', reverse: f => f.highLay },
  { id: 'large-back-only', label: 'Reverse on large back lead alone', condition: 'Selected back lead ≥3×', reverse: f => f.dominantBack },
  { id: 'guarded-high-lay', label: 'High lay/back + dominant back', condition: 'Selected lay/back ≥10% AND back lead ≥3×', reverse: f => f.highLay && f.dominantBack },
  { id: 'guarded-zero-lay', label: 'Both zero lay + moderate back', condition: 'Both lays = 0 AND selected back lead <3×', reverse: f => f.bothLaysZero && f.moderateBack },
  { id: 'combined', label: 'Both guarded exceptions', condition: '(lay/back ≥10% AND back lead ≥3×) OR (both lays = 0 AND back lead <3×)',
    reverse: f => (f.highLay && f.dominantBack) || (f.bothLaysZero && f.moderateBack) },
  { id: 'high-guard-any-both-zero', label: 'Guarded high lay + any both-zero lay', condition: '(lay/back ≥10% AND back lead ≥3×) OR both lays = 0',
    reverse: f => (f.highLay && f.dominantBack) || f.bothLaysZero },
]);

export function predictCandidate(snap, candidateId) {
  const candidate = CANDIDATES.find(candidate => candidate.id === candidateId);
  if (!candidate) throw new Error(`Unknown research candidate: ${candidateId}`);
  const { baseline, factors } = features(snap);
  if (!factors) return { winner: null, winnerIdx: null, reversed: false, factors, reason: baseline.reason };
  const reversed = candidate.reverse(factors);
  const winnerIdx = reversed ? 1 - baseline.winnerIdx : baseline.winnerIdx;
  return { winner: snap.teamNames[winnerIdx], winnerIdx, reversed, factors, reason: candidate.condition };
}

const score = rows => ({ samples: rows.length, correct: rows.filter(row => row.correct).length,
  failed: rows.filter(row => !row.correct && row.candidatePick).length,
  noPick: rows.filter(row => !row.candidatePick).length });

export function audit(input, enriched) {
  const baselineReport = backtest(input);
  const known = baselineReport.observations.filter(row => row.result !== 'excluded');
  const observations = known.map(row => {
    const raw = input.rows.find(raw => raw.matchId === row.matchId);
    const extended = enriched.rows.find(raw => raw.matchId === row.matchId);
    assert.ok(extended, `Missing enriched snapshot: ${row.matchId}`);
    // Never silently join a later/different market state into this backtest.
    for (const field of ['teamNames', 'preMatchVolume', 'preMatchTotalBets']) {
      assert.deepEqual(extended.snapshot[field], raw.snapshot[field], `${row.matchId}: ${field} changed`);
    }
    const { factors } = features(raw.snapshot);
    assert.ok(factors);
    const i = row.prediction.winnerIdx;
    const selectedPnl = extended.snapshot.preMatchPnl?.[`team${i + 1}`];
    const opposingPnl = extended.snapshot.preMatchPnl?.[`team${2 - i}`];
    const selectedExposure = extended.snapshot.bookmakerExposure?.[`team${i + 1}`]?.netExposure;
    const opposingExposure = extended.snapshot.bookmakerExposure?.[`team${2 - i}`]?.netExposure;
    return { matchId: row.matchId, match: row.match, startTime: row.startTime,
      outcomeSource: row.outcomeSource, actualWinner: row.actualWinner,
      baselinePick: row.prediction.winner, baselineCorrect: row.result === 'pass',
      factors, selectedPnl, opposingPnl, selectedExposure, opposingExposure,
      selectedSupportPct: i === 0 ? row.prediction.support.pct1 : row.prediction.support.pct2,
      selectedActivityPct: i === 0 ? row.prediction.activity.pct1 : row.prediction.activity.pct2,
      archivedV2Pick: archivedV2(extended.snapshot).winner,
      activePick: getWorldLegendsTossPrediction(extended.snapshot).winner };
  });
  const candidates = CANDIDATES.map(candidate => {
    const rows = observations.map(row => {
      const raw = input.rows.find(raw => raw.matchId === row.matchId);
      const prediction = predictCandidate(raw.snapshot, candidate.id);
      return { matchId: row.matchId, match: row.match, outcomeSource: row.outcomeSource,
        actualWinner: row.actualWinner, baselinePick: row.baselinePick,
        candidatePick: prediction.winner, reversed: prediction.reversed,
        baselineCorrect: row.baselineCorrect, correct: prediction.winner === row.actualWinner };
    });
    return { id: candidate.id, label: candidate.label, condition: candidate.condition,
      summary: score(rows), verified: score(rows.filter(row => row.outcomeSource === 'database-verified')),
      userReported: score(rows.filter(row => row.outcomeSource.startsWith('user-reported'))),
      correctedFailures: rows.filter(row => !row.baselineCorrect && row.correct).map(row => row.matchId),
      regressedPasses: rows.filter(row => row.baselineCorrect && !row.correct).map(row => row.matchId),
      preservedPasses: rows.filter(row => row.baselineCorrect && row.correct).map(row => row.matchId),
      changedRows: rows.filter(row => row.reversed), rows };
  });
  const combined = candidates.find(candidate => candidate.id === 'combined');
  const verified = observations.filter(row => row.outcomeSource === 'database-verified');
  const factorSupport = CANDIDATES.filter(candidate => [
    'any-zero-lay', 'both-zero-lay', 'high-lay-only', 'large-back-only', 'guarded-high-lay', 'guarded-zero-lay',
  ].includes(candidate.id)).map(candidate => {
    const matched = observations.filter(row => candidate.reverse(row.factors));
    return { id: candidate.id, condition: candidate.condition,
      matchingPasses: matched.filter(row => row.baselineCorrect).length,
      matchingFailures: matched.filter(row => !row.baselineCorrect).length,
      matchingIds: matched.map(row => row.matchId) };
  });
  return { sourceQueriedAt: input.queriedAt, parameters: PARAMETERS,
    scope: 'Corrected frozen sample: 9 known Legends outcomes, 8 database verified + 1 user reported; two abandoned records excluded.',
    validation: 'Outcome-informed retrospective factor audit, not a causal explanation or independent future validation.',
    backtestChangesActiveAlgorithm: false,
    activeAlgorithmVersion: WORLD_LEGENDS_TOSS_VERSION,
    summary: { knownOutcomes: observations.length, verifiedOutcomes: verified.length,
      userReportedOutcomes: observations.length - verified.length,
      baselinePass: observations.filter(row => row.baselineCorrect).length,
      baselineFail: observations.filter(row => !row.baselineCorrect).length,
      correctedWithCombined: combined.correctedFailures.length,
      regressedWithCombined: combined.regressedPasses.length,
      preservedWithCombined: combined.preservedPasses.length,
      combinedPass: combined.summary.correct, verifiedCombinedPass: combined.verified.correct,
      samePicksAsV2: combined.rows.filter(row => row.candidatePick === observations.find(x => x.matchId === row.matchId).archivedV2Pick).length,
      samePicksAsActive: candidates.find(candidate => candidate.id === 'high-guard-any-both-zero').rows
        .filter(row => row.candidatePick === observations.find(x => x.matchId === row.matchId).activePick).length,
      allBaselineLeadersHaveNegativePnlAndHigherExposure: observations.every(row => row.selectedPnl < 0
        && row.opposingPnl > 0 && row.selectedExposure > row.opposingExposure),
      preTossCaptureVerified: 0 },
    observations, candidates, factorSupport,
    limitations: [
      'Each guarded exception matches exactly one verified failure. Zero regression across seven passed examples is not independent validation.',
      'Australia–Pakistan was corrected to abandoned/no result and is not a passed zero-lay control. No scored both-zero-lay pass remains; the <3x zero-lay guard is not distinguishable from an unbounded both-zero-lay reversal in this sample.',
      'The 10% and 3x high-lay cutoffs were selected after inspecting outcomes earlier in the session and were present in archived exposure/lay v2.',
      'All scored records were captured after listed match start. Availability of these inputs before the toss is not established.',
      'Support, activity, P/L and exposure are related market quantities; agreement is not independent evidence and cannot establish why a toss result occurred.',
      'The latest approved support/activity rule with guarded high lay OR both-zero-lay is active as v3. Archived exposure/lay v2 agrees on this sample but can differ on other inputs.',
    ] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(fs.readFileSync(new URL('inputs.json', import.meta.url), 'utf8'));
  const enriched = JSON.parse(fs.readFileSync(new URL('../re-evaluation/inputs.json', import.meta.url), 'utf8'));
  const report = audit(input, enriched);
  fs.writeFileSync(new URL('factor-audit-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ summary: report.summary, candidates: report.candidates.map(({ rows, changedRows, ...summary }) => summary) }, null, 2));
}
