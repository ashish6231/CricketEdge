const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { predictMatchWinner, DEFAULT_MATCH_MODE } = require('../utils/matchWinnerPredictor');
const { LEAGUE_MATCH_ALGORITHMS, getLeagueMatchAlgorithm } = require('../utils/normalLeagueMatchPredictor.mjs');
const records = JSON.parse(fs.readFileSync(require.resolve('../data/match_dataset.json'))).records;
const snapshot = {
  teamNames: ['India W', 'Sri Lanka W'],
  preMatchVolume: { team1: {back: 100, lay: 30}, team2: {back: 20, lay: 5} },
  preMatchPnl: {team1: -40, team2: 40},
};

test('normal is the default and does not load the experimental fitted model', () => {
  const prediction = predictMatchWinner(snapshot);
  assert.equal(DEFAULT_MATCH_MODE, 'rules');
  assert.equal(prediction.mode, 'rules');
  assert.equal(prediction.modelScope, 'rules');
  assert.equal(require.cache[require.resolve('../utils/matchLeagueModel.js')], undefined);
});

test('every saved league has a separate algorithm ID and independent parameter object', () => {
  assert.equal(LEAGUE_MATCH_ALGORITHMS.length, 42);
  assert.equal(new Set(LEAGUE_MATCH_ALGORITHMS.map(a => a.algorithmId)).size, 42);
  assert.equal(new Set(LEAGUE_MATCH_ALGORITHMS.map(a => a.parameters)).size, 42);
  for (const record of records) {
    const algorithm = getLeagueMatchAlgorithm(record.competitionName);
    assert.ok(algorithm, `Unregistered league: ${record.competitionName}`);
    const prediction = predictMatchWinner({...record.snapshot, competitionName: record.competitionName});
    if (prediction) {
      assert.equal(prediction.algorithmId, algorithm.algorithmId);
      assert.equal(prediction.algorithmLeague, algorithm.league);
      assert.equal(prediction.leagueRegistered, true);
      assert.equal(prediction.mode, 'rules');
    }
  }
});

test('explicit women league metadata takes priority over team nationality', () => {
  const international = predictMatchWinner({...snapshot, competitionName: 'Womens International Twenty20 Matches'});
  const asia = predictMatchWinner({...snapshot, competitionName: "Women's Asia Cup T20"});
  assert.equal(international.tier, 'WOMENS_T20_SPECIAL');
  assert.match(asia.tier, /^WOMENS_ASIA_CUP/);
  assert.notEqual(international.algorithmId, asia.algorithmId);
});

test('known aliases resolve to their league and unknown leagues disclose fallback', () => {
  assert.equal(getLeagueMatchAlgorithm('ACC Mens Premier Cup'), getLeagueMatchAlgorithm("ACC Men's Premier Cup"));
  assert.equal(getLeagueMatchAlgorithm('CPL').league, 'Caribbean Premier League');
  const prediction = predictMatchWinner({...snapshot, competitionName: 'New Unregistered League'});
  assert.equal(prediction.leagueRegistered, false);
  assert.equal(prediction.algorithmId, 'match-unregistered-league-fallback');
});
