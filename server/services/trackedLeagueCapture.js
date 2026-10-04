const { getCrexSeriesMatches } = require('./crexService');
const { checkPreMatchDataQuality } = require('../utils/preMatchDataQuality.mjs');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { teamKey, pruneTrackedLeagueSnapshots } = require('./trackedLeagueSnapshots');

const fixtureKeys = ['recordId','crexMatchId','seriesId','competitionName','matchNumber','matchName',
  'team1','team2','team1Short','team2Short','startTime','status','score1','score2','resultText',
  'reportedWinner','sourceUrl','sourceProvider','sourceFixture','statusSource'];
const fixtureMetadata = record => Object.fromEntries(fixtureKeys.filter(key => Object.hasOwn(record,key)).map(key => [key,record[key]]));
function timestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  const result = Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : Date.parse(value);
  return Number.isFinite(result) && result > 0 ? result : null;
}
function teamsOf(match) {
  if (match.team1 && match.team2) return [match.team1, match.team2];
  return String(match.matchName || match.name || '').split(/\s+v(?:s)?\.?\s+/i).slice(0, 2);
}
function matchFixture(match, fixtures, normalizeTeam = teamKey) {
  const time = timestamp(match.startTime || match.openDate || match.marketStartTime);
  const names = teamsOf(match).map(normalizeTeam).sort();
  if (!time || names.length !== 2 || names.some(s => !s)) return null;
  const candidates = fixtures.filter(f => Math.abs(f.startTime - time) <= 10 * 60000 &&
    [normalizeTeam(f.team1), normalizeTeam(f.team2)].sort().every((name, i) => name === names[i]));
  // Multiple same-team fixtures at one time are never resolved by a guess.
  return candidates.length === 1 ? candidates[0] : null;
}
function feedFixture(match, leagueName, normalizeTeam) {
  const id = match.matchId || match.id;
  const startTime = timestamp(match.startTime || match.openDate || match.marketStartTime);
  const [team1, team2] = teamsOf(match);
  if (!id || !startTime || !team1 || !team2 || normalizeTeam(team1) === normalizeTeam(team2)) return null;
  const status = String(match.status || '').toLowerCase();
  return { recordId: `market:${id}`, competitionName: leagueName, matchName: `${team1} v ${team2}`,
    team1, team2, startTime, status: ['ended','completed','closed'].includes(status) ? 'completed' : match.inPlay || ['live','in-play'].includes(status) ? 'live' : 'upcoming',
    sourceProvider: 'market-feed', sourceUrl: null, sourceFixture: match };
}

