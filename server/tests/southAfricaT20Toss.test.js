const test = require('node:test');
const assert = require('node:assert/strict');
const {predictTossWinner,getLeagueTossPrediction} = require('../utils/tossPredictor');
const {getLeagueTossPrediction:dispatch} = require('../utils/tossLeagueAlgorithms');
const {UNIVERSAL_TOSS_VERSION,getTossRuleInputs,selectTossWinner} = require('../utils/universalTossAlgorithm.mjs');
const input = () => ({teamNames:['Alpha','Beta'],deepMetrics:{totals:{team1:100,team2:300}},
  teams:{Alpha:{trades:[{type:'back',price:2,size:1},{type:'lay',price:2,size:1}]},Beta:{trades:[{type:'back',price:2,size:20},{type:'lay',price:2,size:1}]}}});
const league = 'South Africa T20 Challenge';

test('South Africa T20 now uses lower complete exposure, regardless of provider totals', () => {
  for (const fn of [predictTossWinner,getLeagueTossPrediction,dispatch]) {
    for (const name of [league,'South Africa T20 Challenge 2026','South African T20 Challenge','South Africa T20','SA20']) {
      const result = fn(input(),name);
      assert.equal(result.winnerName,'Alpha');
      assert.equal(result.predictorVersion,UNIVERSAL_TOSS_VERSION);
      assert.equal(result.usedFallback,false);
      assert.equal(result.algorithmEvidence.requirePositivePl,false);
      assert.equal(fn({...input(),deepMetrics:undefined},name).winnerName,'Alpha');
      assert.equal(fn({...input(),teams:undefined},name)?.winnerName ?? null,null);
    }
  }
});

test('saved South Africa T20 replay follows the lower exposure rule in frontend and backend', async () => {
  const {predictTossWinner:frontend} = await import('../../frontend/src/utils/tossPredictor.js');
  const rows = require('../data/toss_dataset.json').records.filter(record => record.competitionName === league);
  assert.ok(rows.length > 0);
  for (const record of rows) {
    const inputs = getTossRuleInputs(record.snapshot,record.competitionName);
    const expected = inputs.available ? selectTossWinner(inputs)?.winner ?? null : null;
    assert.equal(frontend(record.snapshot,record.competitionName)?.winnerName ?? null,expected,record.matchId);
    assert.equal(predictTossWinner(record.snapshot,record.competitionName)?.winnerName ?? null,expected,record.matchId);
  }
});
