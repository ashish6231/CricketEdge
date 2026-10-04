const finite = value => typeof value === 'number' && Number.isFinite(value);

// Missing values must not be coerced into usable pre-match money flow.
export function checkPreMatchDataQuality(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.error) return {valid:false,reason:'missing-or-failed-snapshot'};
  const names = snapshot.teamNames;
  if (!Array.isArray(names) || names.length < 2 || !names.slice(0,2).every(n=>typeof n==='string'&&n.trim()) || names[0].trim().toLowerCase()===names[1].trim().toLowerCase()) return {valid:false,reason:'invalid-team-names'};
  let total = 0;
  for (const key of ['team1','team2']) {
    const volume = snapshot.preMatchVolume?.[key];
    if (!volume || !['back','lay'].every(field=>finite(volume[field])&&volume[field]>=0)) return {valid:false,reason:'missing-or-invalid-pre-match-volume'};
    if (!finite(snapshot.preMatchPnl?.[key])) return {valid:false,reason:'missing-or-invalid-pre-match-pnl'};
    if (snapshot.preMatchTotalBets && (!finite(snapshot.preMatchTotalBets[key]) || snapshot.preMatchTotalBets[key]<0)) return {valid:false,reason:'invalid-pre-match-activity'};
    total += volume.back + volume.lay;
  }
  return total > 0 ? {valid:true,reason:null} : {valid:false,reason:'both-teams-zero-pre-match-flow'};
}
