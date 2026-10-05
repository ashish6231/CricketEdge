const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { predictNormalLeagueMatch } = require('../utils/normalLeagueMatchPredictor.mjs');

const indiaEngland = {
  competitionName: 'World Championship of Legends T20',
  teamNames: ['India Legends', 'England Legends'],
  preMatchVolume: {
    team1: { back: 14550.67, lay: 23709.57 },
    team2: { back: 4704.41, lay: 1863.38 },
  },
  preMatchTotalBets: { team1: 10687.5659, team2: 31860.4678 },
  preMatchPnl: { team1: 7474.0337, team2: -14122.7934 },
};

test('World Legends treats a lay on India as support for England', () => {
  const prediction = predictNormalLeagueMatch(indiaEngland);
  assert.equal(prediction.winner, 'England Legends');
  assert.equal(prediction.tier, 'WORLD_LEGENDS_PREMATCH_CONSENSUS');
  assert.equal(prediction.marketEvidence.support.team1, 16414.05);
  assert.ok(Math.abs(prediction.marketEvidence.support.team2 - 28413.98) < 1e-9);
  assert.equal(Math.round(prediction.marketEvidence.support.pct2), 63);
  assert.equal(Math.round(prediction.marketEvidence.activity.pct2), 75);
  assert.equal(prediction.marketEvidence.bookmakerPressureIdx, 1);
  assert.equal(prediction.marketEvidence.agreeingSignals, 3);
});

test('World Legends consensus is symmetric when team slots are swapped', () => {
  const swapped = {
    ...indiaEngland,
    teamNames: [...indiaEngland.teamNames].reverse(),
    preMatchVolume: { team1: indiaEngland.preMatchVolume.team2, team2: indiaEngland.preMatchVolume.team1 },
    preMatchTotalBets: { team1: indiaEngland.preMatchTotalBets.team2, team2: indiaEngland.preMatchTotalBets.team1 },
    preMatchPnl: { team1: indiaEngland.preMatchPnl.team2, team2: indiaEngland.preMatchPnl.team1 },
  };
  const prediction = predictNormalLeagueMatch(swapped);
  assert.equal(prediction.winner, 'England Legends');
  assert.equal(prediction.winnerIdx, 0);
});

test('World Legends current rule passes every independently verified completed league match', async () => {
  const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/match_dataset.json'), 'utf8'));
  const outcomes = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../../reports/match-predictions/world-legends/outcomes.json'), 'utf8',
  ));
  const { runWorldLegendsBacktest } = await import('../../reports/match-predictions/world-legends/backtest.mjs');
  const report = runWorldLegendsBacktest(dataset, outcomes);

  assert.deepEqual(report.summary, {
    archivedMarkets: 4,
    completedWithVerifiedWinner: 3,
    correct: 3,
    wrong: 0,
    unscored: 1,
    accuracyPct: 100,
    verdict: 'PASS',
  });
  assert.equal(report.rows.find(row => row.matchId === '36147996').currentPrediction, 'England Legends');
  assert.equal(report.rows.find(row => row.matchId === '36128071').verdict, 'Unscored');
  assert.ok(report.rows.every(row => row.inputTiming === 'frozen-pre-match-fields'));
});
