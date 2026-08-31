const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getSherEPunjabPrediction, getLeagueAlgorithmPrediction } = require('../utils/leagueAlgorithms');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { getSherEPunjabTossPrediction, inferCompetition, getLeagueTossPrediction } = require('../utils/tossLeagueAlgorithms');

describe('Sher E Punjab T20 League Match Winner Algorithm', () => {
  it('correctly predicts Fazilka Falcons in Jalandhar vs Fazilka (Bookie Profit Trap / Fade Public)', () => {
    const snap = {
      matchId: '36014652',
      matchName: 'Jalandhar Warriors v Fazilka Falcons',
      competitionName: 'Sher E Punjab T20 League',
      teamNames: ['Jalandhar Warriors', 'Fazilka Falcons'],
      advancedMetricsV2: {
        team1: { back: 2529.40, lay: 262.10, totalBet: 2791.49 },
        team2: { back: 210.03, lay: 425.54, totalBet: 635.57 },
      },
      preMatchVolume: {
        team1: { back: 2529.40, lay: 262.10, total: 2791.49 },
        team2: { back: 210.03, lay: 425.54, total: 635.57 },
      },
      preMatchPnl: {
        team1: -2402.36,
        team2: 2764.90,
      }
    };

    const pred = predictMatchWinner(snap);
    assert.ok(pred);
    assert.equal(pred.winner, 'Fazilka Falcons');
    assert.equal(pred.tier, 'PUNJAB_SPECIAL');
    assert.equal(pred.confidence, 'Sher-e-Punjab Bookie Trap (Fade Public)');
  });

  it('correctly predicts Bathinda Royals in Mohali vs Bathinda (Bookie Profit Trap / Fade Public)', () => {
    const snap = {
      matchId: '36004132',
      matchName: 'Mohali Kings v Bathinda Royals',
      competitionName: 'Sher E Punjab T20 League',
      teamNames: ['Mohali Kings', 'Bathinda Royals'],
      advancedMetricsV2: {
        team1: { back: 4243.89, lay: 2790.45, totalBet: 7034.34 },
        team2: { back: 1192.79, lay: 2162.35, totalBet: 3355.13 },
      },
      preMatchVolume: {
        team1: { back: 105.71, lay: 0, total: 141.65 },
        team2: { back: 7.13, lay: 35.94, total: 7.13 },
      },
      preMatchPnl: {
        team1: -1715.79,
        team2: 3877.68,
      }
    };

    const pred = predictMatchWinner(snap);
    assert.ok(pred);
    assert.equal(pred.winner, 'Bathinda Royals');
    assert.equal(pred.tier, 'PUNJAB_SPECIAL');
    assert.equal(pred.confidence, 'Sher-e-Punjab Bookie Trap (Fade Public)');
  });

  it('predicts bookie safe side when liability exists on one team', () => {
    const res = getSherEPunjabPrediction(
      {},
      1000, 900,
      500, 200,
      -100, 100,
      'Jalandhar Warriors', 'Fazilka Falcons'
    );
    assert.ok(res);
    assert.equal(res.winner, 'Fazilka Falcons');
    assert.equal(res.confidence, 'Sher-e-Punjab Bookie Trap (Fade Public)');
  });

  it('predicts underdog when public load is higher on favorite', () => {
    const res = getSherEPunjabPrediction(
      {},
      100, 50,
      50, 50,
      0, 0,
      'Ludhiana Lions', 'Amritsar Gurdaspur'
    );
    assert.ok(res);
    assert.equal(res.winner, 'Amritsar Gurdaspur');
    assert.equal(res.confidence, 'Sher-e-Punjab Underdog Trap Fade');
  });
});

describe('Sher E Punjab T20 League Toss Algorithm', () => {
  it('infers competition from team names', () => {
    assert.equal(inferCompetition({ teamNames: ['Jalandhar Warriors', 'Fazilka Falcons'] }), 'sher e punjab t20 league');
    assert.equal(inferCompetition({ teamNames: ['Mohali Kings', 'Bathinda Royals'] }), 'sher e punjab t20 league');
  });

  it('predicts toss winner via Sher E Punjab toss algorithm (Bookie Safe)', () => {
    const snap = {
      teamNames: ['Mohali Kings', 'Bathinda Royals'],
      competitionName: 'Sher E Punjab T20 League',
      preMatchVolume: {
        team1: { back: 120, lay: 20 },
        team2: { back: 30, lay: 10 },
      },
      preMatchPnl: { team1: -100, team2: 50 },
    };

    const pred = getLeagueTossPrediction(snap, 'Sher E Punjab T20 League');
    assert.ok(pred);
    assert.equal(pred.winner, 'Bathinda Royals');
    assert.equal(pred.tier, 'PUNJAB_TOSS_SPECIAL');
    assert.equal(pred.algoName, '🦁 Sher-e-Punjab Toss Algorithm');
  });
});
