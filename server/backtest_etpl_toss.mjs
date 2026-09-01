/**
 * ETPL / ECS Toss Algorithm Backtest  (v2 algo)
 * ─────────────────────────────────────────────
 * Reads from server/data/toss_dataset.json (offline, no HTTP needed)
 * and runs getECSTossPrediction() against all ETPL/ECS records.
 *
 * Usage:
 *   node server/backtest_etpl_toss.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  getECSTossPrediction,
  inferCompetition,
  fmtVol,
} from './utils/tossLeagueAlgorithms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── helpers ────────────────────────────────────────────────────────────────
function teamEq(a, b) {
  const na = (a || '').trim().toLowerCase();
  const nb = (b || '').trim().toLowerCase();
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
}

/** Infer actual toss winner from settled market (min-odds side) */
function inferTossWinner(snap) {
  const t1 = snap.teamNames?.[0];
  const t2 = snap.teamNames?.[1];
  if (!t1 || !t2) return null;
  const tr1 = snap.teams?.[t1]?.trades || [];
  const tr2 = snap.teams?.[t2]?.trades || [];
  if (!tr1.length && !tr2.length) return null;
  const min1 = tr1.length ? Math.min(...tr1.map((t) => t.price)) : 999;
  const min2 = tr2.length ? Math.min(...tr2.map((t) => t.price)) : 999;
  if (min1 <= 1.12 && min1 < min2) return t1;
  if (min2 <= 1.12 && min2 < min1) return t2;
  return min1 <= min2 ? t1 : t2;
}

/** Build algo context from snapshot */
function buildCtx(snap) {
  const t1 = snap.teamNames?.[0] || 'Team 1';
  const t2 = snap.teamNames?.[1] || 'Team 2';

  const pv1 = snap.preMatchVolume?.team1 || snap.advancedMetricsV2?.team1 || snap.advancedMetrics?.team1 || {};
  const pv2 = snap.preMatchVolume?.team2 || snap.advancedMetricsV2?.team2 || snap.advancedMetrics?.team2 || {};

  const b1 = pv1.back ?? (snap.teams?.[t1]?.trades || []).filter((t) => t.type === 'back').reduce((s, t) => s + (t.size || 0), 0);
  const l1 = pv1.lay  ?? (snap.teams?.[t1]?.trades || []).filter((t) => t.type === 'lay' ).reduce((s, t) => s + (t.size || 0), 0);
  const b2 = pv2.back ?? (snap.teams?.[t2]?.trades || []).filter((t) => t.type === 'back').reduce((s, t) => s + (t.size || 0), 0);
  const l2 = pv2.lay  ?? (snap.teams?.[t2]?.trades || []).filter((t) => t.type === 'lay' ).reduce((s, t) => s + (t.size || 0), 0);

  const prePnl1 = snap.preMatchPnl?.team1 ?? (l1 - b1);
  const prePnl2 = snap.preMatchPnl?.team2 ?? (l2 - b2);

  const totBack   = b1 + b2;
  const b1Pct     = totBack > 0 ? b1 / totBack : 0.5;
  const b2Pct     = totBack > 0 ? b2 / totBack : 0.5;
  const backRatio = Math.min(b1, b2) > 0
    ? Math.max(b1, b2) / Math.min(b1, b2)
    : (Math.max(b1, b2) > 0 ? 99 : 1);

  return { t1, t2, b1, b2, l1, l2, prePnl1, prePnl2, totBack, b1Pct, b2Pct, backRatio };
}

/** Pattern accuracy breakdown */
function byPattern(rows) {
  const map = {};
  for (const r of rows) {
    const key = r.pattern || 'NO_SIGNAL';
    if (!map[key]) map[key] = { correct: 0, total: 0 };
    map[key].total++;
    if (r.correct) map[key].correct++;
  }
  return Object.entries(map)
    .map(([pattern, { correct, total }]) => ({
      pattern, correct, total,
      pct: total ? ((correct / total) * 100).toFixed(1) : '—',
    }))
    .sort((a, b) => b.total - a.total);
}

