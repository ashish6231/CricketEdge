const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { freezePreMatchProviderTotals, getExplicitPreMatchProviderTotals, providerStartTime } = require('../utils/providerTotals.mjs');

const DATASET_KEY = 'prematch_provider_totals';
function createProviderTotalStore({ prisma, filePath = path.join(__dirname, '../data/pre_match_provider_totals.json'),
  database = process.env.PREDICTION_STORAGE === 'database' || process.env.PREDICTION_STORAGE !== 'file'
    && process.env.NODE_ENV !== 'test' && !!process.env.DATABASE_URL } = {}) {
  const cached = new Map(), pending = new Map();
  let fileRows, writeChain = Promise.resolve();
  const client = () => prisma || require('../db/prisma');
  const read = async key => {
    if (database) {
      const row = await client().predictionRecord.findUnique({where:{datasetKey_recordKey:{datasetKey:DATASET_KEY,recordKey:key}},select:{payload:true}});
      return row ? JSON.parse(row.payload) : null;
    }
    if (!fileRows) {
      try { fileRows = JSON.parse(await fs.readFile(filePath, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; fileRows = {}; }
    }
    return fileRows[key] || null;
  };
  const write = async (key, value) => {
    if (database) {
      const id = createHash('sha256').update(`${DATASET_KEY}\0${key}`).digest('hex');
      const payload = JSON.stringify(value);
      await client().predictionRecord.upsert({where:{datasetKey_recordKey:{datasetKey:DATASET_KEY,recordKey:key}},
        create:{id,datasetKey:DATASET_KEY,recordKey:key,payload,position:0},update:{payload}});
      return;
    }
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
  async function attach(snapshot, { matchId, market = 'cricket', matchInfo = null, now = Date.now() } = {}) {
    if (!snapshot || snapshot.error || !matchId) return snapshot;
    const key = `${market}:${matchId}`;
    // Serialize capture and restore operations for each market independently.
    const work = (pending.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
      let state = cached.get(key);
      if (!state || (!state.dirty && now >= state.retryAt)) {
        try { state = {value:await read(key),retryAt:now+60000,dirty:false}; }
        catch { state = {value:state?.value || null,retryAt:now+60000,dirty:false}; }
        cached.set(key, state);
      }
      const input = { ...snapshot,
        startTime:providerStartTime(snapshot) ?? providerStartTime(matchInfo),
        competitionName:snapshot.competitionName || matchInfo?.competitionName,
        inPlay:Boolean(snapshot.inPlay || matchInfo?.inPlay),
        status:/^(live|in-play|ended|completed|closed|verified|pending|cancelled|abandoned)$/i.test(matchInfo?.status || '')
          ? matchInfo.status : snapshot.status || matchInfo?.status };
      const next = freezePreMatchProviderTotals(input, state.value, {now});
      const totals = getExplicitPreMatchProviderTotals(next);
      if (!totals) return next;
      const value = {matchId:String(matchId),market,teamNames:next.teamNames,startTime:next.startTime,
        preMatchProviderTotals:next.preMatchProviderTotals,preMatchProviderTotalsCapturedAt:next.preMatchProviderTotalsCapturedAt};
      const unchanged = state.value && ['matchId','market','teamNames','startTime','preMatchProviderTotals']
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
  return {attach};
}
let defaultStore;
function getDefaultProviderTotalStore() { return defaultStore ||= createProviderTotalStore(); }
module.exports = {createProviderTotalStore,getDefaultProviderTotalStore};
