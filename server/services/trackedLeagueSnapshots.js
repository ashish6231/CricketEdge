const { checkPreMatchDataQuality } = require('../utils/preMatchDataQuality.mjs');

function teamKey(name) {
  return String(name || '').toLowerCase().replace(/\bd\s*-?\s*10\b/g, '').replace(/[^a-z0-9]/g, '').replace(/^emiratesreds$/, 'emiratesred');
}
function snapshotMatchesRecord(snapshot, record, normalizeTeam = teamKey) {
  if (!checkPreMatchDataQuality(snapshot).valid) return false;
  const participants = [record.team1, record.team2].map(normalizeTeam).sort();
  const inputs = snapshot.teamNames.slice(0, 2).map(normalizeTeam).sort();
  return participants.every(Boolean) && participants[0] !== participants[1] &&
    participants.every((name, i) => name === inputs[i]);
}

// Fixtures are discovery inputs, not stored samples. Keep each market only when
// its saved input snapshot is usable and belongs to this match's participants.
function pruneTrackedLeagueSnapshots(data, { isLeague, normalizeTeam = teamKey }) {
  let removedRecords = 0, removedMarkets = 0;
  data.records = data.records.filter(record => {
    if (!isLeague(record.competitionName)) { removedRecords++; return false; }
    const markets = {};
    for (const kind of ['match', 'toss']) {
      const market = record.markets?.[kind];
      if (!market) continue;
      if (!snapshotMatchesRecord(market.snapshot, record, normalizeTeam)) { removedMarkets++; continue; }
      const clean = { ...market };
      if (Object.hasOwn(clean, 'latestSnapshot') && !snapshotMatchesRecord(clean.latestSnapshot, record, normalizeTeam)) {
        delete clean.latestSnapshot;
        delete clean.latestInputTiming;
        delete clean.lastCapturedAt;
      }
      markets[kind] = clean;
    }
    record.markets = markets;
    if (!Object.keys(markets).length) { removedRecords++; return false; }
    return true;
  });
  return { removedRecords, removedMarkets };
}
module.exports = { teamKey, snapshotMatchesRecord, pruneTrackedLeagueSnapshots };
