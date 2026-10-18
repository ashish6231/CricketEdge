const number = value => value == null || !['number', 'string'].includes(typeof value) || String(value).trim() === ''
  ? null : Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export function providerTotalPair(source) {
  const values = Array.isArray(source) ? source.slice(0, 2)
    : [source?.team1 ?? source?.totalBetTeam1, source?.team2 ?? source?.totalBetTeam2];
  const pair = values.map(number);
  return pair.length === 2 && pair.some(value => value != null) ? pair : null;
}
export function providerTimestamp(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  const time = Number.isFinite(numeric) ? numeric < 1e12 ? numeric * 1000 : numeric : Date.parse(value);
  return Number.isFinite(time) && time > 0 ? time : null;
}
export function providerStartTime(snapshot) {
  for (const value of [snapshot?.startTime, snapshot?.openDate, snapshot?.marketStartTime]) {
    const time = providerTimestamp(value);
    if (time != null) return time;
  }
  return null;
}
export function getCurrentProviderTotals(snapshot) {
  return snapshot?.error ? null : providerTotalPair(snapshot?.deepMetrics?.totals);
}
export function getExplicitPreMatchProviderTotals(snapshot) {
  if (!snapshot || snapshot.error) return null;
  // The provider already supplies this metric frozen to the pre-match period.
  // Prefer that period ledger over a capture from an earlier polling interval.
  const sources = [snapshot.preMatchTotalBets, snapshot.preMatchProviderTotals, snapshot.deepMetrics?.preMatchTotals].map(providerTotalPair);
  const values = [0, 1].map(index => sources.find(source => source?.[index] != null)?.[index] ?? null);
  return values.some(value => value != null) ? values : null;
}
export function canObservePreMatchProviderTotals(snapshot, now = null) {
  if (!snapshot || snapshot.error) return false;
  const start = providerStartTime(snapshot);
  const observed = providerTimestamp(snapshot.serverTime ?? snapshot.capturedAt);
  const captured = providerTimestamp(snapshot.capturedAt);
  if (start == null || (now != null && now >= start) || (observed != null && observed >= start)
    || (captured != null && captured >= start) || (now == null && observed == null)) return false;
  return !snapshot.inPlay && !/after-start/i.test(snapshot.inputTiming || '')
    && !/^(live|inplay|in-play|ended|completed|closed|verified|pending|cancelled|canceled|abandoned|result)$/i.test(String(snapshot.status || '').trim())
    && ![snapshot.crex?.status, snapshot.crex?.scorecard?.status].some(status => /^(live|in-play|completed)$/i.test(status || ''))
    && !/won by|won the|match drawn|match tied|no result/i.test(snapshot.crex?.statusText || '');
}
const teamKey = name => String(name || '').toLowerCase().replace(/\bwomen\b/g, 'w').replace(/[^a-z0-9]/g, '');
export function remapFrozenProviderTotals(snapshot, previous) {
  if (!snapshot || !previous || providerStartTime(snapshot) == null || providerStartTime(snapshot) !== providerStartTime(previous)) return null;
  const totals = getExplicitPreMatchProviderTotals(previous);
  const names = snapshot.teamNames, oldNames = previous.teamNames;
  if (!totals || !Array.isArray(names) || !Array.isArray(oldNames) || names.length < 2 || oldNames.length < 2) return null;
  const indexes = names.slice(0, 2).map(name => oldNames.slice(0, 2).findIndex(old => teamKey(old) === teamKey(name)));
  if (indexes.some(index => index < 0) || indexes[0] === indexes[1]) return null;
  return indexes.map(index => totals[index]);
}

// Provider-frozen period data and previously observed values may survive kickoff.
// Only a demonstrably pre-start current total can fill a missing frozen side.
export function freezePreMatchProviderTotals(snapshot, previous = null, { now = null } = {}) {
  if (!snapshot || snapshot.error) return snapshot;
  const explicit = getExplicitPreMatchProviderTotals(snapshot);
  const observedTime = providerTimestamp(snapshot.serverTime ?? snapshot.capturedAt) ?? now;
  const previousTime = providerTimestamp(previous?.preMatchProviderTotalsCapturedAt);
  const stored = remapFrozenProviderTotals(snapshot, previous);
  const observed = canObservePreMatchProviderTotals(snapshot, now)
    && !(stored && previousTime != null && observedTime != null && observedTime < previousTime)
    ? getCurrentProviderTotals(snapshot) : null;
  const totals = [0, 1].map(index => explicit?.[index] ?? observed?.[index] ?? stored?.[index] ?? null);
  if (totals.every(value => value == null)) return snapshot;
  const observedNow = observed?.some((value, index) => value != null && explicit?.[index] == null);
  return { ...snapshot, preMatchProviderTotals: { team1: totals[0], team2: totals[1] },
    preMatchProviderTotalsCapturedAt: snapshot.preMatchProviderTotalsCapturedAt
      || (observedNow ? snapshot.serverTime || snapshot.capturedAt || (now == null ? null : new Date(now).toISOString()) : previous?.preMatchProviderTotalsCapturedAt) || null };
}

/** Recover only totals whose archived observation AND capture preceded kickoff. */
export function providerSnapshotFromRecord(record) {
  if (!record?.snapshot) return null;
  return freezePreMatchProviderTotals({ ...record.snapshot,
    startTime: providerStartTime(record.snapshot) ?? providerStartTime(record),
    capturedAt: record.capturedAt ?? record.snapshot.capturedAt,
    inputTiming: record.inputTiming ?? record.snapshot.inputTiming,
  });
}
