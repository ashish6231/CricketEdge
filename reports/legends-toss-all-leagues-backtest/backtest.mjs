import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getWorldLegendsTossPrediction, isWorldLegendsTossLeague, WORLD_LEGENDS_TOSS_VERSION, WORLD_LEGENDS_TOSS_PARAMETERS } from '../../server/utils/worldLegendsTossAlgorithm.js';

const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const noResult = value => ['noresult', 'abandoned', 'cancelled', 'canceled', 'void'].includes(norm(value));
const time = value => value == null ? null : typeof value === 'number' ? value : /^\d+$/.test(value) ? Number(value) : Date.parse(value);

export function summarize(rows) {
  const known = rows.filter(row => row.result !== 'excluded');
  const pass = known.filter(row => row.result === 'pass').length;
  const fail = known.filter(row => row.result === 'fail').length;
  const noPick = known.filter(row => row.result === 'no-pick').length;
  const paired = known.filter(row => row.savedResult !== 'no-pick');
  const pickedPairs = paired.filter(row => row.result !== 'no-pick');
  return {
    records: rows.length, knownOutcomes: known.length, picks: pass + fail, pass, fail, noPick,
    passPctAmongPicks: pass + fail ? pass / (pass + fail) * 100 : null,
    coveragePct: known.length ? (pass + fail) / known.length * 100 : null,
    passPctAmongKnown: known.length ? pass / known.length * 100 : null,
    abandonedExcluded: rows.filter(row => row.excludedReason === 'abandoned/no-result').length,
    pendingExcluded: rows.filter(row => row.excludedReason === 'outcome-not-verified').length,
    invalidOutcomeExcluded: rows.filter(row => row.excludedReason === 'winner-not-a-participant').length,
    capturedAfterListedStart: known.filter(row => row.captureTiming === 'after-listed-start').length,
    capturedBeforeListedStart: known.filter(row => row.captureTiming === 'before-listed-start').length,
    timingUnknown: known.filter(row => row.captureTiming === 'unknown').length,
    storedForecasts: {
      available: paired.length, pass: paired.filter(row => row.savedResult === 'pass').length,
      fail: paired.filter(row => row.savedResult === 'fail').length,
      samePickedFixtures: pickedPairs.length,
      savedPassOnSamePickedFixtures: pickedPairs.filter(row => row.savedResult === 'pass').length,
      candidatePassOnSamePickedFixtures: pickedPairs.filter(row => row.result === 'pass').length,
      passedToWrong: known.filter(row => row.savedResult === 'pass' && row.result === 'fail').length,
      passedToNoPick: known.filter(row => row.savedResult === 'pass' && row.result === 'no-pick').length,
      failedToCorrect: known.filter(row => row.savedResult === 'fail' && row.result === 'pass').length,
    },
  };
}

