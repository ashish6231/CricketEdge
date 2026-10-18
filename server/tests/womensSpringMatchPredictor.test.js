const test = require('node:test');
const assert = require('node:assert/strict');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { getLeagueMatchAlgorithm, predictLeagueTrainingFit, predictFrozenLeagueBase, predictFrozenLeagueRules } = require('../utils/normalLeagueMatchPredictor.mjs');
const { isWomensSpringT20, WOMENS_SPRING_LEAGUE, freezeSpringProviderTotals, getSpringPreMatchProviderTotals } = require('../utils/womensSpringMatchPredictor.mjs');
const snapshot = { competitionName: WOMENS_SPRING_LEAGUE, teamNames: ['Hobart Hurricanes W', 'ACT Meteors W'],
  preMatchTotalBets: { team1: 100, team2: 400 } };

test('Spring aliases select the single lower-provider-total rule without volume requirements', () => {
  const spring = getLeagueMatchAlgorithm(WOMENS_SPRING_LEAGUE);
  assert.ok(Object.isFrozen(spring.profile));
  assert.match(spring.profile.profileVersion, /lower-prematch-provider-total-v3$/);
  for (const name of [WOMENS_SPRING_LEAGUE, 'Women’s T20 Spring Challenge 2026', 'Womens Spring T20', 'Women Spring Twenty20 Challenge']) {
    const result = predictMatchWinner({ ...snapshot, competitionName: name });
    assert.equal(result.winner, snapshot.teamNames[0]);
    assert.equal(result.algorithmId, spring.algorithmId);
    assert.equal(result.tier, 'WOMENS_MATCH_LOWER_PREMATCH_PROVIDER_TOTAL');
    assert.equal(result.confidenceCalibrated, false);
    assert.equal(result.providerTotalEvidence.signalCount, 1);
  }
  for (const name of ['WBBL', 'WNCL', "Women's Asia Cup T20", 'Spring T20 Men', '']) assert.equal(isWomensSpringT20(name), false);
  assert.equal(predictLeagueTrainingFit(snapshot), null);
});

test('lower pre-match activity alone decides both sides, including zero; ties and malformed totals abstain', () => {
  const predict = totals => predictMatchWinner({ ...snapshot, preMatchTotalBets: totals });
  assert.equal(predict({ team1: 400, team2: 100 }).winnerIdx, 1);
  assert.equal(predict({ team1: 0, team2: 100 }).winnerIdx, 0);
  assert.equal(predict({ team1: '100', team2: '400' }).winnerIdx, 0);
  for (const totals of [{team1:100,team2:100},{team1:0,team2:0},{team1:100},
    {team1:null,team2:100},{team1:'',team2:100},{team1:-1,team2:100},{team1:NaN,team2:100},{team1:Infinity,team2:100}]) assert.equal(predict(totals), null);
});

test('missing pre-match totals cannot fall back to current totals, live activity or other signals', () => {
  const input = { ...snapshot, preMatchTotalBets: undefined, status: 'live',
    inPlayTotalBets: {team1:10,team2:500}, deepMetrics: { totals: {totalBetTeam1:10,totalBetTeam2:500} },
    preMatchVolume: { team1: {back:10,lay:10},team2:{back:50,lay:100} }, preMatchPnl:{team1:10,team2:-50} };
  for (const predict of [predictMatchWinner,predictFrozenLeagueBase,predictFrozenLeagueRules]) assert.equal(predict(input), null);
});

test('trap, P/L, support, provider totals and outcomes never override pre-match activity; swapping slots preserves the winner', () => {
  const before = structuredClone(snapshot);
  const base = predictMatchWinner(snapshot);
  assert.deepEqual(predictMatchWinner({ ...snapshot, actualWinner:snapshot.teamNames[1],
    preMatchPnl:{team1:-99999,team2:99999},preMatchProviderTotals:{team1:99999,team2:0},
    preMatchVolume:{team1:{back:1,lay:0},team2:{back:99999,lay:99999}},
    marketSignals:{prediction:{pattern:'The Market Trap',prediction:snapshot.teamNames[1]}},
    syntheticSupport:{strongerTeam:snapshot.teamNames[1],supportRatio:999} }), base);
  const swapped = predictMatchWinner({...snapshot,teamNames:[...snapshot.teamNames].reverse(),preMatchTotalBets:{team1:400,team2:100}});
  assert.equal(swapped.winner,base.winner);
  assert.equal(swapped.winnerIdx,1);
  assert.deepEqual(snapshot,before);
});

