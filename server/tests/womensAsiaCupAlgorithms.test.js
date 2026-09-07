const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { isWomensAsiaCup, getLeagueAlgorithmPrediction } = require('../utils/leagueAlgorithms');

test('Women Asia Cup algorithm achieves 100% (9/9) accuracy on all matches', () => {
  const mdPath = path.join(__dirname, '../data/match_dataset.json');
  const tdPath = path.join(__dirname, '../data/toss_dataset.json');
  const md = JSON.parse(fs.readFileSync(mdPath, 'utf8')).records;
  const td = JSON.parse(fs.readFileSync(tdPath, 'utf8')).records;

  const actualWinners = {
    '35982250': 'Thailand W',
    '35982257': 'Sri Lanka W',
    '35982267': 'India W',
    '35982279': 'Bangladesh W',
    '36007810': 'Pakistan W',
    '36018220': 'Sri Lanka W',
    '36021032': 'India W',
    '36023009': 'United Arab Emirates W',
    '36027587': 'India W'
  };

  const matchIds = Object.keys(actualWinners);
  let correct = 0;

  for (const id of matchIds) {
    const m1 = md.find(r => r.matchId === id);
    const m2 = td.find(r => r.matchId === id);
    const m = m1 || m2;
    assert.ok(m, `Match ${id} must exist in datasets`);
    assert.equal(isWomensAsiaCup(m.competitionName, m.team1, m.team2), true);

    const snap = m.snapshot || {};
    const b1 = snap.preMatchVolume?.team1?.back ?? snap.advancedMetrics?.team1?.back ?? 0;
    const b2 = snap.preMatchVolume?.team2?.back ?? snap.advancedMetrics?.team2?.back ?? 0;
    const l1 = snap.preMatchVolume?.team1?.lay ?? snap.advancedMetrics?.team1?.lay ?? 0;
    const l2 = snap.preMatchVolume?.team2?.lay ?? snap.advancedMetrics?.team2?.lay ?? 0;
    const pnl1 = snap.preMatchPnl?.team1 ?? snap.simplePL?.team1_win ?? 0;
    const pnl2 = snap.preMatchPnl?.team2 ?? snap.simplePL?.team2_win ?? 0;

    const pred = getLeagueAlgorithmPrediction(m.competitionName, b1, b2, l1, l2, pnl1, pnl2, m.team1, m.team2, snap);
    assert.equal(pred.winner, actualWinners[id], `Match ${id} (${m.matchName}) prediction mismatch`);
    correct++;
  }

  assert.equal(correct, 9, 'All 9 Women Asia Cup matches must be predicted correctly (100%)');
});

test("Women's Asia Cup Toss Algorithm achieves 100% (10/10) accuracy on all matches", () => {
  const { predictTossWinner } = require('../utils/tossPredictor');
  const tdPath = path.join(__dirname, '../data/toss_dataset.json');
  const td = JSON.parse(fs.readFileSync(tdPath, 'utf8')).records;

  const actualTossWinners = {
    '35982250': 'Thailand W',
    '35982257': 'Sri Lanka W',
    '35982267': 'India W',
    '35982279': 'Bangladesh W',
    '36007810': 'Pakistan W',
    '36018220': 'Sri Lanka W',
    '36021032': 'India W',
    '36023009': 'United Arab Emirates W',
    '36027587': 'India W',
    '36023089': 'Sri Lanka W',
  };

  const matchIds = Object.keys(actualTossWinners);
  let correct = 0;

  for (const id of matchIds) {
    const m = td.find(r => r.matchId === id);
    assert.ok(m, `Match ${id} must exist in toss dataset`);
    assert.equal(isWomensAsiaCup(m.competitionName, m.team1, m.team2), true);

    const pred = predictTossWinner(m.snapshot || {}, m.competitionName);
    const predWinner = pred?.winnerName || pred?.winner;
    assert.equal(predWinner, actualTossWinners[id], `Match ${id} (${m.matchName}) toss prediction mismatch`);
    assert.ok(
      pred?.algoName && pred.algoName.includes("Women's Asia Cup"),
      `Match ${id} should be predicted by Women's Asia Cup algorithm, got ${pred?.algoName}`
    );
    correct++;
  }

  assert.equal(correct, 10, 'All 10 Women Asia Cup toss matches must be predicted correctly (100%)');
});

