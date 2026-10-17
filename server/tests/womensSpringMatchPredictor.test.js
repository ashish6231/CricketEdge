const test = require('node:test');
const assert = require('node:assert/strict');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { getLeagueMatchAlgorithm, predictLeagueTrainingFit } = require('../utils/normalLeagueMatchPredictor.mjs');
const { isWomensSpringT20, WOMENS_SPRING_LEAGUE } = require('../utils/womensSpringMatchPredictor.mjs');

const snapshot = {
  competitionName: WOMENS_SPRING_LEAGUE,
  teamNames: ['Hobart Hurricanes W', 'ACT Meteors W'],
  preMatchVolume: {
    team1: { back: 14550.67, lay: 23709.57 },
    team2: { back: 4704.41, lay: 1863.38 },
  },
  preMatchTotalBets: { team1: 10687.5659, team2: 31860.4678 },
  preMatchPnl: { team1: 7474.0337, team2: -14122.7934 },
};

test('Spring aliases select an independent immutable match profile', () => {
  const spring = getLeagueMatchAlgorithm(WOMENS_SPRING_LEAGUE);
  const legends = getLeagueMatchAlgorithm('World Championship of Legends T20');
  assert.notEqual(spring.algorithmId, legends.algorithmId);
  assert.notEqual(spring.profile, legends.profile);
  assert.notEqual(spring.parameters, legends.parameters);
  assert.ok(Object.isFrozen(spring.profile));
  for (const name of [WOMENS_SPRING_LEAGUE, 'Women’s T20 Spring Challenge 2026', 'Womens Spring T20', 'Women Spring Twenty20 Challenge']) {
    assert.equal(getLeagueMatchAlgorithm(name), spring);
    const prediction = predictMatchWinner({ ...snapshot, competitionName: name });
    assert.equal(prediction.algorithmId, spring.algorithmId);
    assert.equal(prediction.algorithmLeague, WOMENS_SPRING_LEAGUE);
    assert.equal(prediction.tier, 'WOMENS_SPRING_T20_PREMATCH_CONSENSUS');
    assert.equal(prediction.validation, 'awaiting-data');
    assert.equal(prediction.trainingSamples, 0);
    assert.equal(prediction.confidenceCalibrated, false);
  }
  assert.equal(predictLeagueTrainingFit(snapshot), null);
  for (const name of ['WBBL', 'WNCL', "Women's Asia Cup T20", 'Spring T20 Men', '']) {
    assert.equal(isWomensSpringT20(name), false);
    assert.notEqual(predictMatchWinner({ ...snapshot, competitionName: name })?.algorithmId, spring.algorithmId);
  }
});

test('Spring uses the same cross-market consensus as Legends across agreements and conflicts', () => {
  const cases = [snapshot,
    { ...snapshot, preMatchTotalBets: { team1: 40000, team2: 100 } },
    { ...snapshot, preMatchTotalBets: { team1: 40000, team2: 100 }, preMatchPnl: { team1: -100, team2: 100 } },
    { ...snapshot, preMatchTotalBets: { team1: 0, team2: 0 }, preMatchPnl: { team1: 0, team2: 0 } },
  ];
  for (const input of cases) {
    const spring = predictMatchWinner(input);
    const legends = predictMatchWinner({ ...input, competitionName: 'World Championship of Legends T20' });
    assert.equal(spring.winnerIdx, legends.winnerIdx);
    assert.deepEqual(spring.marketEvidence, legends.marketEvidence);
    const swapped = { ...input, teamNames: [...input.teamNames].reverse() };
    for (const key of ['preMatchVolume', 'preMatchPnl', 'preMatchTotalBets']) {
      swapped[key] = { team1: input[key].team2, team2: input[key].team1 };
    }
    assert.equal(predictMatchWinner(swapped).winner, spring.winner);
  }
  const prediction = predictMatchWinner(snapshot);
  assert.equal(prediction.winner, 'ACT Meteors W');
  assert.equal(prediction.marketEvidence.support.team1, 16414.05);
  assert.equal(prediction.marketEvidence.agreeingSignals, 3);
});

test('Spring ignores untimed derived signals and abstains without usable market evidence', () => {
  const before = structuredClone(snapshot);
  const prediction = predictMatchWinner(snapshot);
  assert.deepEqual(snapshot, before);
  assert.deepEqual(predictMatchWinner({ ...snapshot, actualWinner: snapshot.teamNames[0],
    inPlayPnl: { team1: -999999, team2: 999999 },
    marketSignals: { prediction: { prediction: snapshot.teamNames[0] } },
    syntheticSupport: { strongerTeam: snapshot.teamNames[0] },
  }), prediction);
  assert.equal(predictMatchWinner({ ...snapshot, preMatchVolume: {} }), null);
  assert.equal(predictMatchWinner({ ...snapshot, teamNames: ['Only one team'] }), null);
  assert.equal(predictMatchWinner({ ...snapshot,
    preMatchVolume: { team1: { back: 10, lay: 10 }, team2: { back: 10, lay: 10 } },
    preMatchPnl: { team1: 0, team2: 0 }, preMatchTotalBets: { team1: 10, team2: 10 },
  }), null);
});

