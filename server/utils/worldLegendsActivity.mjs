export const WORLD_LEGENDS_LEAGUE = 'World Championship of Legends T20';

export function isWorldLegendsLeague(name = '') {
  const comp = String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return /\bworld championship of legends\b/.test(comp) || /^wcl(?: t20)?(?: 20\d{2})?$/.test(comp);
}

// Read each market's own frozen pre-match reported activity. A toss snapshot
// uses toss activity; a match snapshot uses match activity. No live fallbacks.
export function getWorldLegendsActivityPrediction(snapshot) {
  if (!snapshot || snapshot.error || !Array.isArray(snapshot.teamNames) || snapshot.teamNames.length !== 2) return null;
  const names = snapshot.teamNames;
  if (names.some(name => typeof name !== 'string' || !name.trim())
    || names[0].trim().toLowerCase() === names[1].trim().toLowerCase()) return null;
  const raw = [snapshot.preMatchTotalBets?.team1, snapshot.preMatchTotalBets?.team2];
  if (raw.some(value => value == null || !['number', 'string'].includes(typeof value) || String(value).trim() === '')) return null;
  const values = raw.map(Number);
  if (values.some(value => !Number.isFinite(value) || value < 0) || values[0] === values[1]) return null;
  const winnerIdx = values[0] > values[1] ? 0 : 1;
  const scale = Math.max(...values);
  const pct1 = (values[0] / scale) / (values[0] / scale + values[1] / scale) * 100;
  return {
    winner: names[winnerIdx], winnerIdx,
    reason: `${names[winnerIdx]} has the higher pre-match reported activity (${values[winnerIdx].toFixed(2)} vs ${values[1-winnerIdx].toFixed(2)}).`,
    reportedActivityEvidence: {team1:values[0], team2:values[1],pct1,pct2:100-pct1,leaderIdx:winnerIdx,winnerIdx,signalCount:1,selection:'higher'},
    confidenceCalibrated:false,inputTiming:'provider-frozen-pre-match-activity',
  };
}
