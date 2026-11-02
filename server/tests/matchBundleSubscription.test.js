const test = require('node:test');
const assert = require('node:assert/strict');
function stub(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
let cricketStatus = 'live', tossStatus = 'live', tennisStatus = 'live';
const info = status => ({ matchId: 'access-test', matchName: 'A v B', status });
const snapshot = () => ({ teamNames: ['A', 'B'], teams: {} });
stub('../services/dataCache', {
  getCricketMatches: () => [info(cricketStatus)],
  getTossMatches: () => [info(tossStatus)],
  getTennisMatches: () => [info(tennisStatus)],
  getCricketSnapshot: async () => snapshot(),
  getTossSnapshot: async () => snapshot(),
  getTennisSnapshot: async () => snapshot(),
  getSessionTrades: async () => ({ trades: [] }),
  getCrexDetail: () => ({ scorecard: {} }),
});
stub('../services/providerTotalStore', { getDefaultProviderTotalStore: () => ({ attach: async value => value }) });
stub('../services/crexService', {});
stub('../services/tossDatasetStore', { getDefaultStore: () => ({ load: async () => ({ records: [] }) }) });
stub('../services/matchDatasetStore', { getDefaultStore: () => ({ load: async () => ({ records: [] }) }) });
stub('../utils/matchWinnerPredictor', { predictMatchWinner: () => null });
const { getMatchBundlePayload } = require('../services/matchPayloadService');
const user = plan => ({ role: 'user', subPlanSlug: plan, subStatus: 'active', subExpiresAt: '2099-01-01' });

test('live bundles enforce Lite and Pro permissions', async () => {
  for (const sport of ['cricket', 'toss', 'session']) {
    assert.equal((await getMatchBundlePayload('access-test', user('free'), sport)).code, 'SUBSCRIPTION_REQUIRED');
    assert.ok((await getMatchBundlePayload('access-test', user('lite'), sport)).cricket);
  }
  assert.equal((await getMatchBundlePayload('access-test', user('lite'), 'tennis')).code, 'SUBSCRIPTION_REQUIRED');
  assert.ok((await getMatchBundlePayload('access-test', user('pro'), 'tennis')).cricket);
});

test('a completed toss does not unlock a live cricket match or its session data', async () => {
  tossStatus = 'completed';
  assert.equal((await getMatchBundlePayload('access-test', user('free'), 'cricket')).code, 'SUBSCRIPTION_REQUIRED');
  assert.equal((await getMatchBundlePayload('access-test', null, 'cricket')).error, 'login_required');
  const toss = await getMatchBundlePayload('access-test', null, 'toss');
  assert.ok(toss.toss);
  assert.equal(toss.cricket, null);
  assert.equal(toss.session, null);
  assert.equal(toss.crex, null);
});

test('completed cricket and tennis details stay available to guests and non-subscribers', async () => {
  cricketStatus = tennisStatus = 'completed';
  for (const viewer of [null, user('free'), user('lite')]) {
    assert.ok((await getMatchBundlePayload('access-test', viewer, 'cricket')).cricket);
    assert.ok((await getMatchBundlePayload('access-test', viewer, 'tennis')).cricket);
  }
});