test('frontend selects Spring and replaces an old generic prediction lock', async () => {
  const { predictMatchStart, lockMatchStartPrediction } = await import('../../frontend/src/utils/matchStartPredictor.js');
  const backend = predictMatchWinner(snapshot);
  const frontend = predictMatchStart(snapshot);
  assert.equal(frontend.winnerName, backend.winner);
  assert.equal(frontend.algorithmId, backend.algorithmId);
  assert.deepEqual(frontend.marketEvidence, backend.marketEvidence);
  const oldLock = { ...frontend, algorithmId: 'match-unregistered-league-fallback', winnerName: snapshot.teamNames[0] };
  assert.equal(lockMatchStartPrediction(frontend, oldLock).algorithmId, backend.algorithmId);
});

function beforeStartSignals() {
  return {
    ...structuredClone(snapshot),
    startTime: '2026-10-15T05:00:00Z', serverTime: '2026-10-15T04:55:00Z',
    status: 'upcoming', inPlay: false,
    marketSignals: { prediction: { pattern: 'The Market Trap', prediction: snapshot.teamNames[0] } },
    syntheticSupport: { strongerTeam: snapshot.teamNames[0], supportRatio: 1.36 },
  };
}

test('pre-match trap and synthetic agreement override the Spring consensus with independent metadata', () => {
  const input = beforeStartSignals();
  const original = structuredClone(input);
  const result = predictMatchWinner(input);
  assert.equal(result.winner, input.teamNames[0]);
  assert.equal(result.tier, 'WOMENS_SPRING_T20_TRAP_SUPPORT_OVERRIDE');
  assert.equal(result.trapOverrideEvidence.consensusWinner, input.teamNames[1]);
  assert.equal(result.profileVersion, 'spring-t20-trap-support-v2');
  assert.equal(result.marketEvidence.agreeingSignals, 0);
  assert.equal(result.validation, 'unvalidated-spring-trap-rule');
  assert.equal(result.confidenceCalibrated, false);
  assert.equal(result.trainingSamples, 0);
  assert.deepEqual(input, original);
  const swapped = { ...input, teamNames: [...input.teamNames].reverse() };
  for (const key of ['preMatchVolume', 'preMatchPnl', 'preMatchTotalBets']) {
    swapped[key] = { team1: input[key].team2, team2: input[key].team1 };
  }
  assert.equal(predictMatchWinner(swapped).winner, result.winner);
  assert.equal(predictMatchWinner(swapped).winnerIdx, 1);
  const legends = predictMatchWinner({ ...input, competitionName: 'World Championship of Legends T20' });
  assert.equal(legends.winner, input.teamNames[1]);
  assert.equal(legends.trapOverrideEvidence, undefined);
});

test('both opposite-side signals are required, with finite support above parity', () => {
  const input = beforeStartSignals();
  const cases = [
    { ...input, marketSignals: {} },
    { ...input, syntheticSupport: {} },
    { ...input, marketSignals: { prediction: { ...input.marketSignals.prediction, pattern: 'The Alignment' } } },
    { ...input, syntheticSupport: { ...input.syntheticSupport, strongerTeam: input.teamNames[1] } },
    { ...input, marketSignals: { prediction: { ...input.marketSignals.prediction, prediction: 'Unknown team' } } },
    ...[1, 0, -1, NaN, Infinity, '1.36'].map(supportRatio => ({ ...input, syntheticSupport: { ...input.syntheticSupport, supportRatio } })),
  ];
  for (const candidate of cases) {
    const result = predictMatchWinner(candidate);
    assert.equal(result.winner, input.teamNames[1]);
    assert.equal(result.trapOverrideEvidence, undefined);
  }
});

test('late, live and untimed signals cannot rewrite a pre-match forecast', () => {
  const input = beforeStartSignals();
  for (const patch of [
    { startTime: undefined }, { serverTime: undefined }, { serverTime: 'invalid' },
    { serverTime: input.startTime }, { serverTime: '2026-10-15T05:01:00Z' },
    { capturedAt: '2026-10-15T05:01:00Z' }, { inPlay: true },
    { status: 'completed' }, { status: 'live' },
    { inputTiming: 'provider-frozen-fields-captured-after-start' },
  ]) {
    assert.equal(predictMatchWinner({ ...input, ...patch }).winner, input.teamNames[1]);
  }
  const seconds = { ...input, serverTime: Date.parse(input.serverTime) / 1000, startTime: Date.parse(input.startTime) / 1000 };
  assert.equal(predictMatchWinner(seconds).winner, input.teamNames[0]);
});

test('frontend shows the override and preserves its evidence when later live signals change', async () => {
  const { predictMatchStart, lockMatchStartPrediction } = await import('../../frontend/src/utils/matchStartPredictor.js');
  const input = beforeStartSignals();
  const first = predictMatchStart(input);
  assert.equal(first.winnerName, predictMatchWinner(input).winner);
  assert.equal(first.signals[0].label, 'Pre-match trap + support');
  const late = predictMatchStart({ ...input, serverTime: '2026-10-15T05:01:00Z', inPlay: true });
  const locked = lockMatchStartPrediction(late, first, { inPlay: true });
  assert.equal(locked.winnerName, first.winnerName);
  assert.deepEqual(locked.signals, first.signals);
  assert.deepEqual(locked.marketEvidence, first.marketEvidence);
  assert.deepEqual(locked.trapOverrideEvidence, first.trapOverrideEvidence);
  const oldProfile = { ...late, profileVersion: 'spring-t20-consensus-v1' };
  assert.equal(lockMatchStartPrediction(first, oldProfile).profileVersion, first.profileVersion);
});
