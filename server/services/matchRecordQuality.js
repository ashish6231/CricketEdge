const { checkPreMatchDataQuality } = require('../utils/preMatchDataQuality.mjs');

const teamKey = name => String(name || '').trim().toLowerCase();

function checkMatchRecordQuality(record, normalizeTeam = teamKey) {
  const quality = checkPreMatchDataQuality(record?.snapshot);
  if (!quality.valid) return quality;
  if (!['string', 'number'].includes(typeof record.matchId) || !String(record.matchId).trim()
    || ['undefined', 'null'].includes(String(record.matchId))
    || (typeof record.matchId === 'number' && !Number.isFinite(record.matchId))) {
    return { valid: false, reason: 'missing-match-id' };
  }
  if (typeof record.competitionName !== 'string' || !record.competitionName.trim()) {
    return { valid: false, reason: 'missing-league' };
  }
  const names = [record.team1, record.team2];
  if (!names.every(name => typeof name === 'string' && name.trim())
    || !names.every((name, i) => normalizeTeam(name) === normalizeTeam(record.snapshot.teamNames[i]))) {
    return { valid: false, reason: 'snapshot-participants-mismatch' };
  }
  if (record.lastCaptureError) return { valid: false, reason: 'failed-capture' };
  if (record.predictedWinner && !names.some(name => normalizeTeam(name) === normalizeTeam(record.predictedWinner))) {
    return { valid: false, reason: 'invalid-predicted-winner' };
  }
  if (record.actualWinner && record.actualWinner !== 'No Result'
    && !names.some(name => normalizeTeam(name) === normalizeTeam(record.actualWinner))) {
    return { valid: false, reason: 'invalid-actual-winner' };
  }
  return { valid: true, reason: null };
}

module.exports = { checkMatchRecordQuality };
