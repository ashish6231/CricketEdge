const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getKeralaPrediction } = require('../utils/leagueAlgorithms');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { getKeralaTossPrediction, getLeagueTossPrediction } = require('../utils/tossLeagueAlgorithms');

describe('Kerala Cricket League Match Winner Algorithm', () => {
  it('correctly predicts Trivandrum Royals in Alleppey vs Trivandrum (Lay Dump Resistance on Alleppey & 2.8x Bet Activity on Trivandrum)', () => {
    const snap = {
      matchId: '36004150',
      matchName: 'Alleppey Ripples v Trivandrum Royals',
      competitionName: 'Kerala Cricket League',
      teamNames: ['Alleppey Ripples', 'Trivandrum Royals'],
      preMatchVolume: {
        team1: { back: 45.40, lay: 180.52, total: 80.66 },
        team2: { back: 15.99, lay: 35.26, total: 196.51 },
      },
      preMatchTotalBets: {
        team1: 71.36,
        team2: 199.06,
      },
      supportMetrics: {
        team1: { supportMoney: 227800.05, support: 38.7 },
        team2: { supportMoney: 359830.56, support: 61.3 },
      },
      advancedMetrics: {
        team1: { back: 102884, lay: 173033 },
        team2: { back: 186797, lay: 124915 },
      },
      preMatchPnl: {
        team1: 99.12,
        team2: -104.29,
      }
    };

    const pred = predictMatchWinner(snap);
    assert.ok(pred);
    assert.equal(pred.winner, 'Trivandrum Royals');
    assert.equal(pred.tier, 'KERALA_SPECIAL');
    assert.equal(pred.confidence, 'Kerala Lay Resistance Dump');
  });

  it('correctly predicts Alleppey Ripples in Alleppey vs Calicut (Lay resistance on Calicut & Clean Back on Alleppey)', () => {
    const snap = {
      matchId: '35988970',
      matchName: 'Alleppey Ripples v Calicut Globstars',
      competitionName: 'Kerala Cricket League',
      teamNames: ['Alleppey Ripples', 'Calicut Globstars'],
      preMatchVolume: {
        team1: { back: 130.42, lay: 34.76, total: 244.58 },
        team2: { back: 44.40, lay: 114.16, total: 79.16 },
      },
      preMatchTotalBets: {
        team1: 223.91,
        team2: 84.95,
      },
      preMatchPnl: {
        team1: -154.26,
        team2: 173.41,
      }
    };

    const pred = predictMatchWinner(snap);
    assert.ok(pred);
    assert.equal(pred.winner, 'Alleppey Ripples');
    assert.equal(pred.tier, 'KERALA_SPECIAL');
  });
});

describe('Kerala Cricket League Toss Algorithm', () => {
  it('correctly predicts Trivandrum Royals on Alleppey vs Trivandrum (Lay Resistance on Alleppey)', () => {
    const pred = getKeralaTossPrediction({
      t1: 'Alleppey Ripples',
      t2: 'Trivandrum Royals',
      b1: 45.40,
      b2: 15.99,
      l1: 180.52,
      l2: 35.26,
      prePnl1: 99.12,
      prePnl2: -104.29,
      backRatio: 2.8,
    });
    assert.ok(pred);
    assert.equal(pred.winner, 'Trivandrum Royals');
    assert.equal(pred.tier, 'KERALA_TOSS_SPECIAL');
    assert.equal(pred.pattern, 'KERALA_LAY_RESISTANCE');
  });
});
