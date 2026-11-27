const test = require('node:test');
const assert = require('node:assert/strict');
const { predictTossWinner, getLeagueTossPrediction } = require('../utils/tossPredictor');
const { getLeagueTossPrediction: dispatch } = require('../utils/tossLeagueAlgorithms');
const { getPeakTradedOdd, getTossRuleInputs, selectTossWinner } = require('../utils/universalTossAlgorithm.mjs');
const { getDirectProviderBookiePl } = require('../utils/bookiePl.mjs');

const fixture = () => ({
  teamNames: ['Dubai Capitals', 'Desert Vipers'],
  deepMetrics: { totals: { team1: 100, team2: 300 } },
  teams: {
    'Dubai Capitals': {
      pnlIfWins: -633.67,
      trades: [
        { type: 'back', price: 1.96, size: 518.13 },
        { type: 'lay', price: 1.98, size: 15.15 },
        { type: 'back', price: 1.99, size: 404.74 },
        { type: 'back', price: 2.0, size: 28.22 },
        { type: 'lay', price: 2.0, size: 5.03 },
        { type: 'lay', price: 2.04, size: 220.67 },
      ],
    },
    'Desert Vipers': {
      pnlIfWins: 694.02,
      trades: [
        { type: 'back', price: 1.96, size: 261.51 },
        { type: 'back', price: 1.99, size: 127.25 },
        { type: 'back', price: 2.0, size: 33.24 },
        { type: 'lay', price: 2.04, size: 381.62 },
      ],
    },
  },
});

test('getPeakTradedOdd aggregates back + lay per price and selects the highest traded odd', () => {
  const peak1 = getPeakTradedOdd(fixture().teams['Dubai Capitals'].trades);
  const peak2 = getPeakTradedOdd(fixture().teams['Desert Vipers'].trades);
  assert.deepEqual(peak1, { price: 1.96, traded: 518.13 });
  assert.deepEqual(peak2, { price: 2.04, traded: 381.62 });

  const combined = getPeakTradedOdd([
    { type: 'back', price: 2.0, size: 60 },
    { type: 'lay', price: 2.0, size: 50 },
    { type: 'back', price: 1.96, size: 90 },
  ]);
  assert.deepEqual(combined, { price: 2.0, traded: 110 });
});

test('selectTossWinner predicts the team with a positive and higher Bookie P/L', () => {
  const pick = selectTossWinner({
    teamNames: ['Dubai Capitals', 'Desert Vipers'],
    pl: [-633.67, 694.02],
  });
  assert.equal(pick.winner, 'Desert Vipers');
  assert.equal(pick.winnerIdx, 1);

  // Both positive -> higher positive P/L wins
  const bothPos = selectTossWinner({
    teamNames: ['Alpha', 'Beta'],
    pl: [49.02, 4.26],
  });
  assert.equal(bothPos.winner, 'Alpha');
  assert.equal(bothPos.winnerIdx, 0);

  // Neither positive, equal, or missing -> abstain
  assert.equal(selectTossWinner({ teamNames: ['Alpha', 'Beta'], pl: [-10, -5] }), null);
  assert.equal(selectTossWinner({ teamNames: ['Alpha', 'Beta'], pl: [0, -5] }), null);
  assert.equal(selectTossWinner({ teamNames: ['Alpha', 'Beta'], pl: [100, 100] }), null);
  assert.equal(selectTossWinner({ teamNames: ['Alpha', 'Beta'], pl: [null, 100] }), null);
});

test('all league entry points apply higher positive Bookie P/L uniformly', () => {
  const { LEAGUE_MATCH_ALGORITHMS } = require('../utils/normalLeagueMatchPredictor.mjs');
  for (const name of [...LEAGUE_MATCH_ALGORITHMS.map(profile => profile.league), 'WBBL', 'WODI', 'Unknown League', '']) {
    const snapshot = { ...fixture(), competitionName: name };
    const inputs = getTossRuleInputs(snapshot, name);
    for (const fn of [predictTossWinner, getLeagueTossPrediction, dispatch]) {
      const result = fn(snapshot, name);
      assert.equal(result.winner || result.winnerName, 'Desert Vipers', name);
      assert.equal(result.predictorVersion, inputs.rule.predictorVersion);
      assert.equal(result.activeSignals, 1);
      assert.equal(result.algorithmEvidence.requirePositivePl, true);
      assert.equal(result.algorithmEvidence.inputSource, 'toss-current-display');
    }
  }
});

test('missing, equal, non-positive or invalid values abstain instead of guessing', () => {
  const changes = [
    { teams: undefined },
    { teams: { 'Dubai Capitals': { trades: [] }, 'Desert Vipers': { trades: [] } } },
    { teams: { 'Dubai Capitals': { trades: [{ type: 'back', size: 10, price: 1 }] }, 'Desert Vipers': { trades: [{ type: 'back', size: 10, price: 2 }] } } },
    { teams: { 'Dubai Capitals': { pnlIfWins: -10, trades: [] }, 'Desert Vipers': { pnlIfWins: -5, trades: [] } } },
    { teams: { 'Dubai Capitals': { pnlIfWins: 50, trades: [] }, 'Desert Vipers': { pnlIfWins: 50, trades: [] } } },
    { teamNames: ['Alpha', ' alpha '] },
    { error: 'feed failed' },
  ];
  for (const change of changes) {
    const snapshot = { ...fixture(), ...change };
    assert.equal(predictTossWinner(snapshot, 'International League T20'), null);
    assert.equal(dispatch(snapshot, 'WBBL').abstain, true);
  }
});

test('frontend and backend share the exact Bookie P/L toss prediction', async () => {
  const frontend = await import('../../frontend/src/utils/tossPredictor.js');
  const bookie = await import('../../frontend/src/utils/bookiePl.js');
  assert.deepEqual(frontend.predictTossWinner(fixture()), predictTossWinner(fixture()));
  for (const record of require('../data/toss_dataset.json').records) {
    const inputs = getTossRuleInputs(record.snapshot);
    const pl = bookie.getDirectProviderBookiePl(record.snapshot, ...record.snapshot.teamNames);
    assert.deepEqual(inputs.pl, [pl.pl1, pl.pl2]);
    const pick = inputs.available ? selectTossWinner(inputs) : null;
    assert.equal(predictTossWinner(record.snapshot, record.competitionName)?.winnerName ?? null, pick?.winner ?? null, record.matchId);
  }
});
