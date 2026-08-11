/**
 * Backtest tossPredictor.js on ALL ended toss matches.
 * Run after any rule change:  node server/backtest_toss.mjs
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { predictTossWinner } from '../frontend/src/utils/tossPredictor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SCRAPER_BASE || 'https://tennisliveload.com';
const SLEEP_MS = Number(process.env.BACKTEST_SLEEP_MS || 150);

/** Confirmed toss winners (manual) — prefer over min-odds inference */
const CONFIRMED_ACTUAL = {
  '35896815': 'Galle Marvels',
  '35891017': 'Madurai Panthers',
  '35898104': 'Welsh Fire W',
  '35891019': 'Chepauk Super Gillies',
  '35896816': 'Colombo Kaps',
  '35898055': 'Welsh Fire',
  '35894891': 'Trent Rockets W',
  '35894895': 'Trent Rockets',
  '35902018': 'London Spirit W',
  '35891022': 'Salem Spartans',
  '35902022': 'MI London',
  '35904757': 'Nellai Royal Kings',
  '35904760': 'Tiruppur Tamizhans',
  '35905512': 'Sunrisers Leeds W',
  // Aug 11-12 2026 failures — added after algo update
  '35920148': 'Manchester Super Giants', // Manchester vs Sunrisers Leeds — Manchester won toss
  '35920051': 'Tiruppur Tamizhans',      // Lyca vs Tiruppur — Tiruppur won toss (Lyca haari)
  '35916520': 'Salem Spartans',          // Salem vs Madurai — Salem won (15% load, both zero lay)
  '35916620': 'Trent Rockets W',         // Trent W vs Southern Brave W — Trent won (gap=1)
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normTeam(s) {
  return (s || '').trim().toLowerCase();
}

function teamEq(a, b) {
  const na = normTeam(a);
  const nb = normTeam(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Infer toss winner from settled market (min odds ≈ winner). */
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

async function fetchMatches() {
  const { data } = await axios.get(`${BASE}/api/toss/matches`, { timeout: 20000 });
  return Array.isArray(data) ? data : [];
}

async function fetchSnapshot(matchId) {
  try {
    const { data } = await axios.get(`${BASE}/api/toss/snapshot`, {
      params: { matchId },
      timeout: 25000,
    });
    return data?.error ? null : data;
  } catch {
    return null;
  }
}

function summarizeByReason(rows) {
  const map = {};
  for (const r of rows) {
    const key = r.reason || 'Unknown';
    if (!map[key]) map[key] = { correct: 0, total: 0 };
    map[key].total++;
    if (r.correct) map[key].correct++;
  }
  return Object.entries(map)
    .map(([reason, { correct, total }]) => ({
      reason,
      correct,
      total,
      pct: total ? ((correct / total) * 100).toFixed(1) : '—',
    }))
    .sort((a, b) => b.total - a.total);
}

(async () => {
  console.log(`\n${'='.repeat(72)}`);
  console.log('TOSS PREDICTOR BACKTEST — all ended matches');
  console.log(`Source: ${BASE} | ${new Date().toISOString()}`);
  console.log(`${'='.repeat(72)}\n`);

  const matches = await fetchMatches();
  const ended = matches.filter(
    (m) => m.status === 'ended' && (m.totalMatched || 0) > 0,
  );

  console.log(`Total toss matches: ${matches.length} | Ended with data: ${ended.length}\n`);

  const rows = [];
  let skipped = 0;

  for (const m of ended) {
    const snap = await fetchSnapshot(m.matchId);
    await sleep(SLEEP_MS);
    if (!snap?.teamNames?.length) {
      skipped++;
      process.stdout.write('x');
      continue;
    }

    const actual = inferTossWinner(snap);
    const pred = predictTossWinner(snap);
    if (!actual || !pred?.winnerName) {
      skipped++;
      process.stdout.write('?');
      continue;
    }

    const correct = teamEq(pred.winnerName, actual);
    rows.push({
      matchId: m.matchId,
      matchName: m.matchName,
      competition: m.competitionName,
      actual,
      predicted: pred.winnerName,
      reason: pred.reason,
      pattern: pred.pattern,
      correct,
    });
    process.stdout.write(correct ? '.' : 'F');
  }

  const correctN = rows.filter((r) => r.correct).length;
  const totalN = rows.length;
  const acc = totalN ? ((correctN / totalN) * 100).toFixed(1) : '0.0';

  console.log(`\n\nOverall: ${correctN}/${totalN} (${acc}%) | Skipped: ${skipped}\n`);

  console.log('By reason:');
  for (const s of summarizeByReason(rows)) {
    console.log(`  ${s.pct.padStart(5)}% (${s.correct}/${s.total}) — ${s.reason}`);
  }

  const fails = rows.filter((r) => !r.correct);
  if (fails.length) {
    console.log(`\nFailures (${fails.length}):`);
    for (const f of fails) {
      console.log(`  ✗ ${f.matchName}`);
      console.log(`    Pred: ${f.predicted} (${f.reason}) | Actual: ${f.actual}`);
    }
  } else {
    console.log('\nNo failures 🎯');
  }

  const outPath = path.join(__dirname, 'toss_backtest_results.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        overall: { correct: correctN, total: totalN, accuracy: acc },
        byReason: summarizeByReason(rows),
        failures: fails,
        all: rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nSaved: ${outPath}\n`);

  // ── Confirmed toss winners (manual ACTUAL map) ──
  console.log(`${'='.repeat(72)}`);
  console.log('CONFIRMED TOSS WINNERS (manual ACTUAL map)');
  console.log(`${'='.repeat(72)}\n`);

  const confirmedRows = [];
  for (const [matchId, actual] of Object.entries(CONFIRMED_ACTUAL)) {
    const snap = await fetchSnapshot(matchId);
    await sleep(SLEEP_MS);
    if (!snap?.teamNames?.length) {
      console.log(`  ? skip ${matchId} — no snapshot`);
      continue;
    }
    const pred = predictTossWinner(snap);
    const correct = teamEq(pred?.winnerName, actual);
    confirmedRows.push({
      matchId,
      matchName: snap.matchName,
      actual,
      predicted: pred?.winnerName,
      reason: pred?.reason,
      risk: pred?.risk?.tier,
      matchedRules: pred?.matchedRules?.length ?? 0,
      correct,
    });
    process.stdout.write(correct ? '.' : 'F');
  }

  const cOk = confirmedRows.filter((r) => r.correct).length;
  const cTotal = confirmedRows.length;
  console.log(`\n\nConfirmed: ${cOk}/${cTotal} (${cTotal ? ((cOk / cTotal) * 100).toFixed(1) : 0}%)\n`);

  const cFails = confirmedRows.filter((r) => !r.correct);
  if (cFails.length) {
    for (const f of cFails) {
      console.log(`  ✗ ${f.matchName} — pred ${f.predicted} (${f.reason}) | actual ${f.actual}`);
    }
  } else {
    console.log('All confirmed tosses pass 🎯');
  }
  console.log('');
})();
