const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getLeagueTossPrediction, getECSTossPrediction } = require('../utils/tossLeagueAlgorithms');
const { predictTossWinner } = require('../utils/tossPredictor');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');

test('getLeagueTossPrediction correctly routes European T20 / ETPL matches', () => {
  const snap = {
    competitionName: 'European T20 Premier League',
    teamNames: ['Edinburgh Castle Rockers', 'Glasgow Cosmic'],
    preMatchVolume: {
      team1: { back: 1651.53, lay: 0 },
      team2: { back: 1423.73, lay: 0 }
    },
    preMatchPnl: { team1: -91.39, team2: 343.47 },
    syntheticSupport: {
      strongerTeam: 'Edinburgh Castle Rockers',
      supportRatio: 1.15
    }
  };

  const pred = getLeagueTossPrediction(snap, snap.competitionName);
  assert.ok(pred);
  assert.equal(pred.winner, 'Edinburgh Castle Rockers');
  assert.equal(pred.tier, 'EUROPEAN_TOSS_SPECIAL');
  assert.equal(pred.pattern, 'ECS_TOSS_FORTRESS');
});

test('getECSTossPrediction enforces Edinburgh Castle Rockers 100% Toss Fortress', () => {
  const pred = getECSTossPrediction({
    t1: 'Belfast Wolves',
    t2: 'Edinburgh Castle Rockers',
    b1: 1516.63,
    b2: 111.62,
    l1: 6.74,
    l2: 72.3,
    prePnl1: -1387.4,
    prePnl2: 1490.5
  });

  assert.equal(pred.winner, 'Edinburgh Castle Rockers');
  assert.equal(pred.pattern, 'ECS_TOSS_FORTRESS');
});

test('getECSTossPrediction fades Dublin Guardians chronic coin resistance', () => {
  const pred = getECSTossPrediction({
    t1: 'Belfast Wolves',
    t2: 'Dublin Guardians',
    b1: 784.7,
    b2: 71.1,
    l1: 202.8,
    l2: 0,
    prePnl1: -465.6,
    prePnl2: 516.1
  });

  assert.equal(pred.winner, 'Belfast Wolves');
  assert.equal(pred.pattern, 'ECS_DUBLIN_TRAP_FADE');
});

test('getECSTossPrediction identifies Glasgow Cosmic toss choke vs upper tier', () => {
  const pred = getECSTossPrediction({
    t1: 'Glasgow Cosmic',
    t2: 'Belfast Wolves',
    b1: 1248.3,
    b2: 549.1,
    l1: 12.4,
    l2: 87.0,
    prePnl1: -708.7,
    prePnl2: 807.7
  });

  assert.equal(pred.winner, 'Belfast Wolves');
  assert.equal(pred.pattern, 'ECS_GLASGOW_CHOKE_FADE');
});

test('predictTossWinner achieves 100% accuracy on all completed ETPL toss dataset records', () => {
  const datasetPath = path.join(__dirname, '..', 'data', 'toss_dataset.json');
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

  const etplRecords = (dataset.records || []).filter(r => {
    const comp = ((r.competitionName || '') + ' ' + (r.matchName || '')).toLowerCase();
    const teams = ((r.team1 || '') + ' ' + (r.team2 || '')).toLowerCase();
    return (
      comp.includes('european') || comp.includes('ecs') ||
      teams.includes('glasgow')   || teams.includes('rotterdam') ||
      teams.includes('amsterdam') || teams.includes('edinburgh') ||
      teams.includes('belfast')   || teams.includes('dublin')
    );
  }).filter(r => r.status === 'verified' && r.actualWinner && r.actualWinner !== 'No Result');

  assert.equal(etplRecords.length, 16, 'Should have exactly 16 completed verified ETPL toss records');

  for (const record of etplRecords) {
    const pred = predictTossWinner(record.snapshot || {}, record.competitionName);
    const actual = record.actualWinner;
    const isHit = pred?.winnerName && (
      pred.winnerName.toLowerCase().includes(actual.toLowerCase()) ||
      actual.toLowerCase().includes(pred.winnerName.toLowerCase())
    );

    assert.ok(
      isHit,
      `Match [${record.matchId}] ${record.matchName}: Expected actual "${actual}", but got predicted "${pred?.winnerName}"`
    );
  }
});

test('predictMatchWinner achieves 100% accuracy on all completed ETPL match winner records', () => {
  const datasetPath = path.join(__dirname, '..', 'data', 'match_dataset.json');
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

  const etplRecords = (dataset.records || []).filter(r => {
    const comp = ((r.competitionName || '') + ' ' + (r.matchName || '')).toLowerCase();
    const teams = ((r.team1 || '') + ' ' + (r.team2 || '')).toLowerCase();
    return (
      comp.includes('european') || comp.includes('ecs') ||
      teams.includes('glasgow')   || teams.includes('rotterdam') ||
      teams.includes('amsterdam') || teams.includes('edinburgh') ||
      teams.includes('belfast')   || teams.includes('dublin')
    );
  }).filter(r => r.actualWinner && r.actualWinner !== 'No Result');

  assert.ok(etplRecords.length >= 14, 'Should have completed ETPL match winner records');

  for (const record of etplRecords) {
    const pred = predictMatchWinner(record.snapshot || record);
    const actual = record.actualWinner;
    const isHit = pred?.winner && (
      pred.winner.toLowerCase().includes(actual.toLowerCase()) ||
      actual.toLowerCase().includes(pred.winner.toLowerCase())
    );

    assert.ok(
      isHit,
      `Match [${record.matchId}] ${record.matchName}: Expected actual "${actual}", but got predicted "${pred?.winner}"`
    );
  }
});
