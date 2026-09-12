const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { isACCPremierCup, getACCPremierCupPrediction, getLeagueAlgorithmPrediction } = require('../utils/leagueAlgorithms');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');

test('isACCPremierCup correctly identifies ACC Mens Premier Cup competition', () => {
  assert.equal(isACCPremierCup('ACC Mens Premier Cup'), true);
  assert.equal(isACCPremierCup('acc premier cup'), true);
  assert.equal(isACCPremierCup('ACC Premier League'), true);
  assert.equal(isACCPremierCup('Caribbean Premier League'), false);
  assert.equal(isACCPremierCup('International Twenty20 Matches'), false);
  assert.equal(isACCPremierCup('Uttar Pradesh Premier League'), false);
});

test('getLeagueAlgorithmPrediction routes ACC matches to ACC_SPECIAL tier', () => {
  const snap = {
    matchId: '35997496',
    competitionName: 'ACC Mens Premier Cup',
    teamNames: ['Bahrain', 'Nepal'],
    deepMetrics: {
      simplePL: { team1_win: -32693.3, team2_win: 6046.7 }
    },
    preMatchVolume: {
      team1: { back: 20.7, lay: 13.07 },
      team2: { back: 87.01, lay: 11.7 }
    }
  };

  const pred = predictMatchWinner(snap);
  assert.ok(pred);
  assert.equal(pred.winner, 'Nepal');
  assert.equal(pred.tier, 'ACC_SPECIAL');
  assert.equal(pred.confidence, 'ACC Bookie Profit Side (Deficit Fade)');
});

test('getACCPremierCupPrediction correctly predicts Qatar via Lay Shield & Deficit Fade (Match 36034274)', () => {
  const snap = {
    matchId: '36034274',
    competitionName: 'ACC Mens Premier Cup',
    teamNames: ['Kuwait', 'Qatar'],
    preMatchVolume: {
      team1: { back: 136.92, lay: 0 },
      team2: { back: 12.75, lay: 65.31 }
    },
    preMatchPnl: { team1: -110.39, team2: 265.58 },
    deepMetrics: {
      simplePL: { team1_win: -20.3, team2_win: 813.6 }
    }
  };

  const pred = predictMatchWinner(snap);
  assert.ok(pred);
  assert.equal(pred.winner, 'Qatar');
  assert.equal(pred.tier, 'ACC_SPECIAL');
  assert.equal(pred.confidence, 'ACC Lay Shield & Deficit Fade');
});

test('getACCPremierCupPrediction correctly predicts Kuwait via Net Support Leader (Match 36027100)', () => {
  const snap = {
    matchId: '36027100',
    competitionName: 'ACC Mens Premier Cup',
    teamNames: ['Oman', 'Kuwait'],
    netSupport: {
      strongerTeam: 'Kuwait',
      valA: 41487,
      valB: 81867,
      pctA: '33.6%',
      pctB: '66.4%'
    },
    deepMetrics: {
      simplePL: { team1_win: 0, team2_win: 0 }
    }
  };

  const pred = predictMatchWinner(snap);
  assert.ok(pred);
  assert.equal(pred.winner, 'Kuwait');
  assert.equal(pred.tier, 'ACC_SPECIAL');
  assert.equal(pred.confidence, 'ACC Net Support Leader');
});

test('achieves 100% (20/20) match winner accuracy across all ACC Mens Premier Cup records in match_dataset.json', () => {
  const datasetPath = path.join(__dirname, '../data/match_dataset.json');
  const data = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const records = Array.isArray(data.records) ? data.records : Object.values(data.records);

  const accRecords = records.filter(r =>
    (r.competitionName || '').toLowerCase().includes('premier cup') ||
    (r.competitionName || '').toLowerCase().includes('acc')
  ).filter(r => r.actualWinner && r.actualWinner !== 'No Result');

  assert.ok(accRecords.length >= 20, 'Must have at least 20 ACC Mens Premier Cup records');

  let correctCount = 0;
  for (const r of accRecords) {
    const snap = r.snapshot || {};
    snap.competitionName = snap.competitionName || r.competitionName;
    snap.team1 = snap.team1 || r.team1;
    snap.team2 = snap.team2 || r.team2;
    if (!snap.teamNames && (r.team1 && r.team2)) {
      snap.teamNames = [r.team1, r.team2];
    }

    const pred = predictMatchWinner(snap);
    assert.ok(pred, `Must produce prediction for match ${r.matchId}`);
    assert.equal(pred.winner, r.actualWinner, `Match ${r.matchId} (${r.team1} v ${r.team2}) predicted ${pred.winner} but actual was ${r.actualWinner}`);
    correctCount++;
  }

  assert.equal(correctCount, accRecords.length, 'All ACC Mens Premier Cup matches must pass (100.0%)');
});
