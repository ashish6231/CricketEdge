const test = require('node:test');
const assert = require('node:assert/strict');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const {
  getLeagueMatchAlgorithm,
  isSyedMushtaqAliTrophy,
  predictNormalLeagueMatch,
  predictFrozenLeagueBase,
  predictFrozenLeagueRules,
  PREDICTOR_VERSION,
} = require('../utils/normalLeagueMatchPredictor.mjs');

const smatUttarakhandMumbai = {
  competitionName: 'Syed Mushtaq Ali Trophy',
  teamNames: ['Uttarakhand', 'Mumbai'],
  status: 'completed',
  inPlay: false,
  preMatchVolume: {
    team1: { back: 31.71, lay: 27.17, total: 449.25 },
    team2: { back: 1336.63, lay: 417.54, total: 1363.80 },
  },
  preMatchTotalBets: { team1: 568.121, team2: 166.335 },
  preMatchPnl: { team1: 1071.799, team2: -78.7398 },
  inPlayPnl: { team1: 614.673, team2: -19.4886 },
  deepMetrics: { totals: { totalBetTeam1: 24013.201, totalBetTeam2: 3224.9261 } },
};

const smatBengalRajasthan = {
  competitionName: 'Syed Mushtaq Ali Trophy',
  teamNames: ['Bengal', 'Rajasthan'],
  status: 'completed',
  inPlay: true,
  useInPlayPnl: true,
  preMatchVolume: {
    team1: { back: 273217.66, lay: 7071.45, total: 275525.89 },
    team2: { back: 277123.82, lay: 2308.23, total: 284195.27 },
  },
  preMatchTotalBets: { team1: 275503.1168, team2: 284192.0606 },
  inPlayPnl: { team1: 8634.0109, team2: -8603.1355 },
};

test('Syed Mushtaq Ali Trophy and its aliases resolve to the pre-match Total Vol algorithm', () => {
  for (const name of ['Syed Mushtaq Ali Trophy', 'Syed Mustaq Ali Trophy', 'Syed Mushtaq Ali Trophy 2026', 'SMAT']) {
    assert.equal(isSyedMushtaqAliTrophy(name), true, name);
    const algorithm = getLeagueMatchAlgorithm(name);
    assert.equal(algorithm.league, 'Syed Mushtaq Ali Trophy');
    assert.equal(algorithm.algorithmId, 'match-syed-mushtaq-ali-trophy-total-vol-v1');
    assert.equal(algorithm.profile.strategy, 'higher-prematch-total-vol');
    assert.equal(algorithm.leagueRegistered, undefined);
    const pred = predictMatchWinner({ ...smatUttarakhandMumbai, competitionName: name });
    assert.equal(pred.winner, 'Mumbai');
    assert.equal(pred.leagueRegistered, true);
  }
});

test('SMAT picks higher preMatchVolume.total across all entry points even when preMatchTotalBets, back+lay, or inPlayPnl oppose it', () => {
  for (const predict of [predictMatchWinner, predictNormalLeagueMatch, predictFrozenLeagueBase, predictFrozenLeagueRules]) {
    const mumbaiPick = predict(smatUttarakhandMumbai);
    assert.equal(mumbaiPick.winner, 'Mumbai');
    assert.equal(mumbaiPick.winnerIdx, 1);
    assert.equal(mumbaiPick.algorithmStrategy, 'higher-prematch-total-vol');
    assert.deepEqual(mumbaiPick.preMatchTotalVolumeEvidence, {
      team1: 449.25,
      team2: 1363.8,
      winnerIdx: 1,
      signalCount: 1,
      selection: 'higher',
    });

    // back+lay for team1 (100+50=150) exceeds team2 (10+5=15), while preMatchVolume.total favors team2 (400 > 200)
    const explicitTotalOverride = predict({
      competitionName: 'Syed Mushtaq Ali Trophy',
      teamNames: ['Team A', 'Team B'],
      inPlay: true,
      useInPlayPnl: true,
      preMatchVolume: {
        team1: { back: 100, lay: 50, total: 200 },
        team2: { back: 10, lay: 5, total: 400 },
      },
      preMatchTotalBets: { team1: 99999, team2: 1 },
      preMatchPnl: { team1: 99999, team2: -99999 },
      inPlayPnl: { team1: 99999, team2: -99999 },
      deepMetrics: { totals: { totalBetTeam1: 999999, totalBetTeam2: 1 } },
      marketSignals: { prediction: { prediction: 'Team A' } },
    });
    assert.equal(explicitTotalOverride.winner, 'Team B');
    assert.equal(predict(smatBengalRajasthan).winner, 'Rajasthan');
  }
});

test('swapping team positions preserves SMAT predicted winner and abstains on missing/equal/invalid Total Vol', () => {
  const swapped = {
    ...smatUttarakhandMumbai,
    teamNames: ['Mumbai', 'Uttarakhand'],
    preMatchVolume: {
      team1: smatUttarakhandMumbai.preMatchVolume.team2,
      team2: smatUttarakhandMumbai.preMatchVolume.team1,
    },
    preMatchTotalBets: {
      team1: smatUttarakhandMumbai.preMatchTotalBets.team2,
      team2: smatUttarakhandMumbai.preMatchTotalBets.team1,
    },
    inPlayPnl: {
      team1: smatUttarakhandMumbai.inPlayPnl.team2,
      team2: smatUttarakhandMumbai.inPlayPnl.team1,
    },
  };
  assert.equal(predictMatchWinner(swapped).winner, 'Mumbai');
  assert.equal(predictMatchWinner(swapped).winnerIdx, 0);

  for (const vol of [
    undefined,
    { team1: { total: 100 }, team2: { total: 100 } },
    { team1: { total: 0 }, team2: { total: 0 } },
    { team1: { total: 100 }, team2: {} },
    { team1: { back: 500, lay: 100 }, team2: { back: 10, lay: 0 } },
    { team1: { total: -10 }, team2: { total: 50 } },
    { team1: { total: Number.NaN }, team2: { total: 50 } },
    { team1: { total: '' }, team2: { total: 50 } },
  ]) {
    assert.equal(predictMatchWinner({
      competitionName: 'Syed Mushtaq Ali Trophy',
      teamNames: ['Uttarakhand', 'Mumbai'],
      inPlay: true,
      useInPlayPnl: true,
      inPlayPnl: { team1: 500, team2: -200 },
      preMatchTotalBets: { team1: 500, team2: 10 },
      preMatchVolume: vol,
    }), null);
  }
});

test('frontend predictMatchStart agrees with backend for SMAT and invalidates older v14 locks', async () => {
  const { predictMatchStart, lockMatchStartPrediction } = await import('../../frontend/src/utils/matchStartPredictor.js');
  const frontend = predictMatchStart(smatBengalRajasthan);
  const backend = predictMatchWinner(smatBengalRajasthan);
  assert.equal(frontend.winnerName, backend.winner);
  assert.equal(frontend.algorithmId, backend.algorithmId);
  assert.equal(frontend.predictorVersion, PREDICTOR_VERSION);
  assert.equal(frontend.signals.length, 1);
  assert.equal(frontend.signals[0].label, 'Pre-match Total Vol');
  assert.match(frontend.signals[0].sublabel, /Higher pre-match Total Vol/);

  const staleV14Lock = {
    winnerName: 'Bengal',
    algorithmId: 'match-inplay-higher-pnl-v1',
    predictorVersion: 'match-v14-inplay-pnl-priority',
  };
  assert.equal(lockMatchStartPrediction(frontend, staleV14Lock, { inPlay: true }).winnerName, 'Rajasthan');
});