test('timed pre-start provider totals freeze and stay stable through the chase, including reversed team order', () => {
  const pre = { ...snapshot, preMatchTotalBets:undefined,preMatchProviderTotals:undefined,startTime:'2026-10-18T10:00:00Z',
    capturedAt:'2026-10-18T09:59:00Z',deepMetrics:{totals:{totalBetTeam1:100,totalBetTeam2:400}},status:'upcoming' };
  const frozen = freezeSpringProviderTotals(pre);
  assert.deepEqual(frozen.preMatchProviderTotals,{team1:100,team2:400});
  const live = { ...pre,status:'live',inPlay:true,capturedAt:'2026-10-18T10:30:00Z',deepMetrics:{totals:{totalBetTeam1:9000,totalBetTeam2:2000}} };
  assert.equal(getSpringPreMatchProviderTotals(live),null);
  assert.deepEqual(freezeSpringProviderTotals(live,frozen).preMatchProviderTotals,{team1:100,team2:400});
  const reversed = freezeSpringProviderTotals({...live,teamNames:[...live.teamNames].reverse()},frozen);
  assert.deepEqual(reversed.preMatchProviderTotals,{team1:400,team2:100});
  assert.equal(getSpringPreMatchProviderTotals(reversed)[1],100);
  for(const patch of [{capturedAt:undefined},{capturedAt:pre.startTime},{capturedAt:'2026-10-18T10:01:00Z'},
    {serverTime:'2026-10-18T10:01:00Z'},{inPlay:true},{status:'completed'}]) assert.equal(getSpringPreMatchProviderTotals({...pre,...patch}),null);
  assert.equal(getSpringPreMatchProviderTotals(freezeSpringProviderTotals({...live,startTime:'2026-10-19T10:00:00Z'},frozen)),null);
});

test('frontend uses the same rule and invalidates old profile locks', async () => {
  const { predictMatchStart, lockMatchStartPrediction } = await import('../../frontend/src/utils/matchStartPredictor.js');
  const current = predictMatchStart(snapshot);
  assert.equal(current.winnerName,predictMatchWinner(snapshot).winner);
  assert.equal(current.signals.length,1);
  assert.equal(current.signals[0].label,'Pre-match provider total');
  const old = {...current,profileVersion:'spring-t20-trap-support-v2',winnerName:snapshot.teamNames[1]};
  assert.equal(lockMatchStartPrediction(current,old).winnerName,current.winnerName);
});

test('backtest deduplicates aliases, excludes live-only inputs and no-results', () => {
  const { backtestSpringReportedActivity } = require('../scripts/backtest_spring_reported_activity');
  const startTime = Date.parse('2026-10-18T10:00:00Z');
  const record = { ...snapshot, team1:snapshot.teamNames[0],team2:snapshot.teamNames[1],
    matchId:'one',startTime,status:'verified',actualWinner:snapshot.teamNames[0],resultVerification:{status:'verified'},
    snapshot, capturedAt:'2026-10-18T09:59:00Z' };
  const alias = { ...record, team1:'Hobart Hurricanes Women',team2:'ACT Meteors Women',recordId:'crex:one',matchId:undefined };
  const late = { ...record, matchId:'late',startTime:startTime+86400000,
    capturedAt:'2026-10-19T10:01:00Z',snapshot:{...snapshot,preMatchTotalBets:undefined,status:'live',
      serverTime:'2026-10-19T10:01:00Z',deepMetrics:{totals:{team1:100,team2:400}}} };
  const noResult = {...record,matchId:'abandoned',startTime:startTime+172800000,actualWinner:'No Result'};
  const result = backtestSpringReportedActivity([record,alias,late,noResult].map(record=>({record})));
  assert.equal(result.summary.fixtures,3);
  assert.equal(result.summary.scored,1);
  assert.equal(result.summary.passed,1);
  assert.equal(result.summary.missingPrematchActivity,1);
  assert.equal(result.summary.noResult,1);
});
