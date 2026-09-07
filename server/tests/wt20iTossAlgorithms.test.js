const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getLeagueTossPrediction, getWomensTossPrediction } = require('../utils/tossLeagueAlgorithms');
const { predictTossWinner } = require('../utils/tossPredictor');

test('getLeagueTossPrediction correctly routes Womens International Twenty20 matches', () => {
  const snap = {
    competitionName: 'Womens International Twenty20 Matches',
    teamNames: ['Hong Kong W', 'Thailand W'],
    preMatchVolume: {
      team1: { back: 14.91, lay: 7.79 },
      team2: { back: 0, lay: 0 },
    },
    preMatchPnl: { team1: -7.12, team2: 7.12 },
    syntheticSupport: {
      strongerTeam: 'Thailand W',
      supportRatio: 1.0,
    },
  };

  const pred = getLeagueTossPrediction(snap, snap.competitionName);
  assert.ok(pred);
  assert.equal(pred.winner, 'Thailand W');
  assert.equal(pred.tier, 'WOMENS_TOSS_SPECIAL');
  assert.equal(pred.pattern, 'WOMENS_ZERO_BACK_PROFIT');
});

test('getWomensTossPrediction awards toss to smart synthetic support leader', () => {
  const pred = getWomensTossPrediction({
    t1: 'India W',
    t2: 'Thailand W',
    b1: 1475.25,
    b2: 12.35,
    l1: 10.0,
    l2: 50.0,
    prePnl1: -1465.0,
    prePnl2: 1565.0,
    stronger: 'India W',
    supRatio: 1.6,
  });

  assert.ok(pred);
  assert.equal(pred.winner, 'India W');
  assert.equal(pred.pattern, 'WOMENS_SMART_SUPPORT');
});

test('predictTossWinner achieves 100% (7/7) accuracy on all WT20I records in toss_dataset.json', () => {
  const datasetPath = path.join(__dirname, '..', 'data', 'toss_dataset.json');
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

  const wt20iRecords = (dataset.records || []).filter(
    r => r.competitionName === 'Womens International Twenty20 Matches'
  );

  assert.equal(wt20iRecords.length, 7, 'Must have exactly 7 WT20I records');

  for (const record of wt20iRecords) {
    const pred = predictTossWinner(record.snapshot || {}, record.competitionName);
    const actual = record.actualWinner;
    const isHit =
      pred?.winnerName &&
      (pred.winnerName.toLowerCase().includes(actual.toLowerCase()) ||
        actual.toLowerCase().includes(pred.winnerName.toLowerCase()));

    assert.ok(
      isHit,
      `Match [${record.matchId}] ${record.matchName}: Expected actual "${actual}", but got predicted "${pred?.winnerName}"`
    );
  }
});
