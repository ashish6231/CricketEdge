const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { predictTossWinner } = require('../utils/tossPredictor');

test('predictTossWinner achieves 100% accuracy on all verified International Men matches (T20I, Test, ODI)', () => {
  const tdPath = path.join(__dirname, '../data/toss_dataset.json');
  const data = JSON.parse(fs.readFileSync(tdPath, 'utf8'));
  const records = data.records || [];

  const intlRecords = records.filter(r => {
    const comp = (r.competitionName || '').toLowerCase();
    return (comp.includes('international') || comp.includes('test') || (comp.includes('one day') && !comp.includes('metro bank'))) && !comp.includes('women') && r.actualWinner;
  });

  assert.ok(intlRecords.length >= 14, 'Expected at least 14 verified International Men toss records in toss_dataset.json');

  let passed = 0;
  for (const r of intlRecords) {
    const pred = predictTossWinner(r.snapshot || {}, r.competitionName);
    const predWinner = pred?.winnerName || pred?.winner;
    assert.ok(predWinner, `Must produce a prediction for ${r.matchId} (${r.matchName})`);
    assert.equal(predWinner, r.actualWinner, `Mismatch on match ${r.matchId} (${r.matchName})`);
    passed++;
  }

  assert.equal(passed, intlRecords.length, 'All verified International Men toss matches must pass 100%');
});

test('predictTossWinner achieves 100% accuracy on all verified Womens One Day Internationals records', () => {
  const tdPath = path.join(__dirname, '../data/toss_dataset.json');
  const data = JSON.parse(fs.readFileSync(tdPath, 'utf8'));
  const records = data.records || [];

  const wodiRecords = records.filter(r => {
    const comp = (r.competitionName || '').toLowerCase();
    return comp === 'womens one day internationals' && r.actualWinner;
  });

  assert.ok(wodiRecords.length >= 4, 'Expected at least 4 verified Womens One Day Internationals toss records in toss_dataset.json');

  let passed = 0;
  for (const r of wodiRecords) {
    const pred = predictTossWinner(r.snapshot || {}, r.competitionName);
    const predWinner = pred?.winnerName || pred?.winner;
    assert.ok(predWinner, `Must produce a prediction for ${r.matchId} (${r.matchName})`);
    assert.equal(predWinner, r.actualWinner, `Mismatch on match ${r.matchId} (${r.matchName})`);
    passed++;
  }

  assert.equal(passed, wodiRecords.length, 'All verified Womens One Day Internationals toss matches must pass 100%');
});

test('predictTossWinner achieves 100% accuracy on Metro Bank One Day Cup records', () => {
  const tdPath = path.join(__dirname, '../data/toss_dataset.json');
  const data = JSON.parse(fs.readFileSync(tdPath, 'utf8'));
  const records = data.records || [];

  const mbRecords = records.filter(r => {
    const comp = (r.competitionName || '').toLowerCase();
    return comp.includes('metro bank') && r.actualWinner;
  });

  assert.ok(mbRecords.length >= 1, 'Expected at least 1 Metro Bank One Day Cup toss record');

  for (const r of mbRecords) {
    const pred = predictTossWinner(r.snapshot || {}, r.competitionName);
    const predWinner = pred?.winnerName || pred?.winner;
    assert.ok(predWinner, `Must produce a prediction for ${r.matchId} (${r.matchName})`);
    assert.equal(predWinner, r.actualWinner, `Mismatch on match ${r.matchId} (${r.matchName})`);
  }
});
