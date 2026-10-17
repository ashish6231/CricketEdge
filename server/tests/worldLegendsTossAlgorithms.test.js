const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { predictTossWinner, getLeagueTossPrediction } = require('../utils/tossPredictor');
const { WORLD_LEGENDS_TOSS_VERSION, isWorldLegendsTossLeague } = require('../utils/worldLegendsTossAlgorithm');
const { rows } = JSON.parse(fs.readFileSync(path.join(__dirname, '../../reports/legends-toss-analysis/inputs.json'), 'utf8'));
const verified = rows.filter(row => row.status === 'verified');
const auditInput = JSON.parse(fs.readFileSync(path.join(__dirname, '../../reports/legends-toss-analysis/re-evaluation/inputs.json'), 'utf8'));
const league = 'World Championship of Legends T20';
function snapshot() {
  return { teamNames: ['Alpha', 'Beta'],
    preMatchVolume: { team1: { back: 300, lay: 1 }, team2: { back: 100, lay: 1 } },
    preMatchTotalBets: { team1: 300, team2: 100 },
    preMatchPnl: { team1: -200, team2: 250 },
    bookmakerExposure: { team1: { teamName: 'Alpha', netExposure: 200 }, team2: { teamName: 'Beta', netExposure: 80 } } };
}

test('Legends rule replays seven retained original outcomes and excludes abandoned labels', () => {
  assert.equal(verified.length, 7);
  const patterns = {};
  for (const row of verified) {
    const before = JSON.stringify(row.snapshot);
    const p = predictTossWinner(row.snapshot, row.competitionName);
    assert.equal(p.winnerName, row.actualWinner, row.matchName);
    assert.equal(p.predictorVersion, WORLD_LEGENDS_TOSS_VERSION);
    assert.equal(p.validation, 'in-sample-fit-only');
    assert.equal(p.trainingSamples, 9);
    assert.equal(p.trainingVerifiedSamples, 8);
    assert.equal(p.trainingUserReportedSamples, 1);
    assert.equal(p.holdoutSamples, 0);
    assert.equal(p.confidence.calibrated, false);
    assert.equal(p.confidence.pct, 'Uncalibrated');
    assert.equal(p.risk.calibrated, false);
    assert.equal(p.risk.wrongPct, 'Uncalibrated');
    assert.equal(p.risk.shortLabel, 'Unvalidated');
    assert.match(p.validationNote, /no independent pre-toss validation/);
    assert.equal(JSON.stringify(row.snapshot), before);
    patterns[p.pattern] = (patterns[p.pattern] || 0) + 1;
  }
  assert.deepEqual(patterns, { WORLD_LEGENDS_SUPPORT_ACTIVITY_CONSENSUS: 5,
    WORLD_LEGENDS_HIGH_LAY_AND_BACK_DOMINANCE: 1, WORLD_LEGENDS_BOTH_ZERO_LAY: 1 });
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
    for (const field of ['preMatchVolume', 'preMatchTotalBets', 'preMatchPnl', 'bookmakerExposure', 'advancedMetrics', 'advancedMetricsV2']) {
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

test('lay/back exception includes 10%; both-zero-lay reverses without a back-lead cutoff', () => {
  const s = snapshot();
  s.preMatchVolume.team1.lay = 30;
  assert.equal(predictTossWinner(s, league).winnerName, 'Beta');
  s.preMatchVolume.team1.lay = 29.999;
  assert.equal(predictTossWinner(s, league).winnerName, 'Alpha');
  s.preMatchVolume.team1.lay = s.preMatchVolume.team2.lay = 0;
  assert.equal(predictTossWinner(s, league).winnerName, 'Beta');
  s.preMatchVolume.team1.back = 299.999;
  assert.equal(predictTossWinner(s, league).winnerName, 'Beta');
  s.preMatchVolume.team2.back = 0;
  const p = predictTossWinner(s, league);
  assert.equal(p.winnerName, 'Beta');
  assert.equal(p.algorithmEvidence.backLead, null);
});

test('high-lay reversal requires back dominance as well as lay resistance', () => {
  const s = snapshot();
  s.preMatchVolume.team1.lay = 30;
  assert.equal(predictTossWinner(s, league).winnerName, 'Beta');
  s.preMatchVolume.team2.back = 100.001;
  let p = predictTossWinner(s, league);
  assert.equal(p.winnerName, 'Alpha');
  assert.equal(p.algorithmEvidence.highLayResistance, true);
  assert.equal(p.algorithmEvidence.highLayBackDominance, false);
  assert.match(p.reason, /high-lay exception does not apply/);
  s.preMatchVolume.team1.lay = 60;
  assert.equal(predictTossWinner(s, league).winnerName, 'Alpha');
  s.preMatchVolume.team2.back = 0;
  p = predictTossWinner(s, league);
  assert.equal(p.winnerName, 'Beta');
  assert.equal(p.algorithmEvidence.backLead, null);
  assert.equal(p.algorithmEvidence.highLayExceptionApplied, true);
});

test('October 16 Australia failure and all verified audit outcomes replay without result leakage', () => {
  let scored = 0;
  for (const row of auditInput.rows) {
    const report = auditInput.reportedOutcomes.find(outcome => outcome.matchId === row.matchId);
    const actual = row.status === 'verified' ? row.actualWinner : report?.actualWinner;
    if (!actual || row.status === 'abandoned' || actual === 'No Result') continue;
    const before = JSON.stringify(row);
    const p = predictTossWinner(row.snapshot, row.competitionName);
    assert.equal(p.winnerName, actual, row.matchId);
    const altered = { ...structuredClone(row.snapshot), matchId: 'unseen',
      actualWinner: 'Fabricated', actualTossWinner: 'Fabricated', result: { winner: 'Fabricated' } };
    assert.equal(predictTossWinner(altered, league).winnerIdx, p.winnerIdx);
    const swapped = structuredClone(altered);
    swapped.teamNames.reverse();
    for (const field of ['preMatchVolume', 'preMatchTotalBets', 'preMatchPnl', 'bookmakerExposure']) {
      [swapped[field].team1, swapped[field].team2] = [swapped[field].team2, swapped[field].team1];
    }
    assert.equal(predictTossWinner(swapped, league).winnerName, actual);
    if (row.matchId === '36194408') {
      assert.equal(row.status, 'pending');
      assert.equal(row.actualWinner, null);
      assert.equal(p.pattern, 'WORLD_LEGENDS_SUPPORT_ACTIVITY_CONSENSUS');
      assert.equal(p.algorithmEvidence.highLayResistance, true);
      assert.equal(p.algorithmEvidence.highLayExceptionApplied, false);
      assert.match(p.reason, /1\.34x/);
    }
    assert.equal(JSON.stringify(row), before);
    scored++;
  }
  assert.equal(scored, 9);
  const abandoned = auditInput.rows.find(row => row.matchId === '36148172');
  assert.equal(abandoned.status, 'abandoned');
  assert.equal(abandoned.actualWinner, 'No Result');
  assert.equal(abandoned.predictionCorrect, null);
});

test('incomplete, invalid or unsupported Legends inputs abstain without generic fallback', () => {
  const edits = [
    s => { delete s.preMatchTotalBets; },
    s => { s.preMatchTotalBets.team1 = NaN; },
    s => { delete s.preMatchVolume.team1.lay; },
    s => { s.preMatchVolume.team1.back = NaN; },
    s => { s.preMatchVolume.team1.lay = -1; },
    s => { s.preMatchTotalBets.team2 = Infinity; },
    s => { s.preMatchTotalBets.team2 = -1; },
    s => { s.preMatchTotalBets.team2 = 300; },
    s => { s.preMatchTotalBets.team2 = 400; },
    s => { s.preMatchVolume.team2.back = 300; },
    s => { s.preMatchTotalBets.team1 = s.preMatchTotalBets.team2 = 0; },
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

test('support/activity is sufficient; P/L, exposure and saved results cannot change the decision', async () => {
  const { predictCandidate } = await import('../../reports/legends-toss-analysis/support-activity-backtest/factor-audit.mjs');
  for (const row of auditInput.rows) {
    const snap = structuredClone(row.snapshot);
    delete snap.preMatchPnl;
    delete snap.bookmakerExposure;
    const expected = predictCandidate(snap, 'high-guard-any-both-zero');
    const p = predictTossWinner(snap, league);
    assert.equal(p?.winnerIdx, expected.winnerIdx);
    snap.preMatchPnl = { team1: -1e9, team2: 1e9 };
    snap.bookmakerExposure = { team1: { teamName: 'Wrong', netExposure: -1e9 }, team2: { netExposure: 1e9 } };
    snap.actualWinner = snap.teamNames[1 - p.winnerIdx];
    assert.equal(predictTossWinner(snap, league).winnerIdx, p.winnerIdx);
    assert.equal(p.algorithmEvidence.baselineLeader, snap.teamNames[p.algorithmEvidence.baselineIdx]);
  }
});

test('frontend and backend use the same Legends toss rule', async () => {
  const frontend = await import('../../frontend/src/utils/tossPredictor.js');
  for (const row of auditInput.rows) {
    assert.deepEqual(frontend.predictTossWinner(row.snapshot, league), predictTossWinner(row.snapshot, league));
  }
});
