const test = require('node:test');
const assert = require('node:assert/strict');
const { filterMatchesForViewer, guestMayViewMatch, guestMayViewFromInfos } = require('../lib/guestMatchAccess');

test('guest list includes live and ended matches', () => {
  const all = [
    { matchId: '1', status: 'ended' },
    { matchId: '2', status: 'open' },
    { matchId: '3', inPlay: true, status: 'suspended' },
  ];
  assert.deepEqual(filterMatchesForViewer(all, null).map((m) => m.matchId), ['1', '2', '3']);
});

test('logged-in user gets full list', () => {
  const all = [{ matchId: '1', status: 'ended' }, { matchId: '2', status: 'open' }];
  assert.equal(filterMatchesForViewer(all, { userId: 1 }).length, 2);
});

test('guestMayViewMatch — ended free, live needs login', () => {
  assert.equal(guestMayViewMatch({ status: 'ended' }, null), true);
  assert.equal(guestMayViewMatch({ status: 'open' }, null), false);
  assert.equal(guestMayViewMatch({ status: 'open' }, { userId: 1 }), true);
});

test('guestMayViewFromInfos — allow if cricket or toss market ended', () => {
  assert.equal(guestMayViewFromInfos(null, [{ status: 'open' }, { status: 'ended' }]), true);
  assert.equal(guestMayViewFromInfos(null, [{ status: 'open' }, null]), false);
  assert.equal(guestMayViewFromInfos({ userId: 1 }, [{ status: 'open' }]), true);
});