// ── Main ───────────────────────────────────────────────────────────────────
const SEP = '═'.repeat(72);
console.log(`\n${SEP}`);
console.log('  🇪🇺 ETPL / ECS TOSS ALGO — BACKTEST  (Algo v2)');
console.log(`  Dataset: server/data/toss_dataset.json`);
console.log(`  Run at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
console.log(`${SEP}\n`);

// Load dataset
const datasetPath = path.join(__dirname, 'data', 'toss_dataset.json');
if (!fs.existsSync(datasetPath)) {
  console.error('❌ toss_dataset.json not found at', datasetPath);
  process.exit(1);
}
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const allRecords = dataset.records || [];
console.log(`📂 Dataset: ${allRecords.length} total records (v${dataset.version || '?'}, updated ${dataset.updatedAt || '?'})\n`);

// Filter to ETPL/ECS only
const etplRecords = allRecords.filter((r) => {
  const comp = ((r.competitionName || '') + ' ' + (r.matchName || '')).toLowerCase();
  const teams = ((r.team1 || '') + ' ' + (r.team2 || '')).toLowerCase();
  return (
    comp.includes('european') || comp.includes('ecs') ||
    teams.includes('glasgow')   || teams.includes('rotterdam') ||
    teams.includes('amsterdam') || teams.includes('edinburgh') ||
    teams.includes('belfast')   || teams.includes('dublin')
  );
});

console.log(`🏏 ETPL/ECS records found: ${etplRecords.length}`);
const withActual = etplRecords.filter((r) => r.actualWinner && r.status === 'verified');
const pending    = etplRecords.filter((r) => !r.actualWinner || r.status === 'pending');
console.log(`   ✅ Verified (have actual winner): ${withActual.length}`);
console.log(`   ⏳ Pending  (no actual winner):   ${pending.length}\n`);

const rows   = [];
let skipped  = 0;

for (const record of etplRecords) {
  const snap = record.snapshot;
  if (!snap) { skipped++; continue; }

  // Determine actual winner: prefer confirmed field, then infer from settled odds
  const actual = record.actualWinner || inferTossWinner(snap);
  if (!actual) { skipped++; continue; }

  const ctx  = buildCtx(snap);
  const pred = getECSTossPrediction(ctx);

  if (!pred?.winner) { skipped++; continue; }

  const correct       = teamEq(pred.winner, actual);
  const isVerified    = record.status === 'verified' && !!record.actualWinner;
  const wasOldAlgo    = record.predictedWinner;
  const oldWasCorrect = wasOldAlgo ? teamEq(record.predictedWinner, actual) : null;

  rows.push({
    matchId:      record.matchId,
    matchName:    record.matchName,
    competition:  record.competitionName,
    startTime:    record.startTime ? new Date(record.startTime).toLocaleDateString('en-IN') : '?',
    actual,
    predicted:    pred.winner,
    verdictTag:   pred.verdictTag,
    pattern:      pred.pattern,
    reason:       pred.reason,
    isVerified,
    oldPredicted: record.predictedWinner,
    oldWasCorrect,
    ...ctx,
    correct,
  });
}

// ── Summary ───────────────────────────────────────────────────────────────
const verifiedRows = rows.filter((r) => r.isVerified);
const allRowsCount = rows.length;
const correctAll   = rows.filter((r) => r.correct).length;
const correctVer   = verifiedRows.filter((r) => r.correct).length;
const failAll      = allRowsCount - correctAll;
const failVer      = verifiedRows.length - correctVer;

const accAll = allRowsCount ? ((correctAll / allRowsCount) * 100).toFixed(1) : '0.0';
const accVer = verifiedRows.length ? ((correctVer / verifiedRows.length) * 100).toFixed(1) : '0.0';

// Old algo comparison (verified only)
const oldCorrectVer   = verifiedRows.filter((r) => r.oldWasCorrect === true).length;
const oldAccVer       = verifiedRows.length ? ((oldCorrectVer / verifiedRows.length) * 100).toFixed(1) : '0.0';

console.log(SEP);
console.log('  📊 RESULT — ETPL / ECS TOSS ALGO v2');
console.log(SEP);
console.log(`\n  ── All ETPL records (verified + inferred) ──`);
console.log(`  ✅ PASS     : ${correctAll}`);
console.log(`  ❌ FAIL     : ${failAll}`);
console.log(`  📋 TESTED   : ${allRowsCount}  (Skipped/no-signal: ${skipped})`);
console.log(`  🎯 ACCURACY : ${accAll}%`);
console.log(`\n  ── Verified records only (confirmed actual winner) ──`);
console.log(`  ✅ PASS  v2 : ${correctVer} / ${verifiedRows.length}  →  ${accVer}%`);
console.log(`  ✅ PASS old : ${oldCorrectVer} / ${verifiedRows.length}  →  ${oldAccVer}%  (pre-update)`);
console.log(`  📈 IMPROVEMENT : +${(Number(accVer) - Number(oldAccVer)).toFixed(1)}% vs old algo`);
console.log(`\n${SEP}\n`);

// ── Pattern breakdown ─────────────────────────────────────────────────────
if (rows.length) {
  console.log('📈 BREAKDOWN BY PATTERN (all records)\n');
  const colPat = 34, colAcc = 7, colCnt = 12;
  console.log(`${'Pattern'.padEnd(colPat)} ${'Acc'.padStart(colAcc)}  ${'Pass/Total'.padStart(colCnt)}  Bar`);
  console.log('─'.repeat(colPat + colAcc + colCnt + 10));
  for (const p of byPattern(rows)) {
    const filled = p.total > 0 ? Math.round(Number(p.pct) / 10) : 0;
    const bar    = '█'.repeat(filled) + '░'.repeat(10 - filled);
    console.log(
      `${p.pattern.padEnd(colPat)} ${String(p.pct + '%').padStart(colAcc)}  ` +
      `${String(p.correct + '/' + p.total).padStart(colCnt)}  ${bar}`,
    );
  }
  console.log();
}

// ── Per-match table ───────────────────────────────────────────────────────
console.log('📋 MATCH-BY-MATCH DETAIL\n');
console.log(`${'#'.padEnd(3)} ${'Match'.padEnd(42)} ${'Date'.padEnd(10)} ${'Actual'.padEnd(28)} ${'Pred (v2)'.padEnd(28)} ${'Pattern'.padEnd(24)} ${'✓/✗'.padEnd(5)} Δ`);
console.log('─'.repeat(150));

rows.forEach((r, i) => {
  const status  = r.correct ? '✅' : '❌';
  const delta   = r.oldWasCorrect === null ? '  —' :
                  (!r.oldWasCorrect && r.correct) ? '📈 FIX' :
                  (r.oldWasCorrect && !r.correct) ? '📉 REG' : '  ='
  const mName   = r.matchName.length > 42 ? r.matchName.slice(0, 39) + '…' : r.matchName;
  const ver     = r.isVerified ? '' : '(inferred)';
  console.log(
    `${String(i + 1).padEnd(3)} ` +
    `${mName.padEnd(42)} ` +
    `${r.startTime.padEnd(10)} ` +
    `${(r.actual + ' ' + ver).padEnd(28)} ` +
    `${r.predicted.padEnd(28)} ` +
    `${r.pattern.padEnd(24)} ` +
    `${status.padEnd(5)} ${delta}`
  );
});

// ── Failures ──────────────────────────────────────────────────────────────
const fails = rows.filter((r) => !r.correct);
if (fails.length) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`❌ FAILED PREDICTIONS (${fails.length})\n`);
  for (const f of fails) {
    console.log(`  ✗ ${f.matchName}  [${f.matchId}]  ${f.startTime}`);
    console.log(`    v2 Predicted: ${f.predicted}  (${f.verdictTag})`);
    console.log(`    Actual      : ${f.actual}${f.isVerified ? '' : ' (inferred)'}`);
    console.log(`    Reason      : ${f.reason}`);
    console.log(`    Market      : Back ₹${fmtVol(f.b1)} vs ₹${fmtVol(f.b2)}  |  Lay ₹${fmtVol(f.l1)} vs ₹${fmtVol(f.l2)}`);
    console.log(`    PnL         : ${f.prePnl1.toFixed(0)} vs ${f.prePnl2.toFixed(0)}`);
    console.log(`    Load        : ${(f.b1Pct * 100).toFixed(0)}% / ${(f.b2Pct * 100).toFixed(0)}%  |  Ratio: ${f.backRatio.toFixed(1)}x  |  TotBack: ₹${fmtVol(f.totBack)}`);
    console.log();
  }
} else if (allRowsCount > 0) {
  console.log('\n🎯 Zero failures — All ETPL toss predictions correct!\n');
}

// ── Save JSON ─────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, 'etpl_toss_backtest_results.json');
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      algoVersion: 'ECS_TOSS_v2',
      dataset: datasetPath,
      overall: {
        all:      { correct: correctAll,  fail: failAll,  total: allRowsCount, accuracy: accAll },
        verified: { correct: correctVer,  fail: failVer,  total: verifiedRows.length, accuracy: accVer },
        oldAlgo:  { correct: oldCorrectVer, total: verifiedRows.length, accuracy: oldAccVer },
        improvement: `+${(Number(accVer) - Number(oldAccVer)).toFixed(1)}%`,
      },
      byPattern: byPattern(rows),
      failures: fails,
      passes: rows.filter((r) => r.correct),
      all: rows,
    },
    null,
    2,
  ),
);
console.log(`\n💾 Full JSON saved → ${outPath}`);
console.log(`${SEP}\n`);
