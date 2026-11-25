const fs = require('node:fs/promises');
const path = require('node:path');
const { freezePreMatchProviderTotals, getExplicitPreMatchProviderTotals, providerStartTime } = require('../utils/providerTotals.mjs');
const { capturePreMatchExposure } = require('../utils/preMatchExposure.mjs');
const { isTerminalOrLiveStatus } = require('../shared/matchStatus');

function createProviderTotalStore({ filePath = null } = {}) {
  const cached = new Map(), pending = new Map();
  let fileRows, writeChain = Promise.resolve();
  const read = async key => {
    if (!filePath) return null;
    if (!fileRows) {
      try { fileRows = JSON.parse(await fs.readFile(filePath, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; fileRows = {}; }
    }
    return fileRows[key] || null;
  };
  const write = async (key, value) => {
    if (!filePath) return;
    const work = writeChain.catch(() => {}).then(async () => {
      await read(key);
      const next = {...fileRows, [key]:value};
      await fs.mkdir(path.dirname(filePath), {recursive:true});
      const tmp = `${filePath}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(next), 'utf8');
      await fs.rename(tmp, filePath);
      fileRows = next;
    });
    writeChain = work;
    return work;
  };
  let lastPruneAt = 0;
  // Active keys re-read storage every minute (moving retryAt forward), so an old
  // retryAt means nothing has asked for that match in hours.
  function prune(now) {
    if (now - lastPruneAt < 10 * 60 * 1000) return;
    lastPruneAt = now;
    for (const [key, state] of cached) {
      if (!state.dirty && !pending.has(key) && now - state.retryAt > 6 * 60 * 60 * 1000) cached.delete(key);
    }
  }
  async function attach(snapshot, { matchId, market = 'cricket', matchInfo = null, now = Date.now() } = {}) {
    if (!snapshot || snapshot.error || !matchId) return snapshot;
    prune(now);
    const key = `${market}:${matchId}`;
    // Serialize capture and restore operations for each market independently.
    const work = (pending.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
      let state = cached.get(key);
      if (!state || (filePath && !state.dirty && now >= state.retryAt)) {
        try { state = {value:filePath ? await read(key) : state?.value || null,retryAt:now+60000,dirty:false}; }
        catch { state = {value:state?.value || null,retryAt:now+60000,dirty:false}; }
        cached.set(key, state);
      }
      const input = { ...snapshot,
        startTime:providerStartTime(snapshot) ?? providerStartTime(matchInfo),
        competitionName:snapshot.competitionName || matchInfo?.competitionName,
        inPlay:Boolean(snapshot.inPlay || matchInfo?.inPlay),
        status:isTerminalOrLiveStatus(matchInfo?.status)
          ? matchInfo.status : snapshot.status || matchInfo?.status };
      const next = capturePreMatchExposure(freezePreMatchProviderTotals(input, state.value, {now}), state.value, {now});
      const totals = getExplicitPreMatchProviderTotals(next);
      const lockedCapture = next.preMatchCapture?.state==='locked' ? next.preMatchCapture : null;
      if (!totals && !lockedCapture) return next;
      const value = {matchId:String(matchId),market,teamNames:next.teamNames,startTime:next.startTime,
        preMatchProviderTotals:next.preMatchProviderTotals,preMatchProviderTotalsCapturedAt:next.preMatchProviderTotalsCapturedAt,
        preMatchExposure:lockedCapture?.exposure,preMatchCapture:lockedCapture};
      const unchanged = state.value && ['matchId','market','teamNames','startTime','preMatchProviderTotals','preMatchExposure','preMatchCapture']
        .every(field => JSON.stringify(state.value[field]) === JSON.stringify(value[field]));
      if (unchanged) value.preMatchProviderTotalsCapturedAt = state.value.preMatchProviderTotalsCapturedAt;
      if (!unchanged || state.dirty) {
        if (!state.dirty || now >= state.retryAt) {
          try { await write(key, value); state = {value,retryAt:now+60000,dirty:false}; }
          catch { state = {value,retryAt:now+60000,dirty:true}; console.warn('[Provider totals] Durable save unavailable; keeping captured totals in memory.'); }
        } else state = {...state,value};
        cached.set(key, state);
      }
      return {...next,preMatchProviderTotalsCapturedAt:value.preMatchProviderTotalsCapturedAt};
    });
    pending.set(key, work);
    try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
  }
  return {attach,cacheSize:()=>cached.size};
}
let defaultStore;
function getDefaultProviderTotalStore() { return defaultStore ||= createProviderTotalStore(); }
module.exports = {createProviderTotalStore,getDefaultProviderTotalStore};
