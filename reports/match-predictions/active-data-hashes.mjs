import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

// A documented cleanup authorizes a subset of the immutable optimization inputs.
// Keep the original hashes intact rather than silently resetting the baseline.
export function activeDataHashes(root,original) {
 const manifestPath=path.join(root,'reports/match-predictions/pre-match-quality-cleanup.json');
 if(!fs.existsSync(manifestPath))return original;
 const manifest=JSON.parse(fs.readFileSync(manifestPath));
 const expected={};
 for(const [file,digest] of Object.entries(original)) {
  if(manifest.beforeHashes[file]!==digest)throw new Error('Cleanup does not descend from protected baseline: '+file);
  const oldFile=path.join(root,manifest.backup,file);
  if(hash(fs.readFileSync(oldFile))!==digest)throw new Error('Corrupt cleanup backup: '+file);
  if(!manifest.afterHashes[file])throw new Error('Missing cleanup output hash: '+file);
  expected[file]=manifest.afterHashes[file];
 }
 for(const [file,digest] of Object.entries(expected))if(hash(fs.readFileSync(path.join(root,file)))!==digest)throw new Error('Active data differs from authorized cleanup: '+file);
 for(const name of ['match_dataset.json','toss_dataset.json']) {
  const file='server/data/'+name,before=JSON.parse(fs.readFileSync(path.join(root,manifest.backup,file))),after=JSON.parse(fs.readFileSync(path.join(root,file)));
  const rows=new Map(before.records.map(r=>[String(r.matchId),r]));
  for(const r of after.records)if(JSON.stringify(rows.get(String(r.matchId)))!==JSON.stringify(r))throw new Error('Retained record changed during cleanup: '+r.matchId);
 }
 return expected;
}
