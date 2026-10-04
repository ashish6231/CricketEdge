// User-requested migration: remove fixtures without usable saved market inputs.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createD10Store } = require('../services/emiratesD10Store');
const { createWNCLStore } = require('../services/wnclStore');
const { checkPreMatchDataQuality } = require('../utils/preMatchDataQuality.mjs');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const now = new Date().toISOString();
  const backup = path.join(root, 'reports/snapshot-only-cleanup', now.replace(/[:.]/g, '-'));
  await fs.mkdir(backup, {recursive:true});
  const report = {checkedAt:now,policy:'Only records with usable match/toss snapshots; no fixture-only records',leagues:{},existingDatasets:{}};
  for (const [league, filename, factory] of [
    ['Emirates D10','emirates_d10_dataset.json',createD10Store],
    ['WNCL','wncl_dataset.json',createWNCLStore],
  ]) {
    const filePath = path.join(root, 'server/data', filename);
    let raw;
    try {raw=await fs.readFile(filePath);} catch(error) {if(error.code==='ENOENT')continue;throw error;}
    const before = JSON.parse(raw);
    if (!Array.isArray(before.records)) throw Error(`Invalid dataset: ${filename}`);
    await fs.writeFile(path.join(backup, filename), raw);
    const store = factory({filePath});
    await store.update(()=>{});
    const after = await store.load();
    const ids = new Set(after.records.map(r=>r.recordId));
    report.leagues[league] = {before:before.records.length,kept:after.records.length,
      removed:before.records.filter(r=>!ids.has(r.recordId)).map(r=>r.recordId)};
  }
  // Existing historical datasets were already cleaned. Audit without rewriting
  // their records, saved forecasts, or immutable report hashes.
  for (const filename of ['match_dataset.json','toss_dataset.json']) {
    const data = JSON.parse(await fs.readFile(path.join(root,'server/data',filename),'utf8'));
    report.existingDatasets[filename] = {total:data.records.length,
      invalidSnapshots:data.records.filter(r=>!checkPreMatchDataQuality(r.snapshot).valid).length};
  }
  await fs.writeFile(path.join(backup,'manifest.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({backup:path.relative(root,backup),
    leagues:Object.fromEntries(Object.entries(report.leagues).map(([name,value])=>[name,{before:value.before,kept:value.kept,removed:value.removed.length}])),
    existingDatasets:report.existingDatasets},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
