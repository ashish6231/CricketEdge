import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const input = JSON.parse(fs.readFileSync(new URL('inputs.json', root), 'utf8'));
const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const finite = x => Number.isFinite(x) ? x : null;
const observations = [];
for (const row of input.rows) {
  if (row.status !== 'verified' || !row.actualWinner || row.actualWinner === 'No Result') continue;
  const snap = row.snapshot;
  const sides = [0, 1].map(index => {
    const key = `team${index + 1}`;
    return { team: snap.teamNames[index], back: finite(snap.preMatchVolume?.[key]?.back),
      lay: finite(snap.preMatchVolume?.[key]?.lay), pnl: finite(snap.preMatchPnl?.[key]),
      activity: finite(snap.preMatchTotalBets?.[key]),
      netExposure: finite(snap.bookmakerExposure?.[key]?.netExposure),
      backExposure: finite(snap.bookmakerExposure?.[key]?.backExposure),
      layExposure: finite(snap.bookmakerExposure?.[key]?.layExposure) };
  });
  function measure(name) {
    const side = sides.find(s => eq(s.team, name));
    assert.ok(side, `Unmatched participant ${name}`);
    const other = sides.find(s => s !== side);
    const totalBack = side.back !== null && other.back !== null ? side.back + other.back : 0;
    const totalSupport = totalBack + (side.lay ?? 0) + (other.lay ?? 0);
    return { ...side, otherTeam: other.team, otherBack: other.back, otherLay: other.lay,
      otherPnl: other.pnl, otherNetExposure: other.netExposure,
      backShare: totalBack > 0 ? side.back / totalBack * 100 : null,
      supportShare: totalSupport > 0 ? (side.back + other.lay) / totalSupport * 100 : null,
      backRatio: other.back > 0 ? side.back / other.back : null,
      backLead: side.back !== null && other.back !== null && side.back > other.back,
      negativePnl: side.pnl !== null && side.pnl < 0,
      positiveOpponentPnl: other.pnl !== null && other.pnl > 0,
      higherNetExposure: side.netExposure !== null && other.netExposure !== null && side.netExposure > other.netExposure,
      bothLayPresent: side.lay > 0 && other.lay > 0,
      higherLay: side.lay !== null && other.lay !== null && side.lay > other.lay,
      higherActivity: side.activity !== null && other.activity !== null && side.activity > other.activity,
      syntheticAligned: eq(snap.syntheticSupport?.strongerTeam, side.team),
      syntheticRatio: finite(snap.syntheticSupport?.supportRatio),
    };
  }
  const selected = measure(row.predictedWinner), actual = measure(row.actualWinner);
  const captured = Date.parse(row.capturedAt);
  const start = typeof row.startTime === 'number' ? row.startTime : Date.parse(row.startTime);
  observations.push({ matchId: row.matchId, match: row.matchName, actualWinner: row.actualWinner,
    predictedWinner: row.predictedWinner, pass: eq(row.actualWinner, row.predictedWinner),
    capturedAt: row.capturedAt, startTime: row.startTime,
    capturedAfterListedStart: Number.isFinite(captured) && Number.isFinite(start) ? captured >= start : null,
    selected, actual, sides, reason: row.predictionReason });
}
observations.sort((a, b) => Number(a.startTime) - Number(b.startTime));
const passes = observations.filter(row => row.pass), failures = observations.filter(row => !row.pass);
const metrics = [
  ['backLead', 'Higher back volume'], ['negativePnl', 'Negative pre-match P/L'],
  ['positiveOpponentPnl', 'Opponent has positive P/L'], ['higherNetExposure', 'Higher net exposure'],
  ['bothLayPresent', 'Lay volume on both teams'], ['higherLay', 'Higher own lay volume'],
  ['higherActivity', 'Higher pre-match activity'], ['syntheticAligned', 'Synthetic support agrees'],
];
const counts = metrics.map(([key, label]) => ({ key, label,
  passedSelections: passes.filter(row => row.selected[key]).length,
  failedSelections: failures.filter(row => row.selected[key]).length,
  actualWinners: observations.filter(row => row.actual[key]).length }));
const conjunction = x => x.backLead && x.negativePnl && x.positiveOpponentPnl
  && x.higherNetExposure && x.bothLayPresent && x.higherLay && x.higherActivity && x.syntheticAligned;
const matching = observations.filter(row => conjunction(row.selected));
const result = { source: 'PredictionRecord database / tosses / World Championship of Legends T20', queriedAt: input.queriedAt,
  summary: { total: input.rows.length, verified: observations.length, passed: passes.length, failed: failures.length,
    abandoned: input.rows.filter(row => row.status === 'abandoned' || row.actualWinner === 'No Result').length,
    capturedAfterListedStart: observations.filter(row => row.capturedAfterListedStart).length },
  factorCounts: counts,
  combinedPattern: { matching: matching.length, passed: matching.filter(row => row.pass).length,
    failed: matching.filter(row => !row.pass).length,
    counterexamples: matching.filter(row => !row.pass).map(row => row.match) },
  observations,
};
assert.equal(passes.length + failures.length, observations.length);
fs.writeFileSync(new URL('results.json', root), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ summary: result.summary, factorCounts: counts, combinedPattern: result.combinedPattern,
  passedWinnerMetrics: passes.map(row => ({ match: row.match, ...row.actual })),
  failedSelectedMetrics: failures.map(row => ({ match: row.match, ...row.selected })) }, null, 2));