async function captureTrackedLeague({
  store, scraper = require('./dataCache'),
  fetchSeries = getCrexSeriesMatches, seriesUrls = [], initialFixtures = [], sourceErrors = [], now = () => new Date(),
  leagueName, isLeague, normalizeTeam = teamKey, summarize, preMatchOnly = false,
  predict = predictMatchWinner,
} = {}) {
  const capturedAt = now().toISOString();
  const saved = await store.load();
  const fixtures = [...initialFixtures], errors = [...sourceErrors];
  for (const url of seriesUrls) {
    try {
      const found = await fetchSeries(url);
      for (const fixture of found.filter(f => isLeague(f.competitionName))) {
        const duplicate = matchFixture(fixture, fixtures, normalizeTeam);
        const index = fixtures.findIndex(item => item.recordId === fixture.recordId || item === duplicate);
        if (index >= 0) fixtures[index] = fixture;
        else fixtures.push(fixture);
      }
    } catch (error) { errors.push({ source: 'series', url, message: error.message }); }
  }
  let feed = [], feedStatus = 'unavailable';
  try {
    const data = await scraper.getCricketMatches();
    if (data?.error) throw new Error(data.error);
    const allMatches = Array.isArray(data) ? data : data?.matches || [];
    if (!Array.isArray(allMatches)) throw new Error('Invalid market feed list');
    feedStatus = data?.feedStatus || (allMatches.length ? 'available' : 'waiting-for-market-feed');
    feed = allMatches.filter(m =>
      isLeague(m.competitionName || m.seriesName) || matchFixture(m, fixtures.length ? fixtures : saved.records, normalizeTeam));
  } catch (error) { errors.push({ source: 'market-feed', message: error.message }); }
  const captures = [];
  let invalidInputs = 0, lateInputs = 0;
  for (const match of feed) {
    const matchId = String(match.matchId || match.id || '');
    if (!matchId) continue;
    let fixture = matchFixture(match, fixtures, normalizeTeam);
    if (!fixture) {
      const cached = matchFixture(match, saved.records, normalizeTeam);
      if (cached) { fixture = fixtureMetadata(cached); fixtures.push(fixture); }
    }
    if (!fixture) {
      fixture = feedFixture(match, leagueName, normalizeTeam);
      if (!fixture) continue;
      fixtures.push(fixture);
    }
    const marketFixture = feedFixture(match, leagueName, normalizeTeam);
    if (marketFixture && marketFixture.status !== 'upcoming' && !['completed','cancelled'].includes(fixture.status)) {
      fixture = { ...fixture, status:marketFixture.status, statusSource:'market-feed' };
      const index = fixtures.findIndex(item => item.recordId === fixture.recordId);
      if (index >= 0) fixtures[index] = fixture;
      else fixtures.push(fixture);
    }
    // Discover fixtures in memory; persist them only alongside a usable snapshot.
    for (const kind of ['match', 'toss']) {
      try {
        const method = kind === 'match' ? scraper.getCricketSnapshot : scraper.getTossSnapshot;
        if (!method) continue;
        const raw = await method.call(scraper, matchId);
        const snapshot = raw ? { ...raw, competitionName: leagueName } : null;
        if (!checkPreMatchDataQuality(snapshot).valid) { invalidInputs++; continue; }
        const inputTeams = snapshot.teamNames.slice(0, 2).map(normalizeTeam).sort();
        if (![normalizeTeam(fixture.team1), normalizeTeam(fixture.team2)].sort().every((name, i) => name === inputTeams[i])) {
          invalidInputs++; continue;
        }
        const snapshotCapturedAt = now().toISOString();
        const snapshotCapturedMs = Date.parse(snapshotCapturedAt);
        const deadline = kind === 'toss' ? timestamp(snapshot.startTime) || fixture.startTime : fixture.startTime;
        const beforeStart = snapshotCapturedMs < deadline && fixture.status === 'upcoming' && !match.inPlay && !snapshot.inPlay &&
          [snapshot.status, match.status].every(status => !['completed','ended','live','in-play','closed'].includes(String(status || '').toLowerCase()));
        if (preMatchOnly && !beforeStart) { lateInputs++; continue; }
        const predicted = kind === 'match' && beforeStart ? predict(snapshot) : null;
        const issuedAt = predicted ? now().toISOString() : null;
        // Provider may call its teams "Abu Dhabi D10"; result comparison uses fixture names.
        const winner = predicted ? [fixture.team1, fixture.team2].find(name => normalizeTeam(name) === normalizeTeam(predicted.winner)) : null;
        const prediction = predicted && winner && Date.parse(issuedAt) < deadline ? { ...predicted, winner, capturedAt: issuedAt } : null;
        captures.push({ recordId: fixture.recordId, kind, matchId, snapshot: structuredClone(snapshot),
          capturedAt: snapshotCapturedAt, inputTiming: beforeStart ? 'captured-before-start' : 'provider-frozen-fields-captured-after-start', prediction });
      } catch (error) { errors.push({ source: `${kind}-snapshot`, matchId, message: error.message }); }
    }
  }
  return store.update(data => {
    const existing = new Map(data.records.map(r => [r.recordId, r]));
    const capturedRecords = new Set(captures.map(c => c.recordId));
    for (const source of fixtures) {
      const fixture = fixtureMetadata(source);
      let record = existing.get(fixture.recordId);
      // A market-only record can later gain the official series provider identity.
      if (!record && fixture.sourceProvider === 'CREX') {
        const candidate = matchFixture(fixture, data.records.filter(r =>
          r.recordId.startsWith('market:') || (r.sourceProvider === 'CREX' && isLeague(r.competitionName))), normalizeTeam);
        if (candidate) { existing.delete(candidate.recordId); candidate.recordId = fixture.recordId; record = candidate; }
      }
      if (!record) {
        if (!capturedRecords.has(fixture.recordId)) continue;
        record = { ...fixture, firstSeenAt: capturedAt, actualWinner: null,
          resultVerification: { status: 'pending' }, markets: {} };
        data.records.push(record); existing.set(record.recordId, record);
      } else {
        const preserveCompleted = ['completed','cancelled'].includes(record.status) && ['upcoming','live'].includes(fixture.status);
        // Issued winner strings and verified participants retain their original
        // namespace when a provider later changes aliases or fixture identity.
        const participants = record.markets?.match?.prediction || record.resultVerification?.status === 'verified'
          ? {team1:record.team1,team2:record.team2,matchName:record.matchName} : {};
        Object.assign(record, { ...fixture, ...participants, status: preserveCompleted ? record.status : fixture.status });
        existing.set(record.recordId, record);
      }
      record.lastSeenAt = capturedAt;
    }
    for (const capture of captures) {
      const record = existing.get(capture.recordId);
      if (!record) continue;
      record.markets ||= {};
      const previous = record.markets[capture.kind];
      const next = { marketMatchId: capture.matchId, lastCapturedAt: capture.capturedAt,
        latestSnapshot: capture.snapshot, latestInputTiming: capture.inputTiming };
      // First genuine pre-match forecast and the exact input used are immutable.
      if (!previous?.prediction) Object.assign(next, { snapshot: capture.snapshot,
        capturedAt: capture.capturedAt, inputTiming: capture.inputTiming, prediction: capture.prediction });
      record.markets[capture.kind] = { ...previous, ...next };
    }
    pruneTrackedLeagueSnapshots(data, {isLeague, normalizeTeam});
    data.records.sort((a,b) => a.startTime - b.startTime || a.recordId.localeCompare(b.recordId));
    data.sync = { checkedAt: capturedAt, seriesUrls, fixturesSeen: fixtures.length, feedMatchesSeen: feed.length,
      captures: captures.length, invalidInputs, lateInputs, feedStatus, errors };
    if (!['not-requested','waiting-for-market-feed'].includes(feedStatus)) data.marketFeedHealth = { checkedAt: capturedAt, status: feedStatus,
      error: errors.find(error => error.source === 'market-feed')?.message || null };
    return { ...summarize(data), sync: data.sync };
  });
}

module.exports = { captureTrackedLeague, matchFixture, timestamp, teamKey };
