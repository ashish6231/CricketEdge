import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { predictMatchWinner } from './utils/matchWinnerPredictor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const matchDatasetPath = path.join(__dirname, 'data/match_dataset.json');
const tossDatasetPath = path.join(__dirname, 'data/toss_dataset.json');

const datasetFile = fs.existsSync(matchDatasetPath) ? matchDatasetPath : tossDatasetPath;
const d = JSON.parse(fs.readFileSync(datasetFile, 'utf8'));
const records = d.records || [];

const cpl = records.filter(r => {
  const c = ((r.competitionName||'') + ' ' + (r.matchName||'')).toLowerCase();
  const teams = ((r.team1||'') + ' ' + (r.team2||'')).toLowerCase();
  return c.includes('caribbean') || c.includes('cpl') ||
    teams.includes('trinbago') || teams.includes('guyana') ||
    teams.includes('barbados') || teams.includes('jamaica') ||
    teams.includes('st lucia') || teams.includes('st. lucia') ||
    teams.includes('antigua') || teams.includes('st kitts') ||
    teams.includes('st. kitts');
});

// User-confirmed results for matches that ended but were pending verification in dataset
const CONFIRMED_RESULTS = {
  '35989000': 'Antigua & Barbuda Falcons', // 31 Aug 2026 — user confirmed
  '36004104': 'Guyana Amazon Warriors',    // 01 Sept 2026 — user confirmed
};

// Only ended/verified matches (+ user-confirmed ones)
const ended = cpl.filter(r =>
  (r.actualWinner && r.status === 'verified') || CONFIRMED_RESULTS[r.matchId]
);
const pending = cpl.filter(r =>
  !(r.actualWinner && r.status === 'verified') && !CONFIRMED_RESULTS[r.matchId]
);

function isMatchOk(predName, actualName) {
  if (!predName || !actualName) return false;
  const p = predName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = actualName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (p.includes(a) || a.includes(p)) return true;
  if ((a.includes('falco') || a.includes('falcs')) && (p.includes('falco') || p.includes('falcs'))) return true;
  if ((a.includes('patriot') || a.includes('pats')) && (p.includes('patriot') || p.includes('pats'))) return true;
  return false;
}

const SEP = '═'.repeat(90);
console.log(`\n${SEP}`);
console.log('  🌴 CPL MATCH WINNER — NEW ALGO BACKTEST');
console.log(`  Dataset: ${path.basename(datasetFile)} | Run: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
console.log(`${SEP}\n`);
console.log(`📂 Total CPL records: ${cpl.length}  |  ✅ Ended/Verified: ${ended.length}  |  ⏳ Pending: ${pending.length}\n`);

let pass = 0, fail = 0;
const results = [];

for (const r of ended) {
  const snap = r.snapshot;
  if (!snap) continue;

  const actual = r.actualWinner || CONFIRMED_RESULTS[r.matchId];
  if (!actual) continue;

  // Ensure CPL algo is properly triggered — predictMatchWinner reads snap.competitionName internally
  if (!snap.competitionName) snap.competitionName = r.competitionName || 'Caribbean Premier League';

  const pred = predictMatchWinner(snap, r.competitionName || 'Caribbean Premier League');
  const ok = isMatchOk(pred?.winner, actual);

  const isUserConfirmed = !r.actualWinner && !!CONFIRMED_RESULTS[r.matchId];

  if (ok) pass++; else fail++;

  results.push({
    matchId: r.matchId,
    matchName: r.matchName,
    date: r.startTime ? new Date(r.startTime).toLocaleDateString('en-IN') : '?',
    actual,
    predicted: pred?.winner || 'NO SIGNAL',
    confidence: pred?.confidence || '—',
    ok,
    isUserConfirmed,
  });
}

// Print table
const COL_M = 48, COL_T = 28, COL_C = 36;
console.log(
  `${'#'.padEnd(3)} ${'Match'.padEnd(COL_M)} ${'Date'.padEnd(10)} ` +
  `${'Actual Winner'.padEnd(COL_T)} ${'Predicted'.padEnd(COL_T)} ${'Confidence'.padEnd(COL_C)} Result`
);
console.log('─'.repeat(COL_M + COL_T * 2 + COL_C + 30));

results.forEach((r, i) => {
  const mName = r.matchName.length > COL_M ? r.matchName.slice(0, COL_M - 1) + '…' : r.matchName;
  const userTag = r.isUserConfirmed ? ' *' : '';
  console.log(
    `${String(i + 1).padEnd(3)} ` +
    `${mName.padEnd(COL_M)} ` +
    `${r.date.padEnd(10)} ` +
    `${(r.actual + userTag).padEnd(COL_T)} ` +
    `${r.predicted.padEnd(COL_T)} ` +
    `${r.confidence.padEnd(COL_C)} ` +
    `${r.ok ? '✅ PASS' : '❌ FAIL'}`
  );
});

// Summary
console.log(`\n${SEP}`);
console.log(`  📊 CPL MATCH WINNER ACCURACY (New Algo)`);
console.log(`  ✅ PASS : ${pass}`);
console.log(`  ❌ FAIL : ${fail}`);
console.log(`  📋 TOTAL: ${pass + fail}`);
console.log(`  🎯 ACCURACY: ${pass + fail > 0 ? ((pass / (pass + fail)) * 100).toFixed(1) : '0.0'}%`);
console.log(`${SEP}\n`);

// Failures detail
const fails = results.filter(r => !r.ok);
if (fails.length) {
  console.log(`❌ FAILED PREDICTIONS (${fails.length})\n`);
  for (const f of fails) {
    console.log(`  ✗ [${f.matchId}] ${f.matchName}`);
    console.log(`    Actual   : ${f.actual}`);
    console.log(`    Predicted: ${f.predicted}  (${f.confidence})`);
    // show raw snapshot numbers
    const snap = ended.find(r => r.matchId === f.matchId)?.snapshot;
    if (snap) {
      const pv1 = snap.preMatchVolume?.team1 || {};
      const pv2 = snap.preMatchVolume?.team2 || {};
      const b1 = pv1.back || 0, l1 = pv1.lay || 0;
      const b2 = pv2.back || 0, l2 = pv2.lay || 0;
      const epnl1 = snap.preMatchPnl?.team1 ?? (l1 - b1);
      const epnl2 = snap.preMatchPnl?.team2 ?? (l2 - b2);
      console.log(`    Market   : b1=₹${b1.toFixed(0)} l1=₹${l1.toFixed(0)} | b2=₹${b2.toFixed(0)} l2=₹${l2.toFixed(0)}`);
      console.log(`    PnL      : t1=${epnl1.toFixed(0)} | t2=${epnl2.toFixed(0)}`);
    }
    console.log();
  }
}
