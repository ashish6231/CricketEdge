const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('current ODI rule passes every independently verified retained ODI match', async () => {
  const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/match_dataset.json'), 'utf8'));
  const { runOdiBacktest } = await import('../../reports/match-predictions/one-day-internationals/backtest.mjs');
  const report = runOdiBacktest(dataset);

  assert.ok(report.summary.verifiedMatches >= 5, 'Expected at least five verified ODI matches');
  assert.equal(report.summary.currentRuleCorrect, report.summary.verifiedMatches);
  assert.equal(report.summary.currentRuleWrong, 0);
  assert.equal(report.summary.verdict, 'PASS');
  assert.ok(report.rows.every(row => row.inputTiming === 'frozen-pre-match-fields'));
});

test('India v West Indies 3rd ODI follows West Indies frozen market pressure', async () => {
  const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/match_dataset.json'), 'utf8'));
  const { runOdiBacktest } = await import('../../reports/match-predictions/one-day-internationals/backtest.mjs');
  const report = runOdiBacktest(dataset);
  const row = report.indiaWestIndiesAudit;

  assert.equal(row.savedPrediction, 'India');
  assert.equal(row.currentPrediction, 'West Indies');
  assert.equal(row.actualWinner, 'West Indies');
  assert.equal(row.verdict, 'Correct');
  assert.equal(row.evidence.prediction, 'West Indies');
  assert.equal(row.evidence.bookmakerPressureTeam, 'West Indies');
  assert.equal(row.evidence.signalsSupportingCurrentPick, '3/3');
  assert.deepEqual(row.evidence.correctedSupportPct, [47.5, 52.5]);
  assert.deepEqual(row.evidence.preMatchActivityPct, [13.3, 86.7]);
});

test('blanket World Legends consensus is rejected for ODIs because it regresses a verified match', async () => {
  const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/match_dataset.json'), 'utf8'));
  const { runOdiBacktest } = await import('../../reports/match-predictions/one-day-internationals/backtest.mjs');
  const report = runOdiBacktest(dataset);

  assert.equal(report.summary.crossMarketOnlyCorrect, 4);
  assert.equal(report.summary.crossMarketOnlyWrong, 1);
  const regression = report.rows.find(row => row.evidence.prediction !== row.actualWinner);
  assert.equal(regression.matchName, 'England v Sri Lanka');
});
