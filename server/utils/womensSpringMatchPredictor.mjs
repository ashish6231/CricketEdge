export const WOMENS_SPRING_LEAGUE = "Women's T20 Spring Challenge";

// Team names overlap WBBL and WNCL, so only competition metadata selects this.
export function isWomensSpringT20(compName = '') {
  const name = String(compName).toLowerCase()
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return /^t20 spring challenge(?: \d{4})?$/.test(name)
    || (/\bwomens?\b/.test(name) && /\bspring\b/.test(name)
      && /\b(t20|twenty20)\b/.test(name));
}

export function springTeamKey(name) {
  const key = String(name || '').toLowerCase().replace(/\b(womens?|w)\b/g, '').replace(/[^a-z0-9]/g, '');
  return ['australiancapitalterritory', 'act', 'actmeteors'].includes(key) ? 'actmeteors' : key;
}

function timestamp(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  const result = Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : Date.parse(value);
  return Number.isFinite(result) && result > 0 ? result : null;
}
function pair(source) {
  const values = Array.isArray(source) ? source.slice(0, 2)
    : [source?.team1 ?? source?.totalBetTeam1, source?.team2 ?? source?.totalBetTeam2];
  if (values.length !== 2 || values.some(v => v == null || !['string', 'number'].includes(typeof v) || String(v).trim() === '')) return null;
  const totals = values.map(Number);
  return totals.every(v => Number.isFinite(v) && v >= 0) ? totals : null;
}

// The provider's pre-match activity ledger is already frozen to that period.
// Current/live totals still require an observation made before kickoff.
export function getSpringPreMatchProviderTotals(input) {
  if (!input || input.error) return null;
  const reported = pair(input.preMatchTotalBets);
  if (reported) return reported;
  if (input.preMatchProviderTotals != null) return pair(input.preMatchProviderTotals);
  if (input.deepMetrics?.preMatchTotals != null) return pair(input.deepMetrics.preMatchTotals);
  const start = timestamp(input.startTime ?? input.openDate ?? input.marketStartTime);
  const observed = timestamp(input.serverTime ?? input.capturedAt);
  const captured = timestamp(input.capturedAt);
  if (start == null || observed == null || observed >= start || (captured != null && captured >= start)
    || input.inPlay === true || /after-start/i.test(input.inputTiming || '')
    || /^(live|inplay|in-play|ended|completed|closed|verified|pending|cancelled|abandoned)$/i.test(input.status || '')) return null;
  return pair(input.deepMetrics?.totals);
}

// Attach the last genuinely observed pre-start total to subsequent live snapshots.
export function freezeSpringProviderTotals(input, previous = null) {
  if (!isWomensSpringT20(input?.competitionName)) return input;
  let totals = getSpringPreMatchProviderTotals(input);
  const oldTotals = getSpringPreMatchProviderTotals(previous);
  if (!totals && oldTotals && input.teamNames?.length === 2 && previous.teamNames?.length === 2
    && timestamp(input.startTime) === timestamp(previous.startTime)) {
    const indexes = input.teamNames.map(name => previous.teamNames.findIndex(old => springTeamKey(old) === springTeamKey(name)));
    if (indexes.every(index => index >= 0) && indexes[0] !== indexes[1]) totals = indexes.map(index => oldTotals[index]);
  }
  return totals ? { ...input, preMatchProviderTotals: { team1: totals[0], team2: totals[1] } } : input;
}

export function getSpringPreMatchReportedActivity(input) {
  return !input || input.error ? null : pair(input.preMatchTotalBets);
}

export function getWomensSpringMatchPrediction(input) {
  if (!isWomensSpringT20(input?.competitionName)) return null;
  const names = input?.teamNames;
  if (!Array.isArray(names) || names.length !== 2 || names.some(n => typeof n !== 'string' || !n.trim())
    || springTeamKey(names[0]) === springTeamKey(names[1])) return null;
  const totals = getSpringPreMatchReportedActivity(input);
  if (!totals || totals[0] === totals[1]) return null;
  const winnerIdx = totals[0] < totals[1] ? 0 : 1;
  return {
    winner: names[winnerIdx], winnerIdx,
    tier: 'WOMENS_SPRING_T20_LOWER_REPORTED_ACTIVITY',
    ruleFamily: 'spring-lower-prematch-reported-activity',
    reason: `${names[winnerIdx]} has the lower pre-match reported activity (${totals[winnerIdx].toFixed(2)} vs ${totals[1 - winnerIdx].toFixed(2)}).`,
    confidence: 'Single reported-activity rule; future accuracy unvalidated',
    confidenceCalibrated: false, inputTiming: 'provider-frozen-pre-match-activity',
    reportedActivityEvidence: { team1: totals[0], team2: totals[1], winnerIdx, signalCount: 1 },
  };
}
