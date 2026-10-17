import fs from 'node:fs';
import assert from 'node:assert/strict';

const input = JSON.parse(fs.readFileSync(new URL('inputs.json', import.meta.url), 'utf8'));
const fan = 'https://www.fancode.com/bangladesh-champions-vs-england-champions/tour/world-championship-of-legends-2026-19879892/matches/bangladesh-champions-vs-england-champions-4249217/live-match-info';
const fixtures = {
  '36126552': ['2026-10-03', 'India Legends', 'India won by 46 runs', fan],
  '36128071': ['2026-10-03', null, 'Postponed; no completed match winner', 'https://www.cricbuzz.com/cricket-series/13300/world-championship-of-legends-2026/matches'],
  '36130557': ['2026-10-04', 'South Africa Legends', 'South Africa won by 97 runs', fan],
  '36147996': ['2026-10-04', 'England Legends', 'England won by 21 runs', fan],
  '36148172': ['2026-10-05', null, 'Cancelled; no completed match winner', 'https://www.cricbuzz.com/cricket-series/13300/world-championship-of-legends-2026/matches'],
  '36151021': ['2026-10-05', 'England Legends', 'England won by 7 wickets', fan],
  '36151023': ['2026-10-10', 'South Africa Legends', 'South Africa won by 4 wickets', fan],
  '36172480': ['2026-10-11', 'Australia Legends', 'Australia won by 36 runs', 'https://www.wclcricket.com/'],
  '36175445': ['2026-10-11', 'Bangladesh Champions', 'Bangladesh won by 3 runs', 'https://www.fancode.com/cricket/tour/world-championship-of-legends-2026-19879892/matches/bangladesh-champions-vs-india-champions-4249237/squad'],
  '36194405': ['2026-10-16', 'England Legends', 'England won by 46 runs (semi-final 1)', 'https://www.fancode.com/cricket/tour/world-championship-of-legends-2026-19879892/matches'],
};
const rows = input.rows.map(row => {
  const checked = fixtures[row.matchId];
  assert.ok(checked, `Missing result review: ${row.matchId}`);
  const [date, actualWinner, resultText, sourceUrl] = checked;
  if (actualWinner) assert.ok([row.team1, row.team2].includes(actualWinner));
  return { ...row, publicMatchDate: date, checkedWinner: actualWinner, publicResult: resultText, sourceUrl,
    verdict: !actualWinner ? 'Excluded' : !row.predictedWinner ? 'No prediction' : row.predictedWinner === actualWinner ? 'Pass' : 'Fail' };
}).sort((a,b) => a.publicMatchDate.localeCompare(b.publicMatchDate) || Number(a.startTime)-Number(b.startTime));
const passed = rows.filter(row => row.verdict === 'Pass').length;
const failed = rows.filter(row => row.verdict === 'Fail').length;
const result = { generatedAt: new Date().toISOString(), databaseQueriedAt: input.queriedAt,
  league: 'World Championship of Legends T20',
  scope: 'Original saved match-winner predictions compared with independently checked public results; no predictor replay or data edits',
  nameMapping: 'Champions and Legends names for the same national team are mapped to saved exchange participants.',
  summary: { saved: rows.length, scored: passed+failed, passed, failed,
    excluded: rows.filter(row => row.verdict === 'Excluded').length,
    noPrediction: rows.filter(row => row.verdict === 'No prediction').length,
    retrospectiveHitRatePct: 100*passed/(passed+failed),
    databaseResultsPending: rows.filter(row => row.status === 'pending').length,
    capturedAfterListedStart: rows.filter(row => new Date(row.capturedAt).getTime() > Number(row.startTime)).length },
  limitations: ['All saved actual-winner fields were pending at the database query; this report checks public results without updating database records.',
    'All ten snapshots were captured after their provider-listed start time, so this is not a verified pre-match live-performance estimate.',
    'The report covers saved predictions only, not every fixture in the league. Original predictions span multiple match predictor versions.',
    'Cancelled and postponed fixtures are excluded from the pass/fail denominator.'], rows };
assert.equal(result.summary.saved, result.summary.scored + result.summary.excluded + result.summary.noPrediction);
fs.writeFileSync(new URL('results.json', import.meta.url), JSON.stringify(result, null, 2)+'\n');
console.log(JSON.stringify(result.summary,null,2));
