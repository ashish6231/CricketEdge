const fs = require('node:fs/promises');
const path = require('node:path');
const { checkPreMatchDataQuality } = require('../utils/preMatchDataQuality.mjs');
const { teamKey, pruneTrackedLeagueSnapshots } = require('./trackedLeagueSnapshots');

const badInput = message => Object.assign(new Error(message), { status: 400 });
function validateResultEvidence(url, approvedHosts, evidenceLabel = 'approved source') {
  let parsed;
  try { parsed = new URL(url); } catch { throw badInput('Scorecard URL required'); }
  if (parsed.protocol !== 'https:' || !approvedHosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    throw badInput(`Use a ${evidenceLabel} scorecard URL`);
  }
  return parsed.href;
}

function createTrackedLeagueStore({ filePath, leagueName, isLeague, approvedHosts, evidenceLabel, normalizeTeam = teamKey }) {
  let chain = Promise.resolve();
  function enqueue(fn) { const next = chain.then(fn); chain = next.catch(() => {}); return next; }
  async function read() {
    let raw;
    try { raw = await fs.readFile(filePath, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return { version: 1, league: leagueName, records: [], sync: null }; throw e; }
    const data = JSON.parse(raw);
    if (!Array.isArray(data.records)) throw new Error('Invalid league dataset; refusing to overwrite');
    pruneTrackedLeagueSnapshots(data, {isLeague, normalizeTeam});
    return data;
  }
  async function write(data) {
    pruneTrackedLeagueSnapshots(data, {isLeague, normalizeTeam});
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
    await fs.rename(tmp, filePath);
  }
  function load() { return enqueue(read); }
  function update(mutator) {
    return enqueue(async () => {
      const data = await read();
      const result = await mutator(data);
      data.updatedAt = new Date().toISOString();
      await write(data);
      return result;
    });
  }
  async function confirmResult({ recordId, actualWinner, sourceUrl, resultText, admin }) {
    const evidence = validateResultEvidence(sourceUrl, approvedHosts, evidenceLabel);
    return update(data => {
      const record = data.records.find(r => r.recordId === recordId);
      if (!record) throw Object.assign(new Error(`${leagueName} match not found`), { status: 404 });
      if (!isLeague(record.competitionName) || record.status !== 'completed') throw badInput('Only completed league matches can be verified');
      if (![record.team1, record.team2, 'No Result'].includes(actualWinner)) throw badInput('Actual winner must be a participating team or No Result');
      record.actualWinner = actualWinner;
      record.resultVerification = { status: 'verified', sourceUrl: evidence, resultText: resultText || null,
        checkedAt: new Date().toISOString(), confirmedBy: admin?.email || 'manual' };
      return record;
    });
  }
  return { load, update, confirmResult };
}

function summarizeTrackedLeague(data) {
  const summary = { total: data.records.length, completed: 0, live: 0, upcoming: 0, cancelled: 0,
    verifiedResults: 0, preMatchPredictions: 0, correct: 0, wrong: 0, noResult: 0, unscored: 0 };
  for (const r of data.records) {
    if (Object.hasOwn(summary, r.status)) summary[r.status]++;
    const verified = r.resultVerification?.status === 'verified';
    if (verified) summary.verifiedResults++;
    const forecast = r.markets?.match?.prediction;
    const proper = checkPreMatchDataQuality(r.markets?.match?.snapshot).valid;
    const preMatch = forecast && proper && new Date(forecast.capturedAt).getTime() < r.startTime;
    if (preMatch) summary.preMatchPredictions++;
    if (verified && r.actualWinner === 'No Result') summary.noResult++;
    else if (r.status === 'completed' && verified && preMatch) summary[forecast.winner === r.actualWinner ? 'correct' : 'wrong']++;
    else if (r.status === 'completed') summary.unscored++;
  }
  summary.accuracy = summary.correct + summary.wrong ? Number((100 * summary.correct / (summary.correct + summary.wrong)).toFixed(1)) : null;
  return summary;
}

module.exports = { createTrackedLeagueStore, summarizeTrackedLeague, validateResultEvidence };