export function backtest(input) {
  assert.equal(new Set(input.records.map(row => String(row.matchId))).size, input.records.length, 'Duplicate toss IDs');
  const observations = input.records.map(row => {
    // Invoke the exact production v3 function directly: no league dispatch,
    // fallback rule, threshold fitting, outcome labels or match IDs as input.
    const prediction = getWorldLegendsTossPrediction(row.snapshot);
    const names = row.snapshot?.teamNames || [];
    const actual = names.find(name => norm(name) === norm(row.actualWinner));
    const abandoned = ['abandoned', 'cancelled', 'canceled', 'void'].includes(String(row.status).toLowerCase()) || noResult(row.actualWinner);
    const excludedReason = abandoned ? 'abandoned/no-result' : row.status !== 'verified' || !row.actualWinner ? 'outcome-not-verified'
      : !actual ? 'winner-not-a-participant' : null;
    const result = excludedReason ? 'excluded' : !prediction.winner ? 'no-pick' : norm(prediction.winner) === norm(actual) ? 'pass' : 'fail';
    const saved = names.find(name => norm(name) === norm(row.predictedWinner));
    const savedResult = !saved ? 'no-pick' : norm(saved) === norm(actual) ? 'pass' : 'fail';
    const captured = time(row.capturedAt), start = time(row.startTime);
    const captureTiming = !Number.isFinite(captured) || !Number.isFinite(start) ? 'unknown'
      : captured >= start ? 'after-listed-start' : 'before-listed-start';
    return {
      matchId: String(row.matchId), match: row.matchName, league: row.competitionName || 'Unknown league',
      isLegends: isWorldLegendsTossLeague(row.competitionName), startTime: row.startTime, capturedAt: row.capturedAt, captureTiming,
      databaseStatus: row.status, actualWinner: excludedReason ? row.actualWinner : actual,
      outcomeSource: excludedReason ? 'excluded' : 'database-verified', excludedReason,
      candidatePick: prediction.winner, result, reason: prediction.reason, pattern: prediction.pattern || 'ABSTAIN',
      evidence: prediction.evidence || null,
      savedPick: row.predictedWinner, savedVersion: row.predictorVersion, savedResult,
    };
  }).sort((a,b) => a.league.localeCompare(b.league) || (time(a.startTime) || 0) - (time(b.startTime) || 0) || a.matchId.localeCompare(b.matchId));
  const other = observations.filter(row => !row.isLegends);
  const leagues = [...new Set(observations.map(row => row.league))].map(league => {
    const rows = observations.filter(row => row.league === league);
    return { league, isLegends: rows[0].isLegends, ...summarize(rows) };
  });
  const patterns = [...new Set(other.filter(row => row.result !== 'excluded').map(row => row.pattern))].map(pattern => ({
    pattern, ...summarize(other.filter(row => row.pattern === pattern && row.result !== 'excluded')),
  }));
  for (const field of ['records','knownOutcomes','picks','pass','fail','noPick','abandonedExcluded','pendingExcluded','invalidOutcomeExcluded']) {
    assert.equal(leagues.reduce((sum, league) => sum + league[field], 0), summarize(observations)[field], `League ${field} must reconcile`);
  }
  return {
    queriedAt: input.queriedAt, source: input.source, inputPayloadSha256: input.rawPayloadSha256,
    algorithmVersion: WORLD_LEGENDS_TOSS_VERSION, parameters: WORLD_LEGENDS_TOSS_PARAMETERS,
    algorithmFileSha256: crypto.createHash('sha256').update(fs.readFileSync(new URL('../../server/utils/worldLegendsTossAlgorithm.js', import.meta.url))).digest('hex'),
    scope: 'Primary score: every archived non-Legends league, using database-verified participant outcomes only. Legends shown separately.',
    rule: 'Corrected support and activity must agree. Reverse on selected lay/back >=10% AND back lead >=3x, OR both lays zero. Otherwise retain base pick; missing/tied/conflicting inputs abstain.',
    backtestChangesLiveAlgorithms: false,
    summary: { otherLeagues: summarize(other), legends: summarize(observations.filter(row => row.isLegends)), all: summarize(observations) },
    leagues, patterns,
    noPickReasons: Object.entries(other.filter(row => row.result === 'no-pick').reduce((counts,row) => ({...counts,[row.reason]:(counts[row.reason]||0)+1}),{})).map(([reason,count])=>({reason,count})),
    observations,
    limitations: [
      'Archived replay only. Capture timestamps and provider preMatch fields do not prove inputs or predictions were available before the toss.',
      'Legends v3 thresholds were fitted to known Legends outcomes. No thresholds were retuned on other leagues for this replay.',
      'No-picks are disclosed separately, excluded from accuracy among picks, and included in coverage and correct-out-of-all-known rates.',
      'Only status=verified with an actual participant winner is scored. Pending user reports are not added. Abandoned/no-result records are excluded even if they contain an old prediction.',
      'Stored forecasts are historical saved picks from varied versions, not a replay of the current per-league algorithms. Comparisons on the same picked fixtures are shown separately.',
      'Results describe only the available archive, not every match played in each league or established future prediction accuracy.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(fs.readFileSync(new URL('inputs.json', import.meta.url),'utf8'));
  const before = JSON.stringify(input);
  const report = backtest(input);
  assert.equal(JSON.stringify(input), before, 'Backtest must not mutate inputs');
  fs.writeFileSync(new URL('results.json', import.meta.url), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({summary:report.summary,leagues:report.leagues.map(({storedForecasts,...row})=>row),noPickReasons:report.noPickReasons,patterns:report.patterns},null,2));
}
