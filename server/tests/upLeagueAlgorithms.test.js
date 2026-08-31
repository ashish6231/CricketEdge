const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getUPT20Prediction, getLeagueAlgorithmPrediction } = require('../utils/leagueAlgorithms');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { getUPTossPrediction, inferCompetition, getLeagueTossPrediction } = require('../utils/tossLeagueAlgorithms');

describe('Uttar Pradesh Premier League (UP T20) Match Winner Algorithm', () => {
  it('correctly predicts Noida Super Kings in Noida Super Kings v Meerut Mavericks (30 Aug 2026)', () => {
    const snap = {
      matchId: '35997903',
      matchName: 'Noida Super Kings v Meerut Mavericks',
      competitionName: 'Uttar Pradesh Premier League',
      teamNames: ['Noida Super Kings', 'Meerut Mavericks'],
      preMatchVolume: {
        team1: { back: 39.28, lay: 0, total: 39.48 },
        team2: { back: 29.93, lay: 0.2, total: 29.93 }
      },
      preMatchPnl: {
        team1: -38.8664,
        team2: 22.4416
      },
      preMatchTotalBets: {
        team1: 68.7964,
        team2: 16.9764
      }
    };

    const pred = predictMatchWinner(snap);
    assert.ok(pred);
    assert.equal(pred.winner, 'Noida Super Kings');
    assert.equal(pred.tier, 'UP_SPECIAL');
    assert.equal(pred.confidence, 'UP Pre-Match Activity Lead');
  });

  it('correctly predicts Kanpur Superstar in Kanpur Superstar v Noida Super Kings (29 Aug 2026)', () => {
    const snap = {
      matchId: '35994069',
      matchName: 'Kanpur Superstar v Noida Super Kings',
      competitionName: 'Uttar Pradesh Premier League',
      teamNames: ['Kanpur Superstar', 'Noida Super Kings'],
      preMatchVolume: {
        team1: { back: 22.18, lay: 2.65, total: 26.19 },
        team2: { back: 7.92, lay: 4.01, total: 10.57 }
      },
      preMatchPnl: {
        team1: -27.6348,
        team2: 17.1886
      },
      preMatchTotalBets: {
        team1: 39.5298,
        team2: 7.638
      }
    };

    const pred = predictMatchWinner(snap);
    assert.ok(pred);
    assert.equal(pred.winner, 'Kanpur Superstar');
    assert.equal(pred.tier, 'UP_SPECIAL');
    assert.equal(pred.confidence, 'UP Pre-Match Activity Lead');
  });

  it('correctly predicts Kashi Rudras in Kashi Rudras v Noida Super Kings (28 Aug 2026)', () => {
    const snap = {
      matchId: '35987416',
      matchName: 'Kashi Rudras v Noida Super Kings',
      competitionName: 'Uttar Pradesh Premier League',
      teamNames: ['Kashi Rudras', 'Noida Super Kings'],
      preMatchVolume: {
        team1: { back: 10.62, lay: 0, total: 10.62 },
        team2: { back: 10.57, lay: 0, total: 10.57 }
      },
      preMatchPnl: {
        team1: -3.0236,
        team2: 2.2382
      },
      preMatchTotalBets: {
        team1: 13.5936,
        team2: 8.3818
      }
    };

    const pred = predictMatchWinner(snap);
    assert.ok(pred);
    assert.equal(pred.winner, 'Kashi Rudras');
    assert.equal(pred.tier, 'UP_SPECIAL');
    assert.equal(pred.confidence, 'UP Pre-Match Activity Lead');
  });

  it('correctly predicts Lucknow Falcons in Gorakhpur Lions v Lucknow Falcons (30 Aug 2026 - Lay Shield & Bookie Deficit)', () => {
    const snap = {
      matchId: '35997459',
      matchName: 'Gorakhpur Lions v Lucknow Falcons',
      competitionName: 'Uttar Pradesh Premier League',
      teamNames: ['Gorakhpur Lions', 'Lucknow Falcons'],
      preMatchVolume: {
        team1: { back: 80.48, lay: 0, total: 176.88 },
        team2: { back: 0.75, lay: 96.40, total: 0.75 }
      },
      preMatchPnl: {
        team1: -206.9436,
        team2: 152.6908
      },
      preMatchTotalBets: {
        team1: 207.6936,
        team2: 0.525
      }
    };

    const pred = predictMatchWinner(snap);
    assert.ok(pred);
    assert.equal(pred.winner, 'Lucknow Falcons');
    assert.equal(pred.tier, 'UP_SPECIAL');
    assert.equal(pred.confidence, 'UP Bookmaker Lay Shield');
  });

  it('correctly predicts Meerut Mavericks in Meerut Mavericks v Lucknow Falcons (Bookie Trap Fortress)', () => {
    const snap = {
      matchId: '35985679',
      matchName: 'Meerut Mavericks v Lucknow Falcons',
      competitionName: 'Uttar Pradesh Premier League',
      teamNames: ['Meerut Mavericks', 'Lucknow Falcons'],
      preMatchVolume: {
        team1: { back: 24.39, lay: 4.38, total: 28.62 },
        team2: { back: 83.51, lay: 4.23, total: 87.89 }
      },
      preMatchPnl: {
        team1: 80.6318,
        team2: -84.9524
      },
      preMatchTotalBets: {
        team1: 21.4842,
        team2: 115.4336
      }
    };

    const pred = predictMatchWinner(snap);
    assert.ok(pred);
    assert.equal(pred.winner, 'Meerut Mavericks');
    assert.equal(pred.tier, 'UP_SPECIAL');
    assert.equal(pred.confidence, 'UP Bookie Trap Fortress');
  });

  it('correctly predicts smart volume leader when bet counts are balanced', () => {
    const res = getUPT20Prediction(
      {},
      500, 200,
      10, 10,
      0, 0,
      'Noida Super Kings', 'Meerut Mavericks'
    );
    assert.ok(res);
    assert.equal(res.winner, 'Noida Super Kings');
    assert.equal(res.confidence, 'UP Smart Volume Margin');
  });
});

describe('Uttar Pradesh Premier League (UP T20) Toss Algorithm', () => {
  it('infers competition from team names', () => {
    assert.equal(inferCompetition({ teamNames: ['Noida Super Kings', 'Meerut Mavericks'] }), 'uttar pradesh premier league');
    assert.equal(inferCompetition({ teamNames: ['Kanpur Superstar', 'Lucknow Falcons'] }), 'uttar pradesh premier league');
    assert.equal(inferCompetition({ teamNames: ['Kashi Rudras', 'Gorakhpur Lions'] }), 'uttar pradesh premier league');
  });

  it('predicts toss winner via UP toss algorithm', () => {
    const snap = {
      teamNames: ['Noida Super Kings', 'Meerut Mavericks'],
      competitionName: 'Uttar Pradesh Premier League',
      preMatchVolume: {
        team1: { back: 50, lay: 10 },
        team2: { back: 20, lay: 5 },
      },
      preMatchPnl: { team1: -20, team2: 10 },
    };

    const pred = getLeagueTossPrediction(snap, 'Uttar Pradesh Premier League');
    assert.ok(pred);
    assert.equal(pred.winner, 'Noida Super Kings');
    assert.equal(pred.tier, 'UP_TOSS_SPECIAL');
    assert.equal(pred.algoName, '🇮🇳 UP T20 Toss Algorithm');
  });
});
