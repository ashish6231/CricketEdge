const { captureTrackedLeague, matchFixture } = require('./trackedLeagueCapture');
const { snapshotMatchesRecord } = require('./trackedLeagueSnapshots');
const { getDefaultWomensSpringStore, summarizeWomensSpring } = require('./womensSpringStore');
const { isWomensSpringT20, springTeamKey, WOMENS_SPRING_LEAGUE } = require('../utils/womensSpringMatchPredictor.mjs');

const DEFAULT_SPRING_SERIES_URL = 'https://crex.com/series/t20-spring-challenge-2026-2LB/matches';
const configuredSpringSeriesUrls = () => [...new Set((process.env.SPRING_T20_SERIES_URLS || DEFAULT_SPRING_SERIES_URL)
  .split(',').map(url => url.trim()).filter(Boolean))];

async function captureWomensSpring(options = {}) {
  const store = options.store || getDefaultWomensSpringStore();
  await captureTrackedLeague({ ...options, store,
    seriesUrls: options.seriesUrls || configuredSpringSeriesUrls(),
    leagueName: WOMENS_SPRING_LEAGUE, isLeague: isWomensSpringT20, normalizeTeam: springTeamKey,
    summarize: summarizeWomensSpring, persistFixtures: true, preMatchOnly: false, marketKinds: ['match'] });
  const archive = options.archiveStore || require('./matchDatasetStore').getDefaultStore();
  const archived = (await archive.load()).records.filter(row => isWomensSpringT20(row.competitionName));
  // Results come from the series fixture's explicit winner ID, never from
  // model output or a guess based on scores. Keep issued predictions intact.
  return store.update(data => {
    for (const record of data.records) {
      // Import existing archived inputs once, preserving their original timing.
      // A post-start capture is evidence for replay, never an issued forecast.
      if (!record.markets?.match) {
        const previous = matchFixture(record, archived, springTeamKey);
        if (previous && snapshotMatchesRecord(previous.snapshot, record, springTeamKey)) {
          const beforeStart = previous.inputTiming === 'captured-before-start'
            && Date.parse(previous.capturedAt) < record.startTime;
          record.markets ||= {};
          record.markets.match = { marketMatchId: previous.matchId, snapshot: previous.snapshot,
            capturedAt: previous.capturedAt, inputTiming: previous.inputTiming,
            prediction: beforeStart && previous.predictedWinner ? { winner: previous.predictedWinner,
              capturedAt: previous.capturedAt, algorithmId: previous.algorithmId,
              reason: previous.predictionReason, predictorVersion: previous.predictorVersion } : null };
        }
      }
      if (record.resultVerification?.status === 'verified' || record.sourceProvider !== 'CREX') continue;
      let source;
      try { source = new URL(record.sourceUrl); } catch { continue; }
      if (source.protocol !== 'https:' || source.hostname !== 'crex.com') continue;
      const winner = [record.team1, record.team2].find(team =>
        record.reportedWinner && springTeamKey(team) === springTeamKey(record.reportedWinner));
      const noResult = ['completed', 'cancelled'].includes(record.status)
        && /\b(abandoned|no result|cancelled)\b/i.test(record.resultText || '');
      if (!(record.status === 'completed' && winner) && !noResult) continue;
      record.actualWinner = noResult ? 'No Result' : winner;
      record.resultVerification = { status: 'verified', source: 'CREX', sourceUrl: source.href,
        resultText: record.resultText, checkedAt: (options.now ? options.now() : new Date()).toISOString(),
        confirmedBy: 'spring-series-worker' };
    }
    return { ...summarizeWomensSpring(data), sync: data.sync };
  });
}
module.exports = { captureWomensSpring, configuredSpringSeriesUrls, DEFAULT_SPRING_SERIES_URL };
