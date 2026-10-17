const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { predictTossWinner, getLeagueTossPrediction } = require('../utils/tossPredictor');
const { WORLD_LEGENDS_TOSS_VERSION, isWorldLegendsTossLeague } = require('../utils/worldLegendsTossAlgorithm');
const { rows } = JSON.parse(fs.readFileSync(path.join(__dirname, '../../reports/legends-toss-analysis/inputs.json'), 'utf8'));
const verified = rows.filter(row => row.status === 'verified');
const league = 'World Championship of Legends T20';
function snapshot() {
  return { teamNames: ['Alpha', 'Beta'],
    preMatchVolume: { team1: { back: 300, lay: 1 }, team2: { back: 100, lay: 1 } },
    preMatchPnl: { team1: -200, team2: 250 },
    bookmakerExposure: { team1: { teamName: 'Alpha', netExposure: 200 }, team2: { teamName: 'Beta', netExposure: 80 } } };
}

test('Legends rule replays eight training outcomes without claiming held-out accuracy', () => {
  assert.equal(verified.length, 8);
  const patterns = {};
  for (const row of verified) {
    const before = JSON.stringify(row.snapshot);
    const p = predictTossWinner(row.snapshot, row.competitionName);
    assert.equal(p.winnerName, row.actualWinner, row.matchName);
    assert.equal(p.predictorVersion, WORLD_LEGENDS_TOSS_VERSION);
    assert.equal(p.validation, 'in-sample-fit-only');
    assert.equal(p.trainingSamples, 8);
    assert.equal(p.holdoutSamples, 0);
    assert.equal(p.confidence.calibrated, false);
    assert.equal(p.confidence.pct, 'Uncalibrated');
    assert.equal(p.risk.calibrated, false);
    assert.equal(p.risk.wrongPct, 'Uncalibrated');
    assert.equal(JSON.stringify(row.snapshot), before);
    patterns[p.pattern] = (patterns[p.pattern] || 0) + 1;
  }
  assert.deepEqual(patterns, { WORLD_LEGENDS_EXPOSURE_AND_NEGATIVE_PL: 6,
    WORLD_LEGENDS_HIGH_LAY_RELATIVE_TO_BACK: 1, WORLD_LEGENDS_ZERO_LAY_MODERATE_BACK_LEAD: 1 });
});

test('only explicit World Legends competition metadata selects the rule', () => {
  for (const name of [league, 'World Championship of Legends 2026', 'WCL', 'WCL T20 2026']) {
    assert.equal(isWorldLegendsTossLeague(name), true);
    for (const comp of [name, { competitionName: name }, { seriesName: name }]) {
      assert.equal(predictTossWinner(snapshot(), comp).predictorVersion, WORLD_LEGENDS_TOSS_VERSION);
    }
  }
  for (const name of ['Champions League', 'Legends League Cricket', 'Womens T20 Spring Challenge', '']) {
    assert.equal(isWorldLegendsTossLeague(name), false);
    assert.notEqual(predictTossWinner(snapshot(), name)?.predictorVersion, WORLD_LEGENDS_TOSS_VERSION);
  }
  const snap = { ...snapshot(), competitionName: league };
  assert.equal(predictTossWinner(snap).predictorVersion, WORLD_LEGENDS_TOSS_VERSION);
  assert.notEqual(predictTossWinner(snap, 'Caribbean Premier League').predictorVersion, WORLD_LEGENDS_TOSS_VERSION);
});

test('decisions are invariant to team positions, names and supplied results', () => {
  for (const row of verified) {
    const s = structuredClone(row.snapshot);
    const p = predictTossWinner(s, league);
    s.teamNames.reverse();
    for (const field of ['preMatchVolume', 'preMatchPnl', 'bookmakerExposure', 'advancedMetrics', 'advancedMetricsV2']) {
      if (s[field]) [s[field].team1, s[field].team2] = [s[field].team2, s[field].team1];
    }
    const q = predictTossWinner(s, league);
    assert.equal(q.winnerName, p.winnerName);
    assert.equal(q.pattern, p.pattern);
    const renamed = structuredClone(row.snapshot);
    renamed.teamNames = ['Neutral A', 'Neutral B'];
    renamed.bookmakerExposure.team1.teamName = renamed.teamNames[0];
    renamed.bookmakerExposure.team2.teamName = renamed.teamNames[1];
    Object.assign(renamed, { matchId: 'unseen', actualWinner: 'Neutral A', actualTossWinner: 'Neutral B', result: { winner: 'Neutral A' } });
    assert.equal(predictTossWinner(renamed, league).winnerIdx, p.winnerIdx);
    assert.equal(predictTossWinner(renamed, league).pattern, p.pattern);
  }
});

test('lay/back exception includes 10%; zero-lay exception excludes a 3x back lead', () => {
  const s = snapshot();
  s.preMatchVolume.team1.lay = 30;
  assert.equal(predictTossWinner(s, league).winnerName, 'Beta');
  s.preMatchVolume.team1.lay = 29.999;
  assert.equal(predictTossWinner(s, league).winnerName, 'Alpha');
  s.preMatchVolume.team1.lay = s.preMatchVolume.team2.lay = 0;
  assert.equal(predictTossWinner(s, league).winnerName, 'Alpha');
  s.preMatchVolume.team1.back = 299.999;
  assert.equal(predictTossWinner(s, league).winnerName, 'Beta');
  s.preMatchVolume.team2.back = 0;
  const p = predictTossWinner(s, league);
  assert.equal(p.winnerName, 'Alpha');
  assert.equal(p.algorithmEvidence.backLead, null);
});

test('incomplete, invalid or unsupported Legends inputs abstain without generic fallback', () => {
  const edits = [
    s => { delete s.bookmakerExposure; },
    s => { delete s.preMatchPnl; },
    s => { delete s.preMatchVolume.team1.lay; },
    s => { s.preMatchVolume.team1.back = NaN; },
    s => { s.preMatchVolume.team1.lay = -1; },
    s => { s.bookmakerExposure.team2.netExposure = Infinity; },
    s => { s.bookmakerExposure.team2.netExposure = 200; },
    s => { s.bookmakerExposure.team1.netExposure = -1; s.bookmakerExposure.team2.netExposure = -2; },
    s => { s.preMatchPnl.team1 = 200; },
    s => { s.preMatchPnl.team2 = -250; },
    s => { s.bookmakerExposure.team1.teamName = 'Wrong market'; },
    s => { s.teamNames = ['Alpha']; },
    s => { s.teamNames = ['Alpha', 'Alpha']; },
  ];
  for (const edit of edits) {
    const s = snapshot();
    edit(s);
    assert.equal(getLeagueTossPrediction(s, league).abstain, true);
    assert.equal(predictTossWinner(s, league), null);
  }
});

test('frontend and backend use the same Legends toss rule', async () => {
  const frontend = await import('../../frontend/src/utils/tossPredictor.js');
  for (const row of verified) {
    assert.deepEqual(frontend.predictTossWinner(row.snapshot, league), predictTossWinner(row.snapshot, league));
  }
});
