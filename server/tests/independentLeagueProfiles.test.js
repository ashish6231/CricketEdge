const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LEAGUE_MATCH_ALGORITHMS, getLeagueMatchAlgorithm, predictLeagueTrainingFit } = require('../utils/normalLeagueMatchPredictor.mjs');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { listMatchDataset } = require('../services/adminMatchDataset');
const rows = require('../data/match_dataset.json').records;
const winners = rows.filter(row => row.status === 'verified' && row.resultVerification?.verification === 'verified');

test('all 42 dropdown leagues have their own immutable module, predictor and profile version', () => {
  const modules = fs.readdirSync(path.join(__dirname, '../utils/matchLeagueProfiles')).filter(name => name !== 'index.mjs');
  assert.equal(modules.length, 42);
  assert.equal(new Set(LEAGUE_MATCH_ALGORITHMS.map(algorithm => algorithm.predict)).size, 42);
  assert.equal(new Set(LEAGUE_MATCH_ALGORITHMS.map(algorithm => algorithm.profile)).size, 42);
  assert.equal(new Set(LEAGUE_MATCH_ALGORITHMS.map(algorithm => algorithm.profile.profileVersion)).size, 42);
  for (const algorithm of LEAGUE_MATCH_ALGORITHMS) {
    assert.ok(Object.isFrozen(algorithm.profile));
    assert.ok(Object.isFrozen(algorithm.profile.parameters));
    assert.match(algorithm.algorithmId, /-independent-v1$/);
  }
});

test('live routing and saved replay reconcile every league without claiming a perfect active score', () => {
  let correct = 0, missed = 0;
  for (const row of winners) {
    const input = { ...row.snapshot, competitionName: row.competitionName };
    const prediction = predictMatchWinner(input);
    const algorithm = getLeagueMatchAlgorithm(row.competitionName);
    assert.ok(prediction);
    assert.equal(prediction.algorithmId, algorithm.algorithmId);
    assert.equal(prediction.profileVersion, algorithm.profile.profileVersion);
    assert.equal(prediction.confidenceCalibrated, false);
    if (prediction.winner === row.actualWinner) correct++; else missed++;
  }
  const report = require('../../reports/match-predictions/independent-leagues/results.json');
  assert.equal(correct, report.activeReplay.correct);
  assert.equal(missed, report.activeReplay.wrong);
  assert.ok(missed > 0, 'Unresolved historical misses must remain visible');
});

test('independent training-fit trees replay the verified examples with explicit in-sample labels', () => {
  for (const row of winners) {
    const prediction = predictLeagueTrainingFit({ ...row.snapshot, competitionName: row.competitionName });
    assert.equal(prediction.winner, row.actualWinner, row.matchId);
    assert.equal(prediction.validation, 'in-sample-training-fit');
    assert.equal(prediction.confidenceCalibrated, false);
  }
  const unseen = name => ({ teamNames: ['A', 'B'], competitionName: name,
    preMatchVolume: { team1: { back: 100, lay: 10 }, team2: { back: 20, lay: 5 } }, preMatchPnl: { team1: -60, team2: 60 } });
  assert.equal(getLeagueMatchAlgorithm('WNCL').profile.trainingSamples, 0);
  assert.equal(predictLeagueTrainingFit(unseen('WNCL')), null);
  assert.equal(getLeagueMatchAlgorithm('Emirates D10').profile.trainingSamples, 1);
  assert.equal(predictLeagueTrainingFit(unseen('Emirates D10')).validation, 'in-sample-training-fit');
});

test('all league algorithms handle unseen proper inputs without reading winner labels or IDs', () => {
  for (const algorithm of LEAGUE_MATCH_ALGORITHMS) {
    for (let index = 1; index <= 20; index++) {
      const snapshot = { competitionName: algorithm.league, teamNames: ['New Team A', 'New Team B'],
        preMatchVolume: { team1: { back: index * 137, lay: index * 3 }, team2: { back: index * 19, lay: index * 7 } },
        preMatchPnl: { team1: -index * 93, team2: index * 91 }, preMatchTotalBets: { team1: index * 40, team2: index * 17 } };
      const before = structuredClone(snapshot);
      const prediction = predictMatchWinner(snapshot);
      assert.ok(['New Team A', 'New Team B'].includes(prediction?.winner), algorithm.league);
      assert.equal(prediction.commonFactors?.family, 'relative-market-flow');
      assert.equal(prediction.commonFactors?.validation, 'retrospective-descriptive-factor; not a calibrated probability');
      const changed = predictMatchWinner({ ...snapshot, actualWinner: prediction.winner === 'New Team A' ? 'New Team B' : 'New Team A', matchId: 'unseen-id',
        startTime: 1, score: { winner: 'Wrong' }, inPlayPnl: { team1: 1e20, team2: -1e20 } });
      assert.equal(changed.winner, prediction.winner);
      assert.deepEqual(snapshot, before);
    }
  }
});

test('correction candidates learn baseline errors and abstain when their supporting history is too small', async () => {
  const { fitCandidate } = await import('../../reports/match-predictions/independent-leagues/learner.mjs');
  const { evaluateLeagueModel } = require('../utils/leagueProfileRuntime.mjs');
  const rows = [
    { x: [0.1], base: 0, y: 1 }, { x: [0.2], base: 1, y: 0 },
    { x: [0.8], base: 0, y: 0 }, { x: [0.9], base: 1, y: 1 },
  ];
  const model = fitCandidate(rows, { kind: 'correction', maxDepth: 1, minSupport: 2, features: [0] });
  assert.equal(evaluateLeagueModel(model, [0.15], 0).side, 1);
  assert.equal(evaluateLeagueModel(model, [0.15], 1).side, 0);
  assert.equal(evaluateLeagueModel(model, [0.85], 1).side, 1);
  const guarded = { ...model, minSupport: 3 };
  assert.equal(evaluateLeagueModel(guarded, [0.15], 0).side, 0);
});

test('prediction filters independently select active, training-fit and original saved results', async () => {
  const deps = { store: { load: async () => ({ records: rows }) }, trackedStores: [] };
  const active = await listMatchDataset({ result: 'miss', predictionMode: 'active', limit: 100 }, deps);
  const training = await listMatchDataset({ result: 'miss', predictionMode: 'training', limit: 100 }, deps);
  const saved = await listMatchDataset({ result: 'miss', predictionMode: 'saved', limit: 100 }, deps);
  const report = require('../../reports/match-predictions/independent-leagues/results.json');
  assert.equal(active.pagination.total, report.activeReplay.wrong);
  assert.equal(training.pagination.total, 0);
  assert.equal(saved.pagination.total, winners.filter(row => row.predictedWinner !== row.actualWinner).length);
  assert.equal(active.summary.verified, winners.length);
});

test('model selection uses forward development folds and discloses limited or absent history', () => {
  for (const algorithm of LEAGUE_MATCH_ALGORITHMS) {
    const profile = algorithm.profile;
    if (profile.trainingSamples < 6) {
      assert.equal(profile.model, null);
      assert.ok(['insufficient-history', 'awaiting-data'].includes(profile.validationStatus));
    }
    if (profile.model) {
      assert.equal(profile.evaluation.developmentFolds.length, 2);
      assert.ok(profile.evaluation.developmentFolds.every(fold => fold.correct >= fold.baseCorrect));
      assert.ok(profile.evaluation.replay.correct >= profile.evaluation.baseline.correct);
    }
  }
});
