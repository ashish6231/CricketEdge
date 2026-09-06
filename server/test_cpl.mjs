import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { predictMatchWinner } from './utils/matchWinnerPredictor.js';
import { isWomenMatch } from './utils/leagueAlgorithms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const matchDatasetPath = path.join(__dirname, 'data/match_dataset.json');
const tossDatasetPath = path.join(__dirname, 'data/toss_dataset.json');

const datasetFile = fs.existsSync(matchDatasetPath) ? matchDatasetPath : tossDatasetPath;
const d = JSON.parse(fs.readFileSync(datasetFile, 'utf8'));
const records = d.records || [];

const allCpl = records.filter(r => {
  const c = ((r.competitionName||'') + ' ' + (r.matchName||'')).toLowerCase();
  const teams = ((r.team1||'') + ' ' + (r.team2||'')).toLowerCase();
  return c.includes('caribbean') || c.includes('cpl') ||
    teams.includes('trinbago') || teams.includes('guyana') ||
    teams.includes('barbados') || teams.includes('jamaica') ||
    teams.includes('st lucia') || teams.includes('st. lucia') ||
    teams.includes('antigua') || teams.includes('st kitts') ||
    teams.includes('st. kitts');
});

// Separate Men and Women
const menCpl = allCpl.filter(r => !isWomenMatch(r.competitionName, r.team1, r.team2));
const womenCpl = allCpl.filter(r => isWomenMatch(r.competitionName, r.team1, r.team2));

function isMatchOk(predName, actualName) {
  if (!predName || !actualName) return false;
  const p = predName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = actualName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (p.includes(a) || a.includes(p)) return true;
  if ((a.includes('falco') || a.includes('falcs')) && (p.includes('falco') || p.includes('falcs'))) return true;
  if ((a.includes('patriot') || a.includes('pats')) && (p.includes('patriot') || p.includes('pats'))) return true;
  return false;
}

const SEP = '═'.repeat(95);

function runBacktest(matches, title, leagueTag) {
  console.log(`\n${SEP}`);
  console.log(`  🏆 ${title.toUpperCase()} BACKTEST REPORT`);
  console.log(`  Dataset: ${path.basename(datasetFile)} | Total Records: ${matches.length}`);
  console.log(`${SEP}\n`);

  let pass = 0, fail = 0;
  const results = [];

  for (const r of matches) {
    const snap = r.snapshot;
    if (!snap) continue;

    const actual = r.actualWinner;
    if (!actual) continue;

    if (!snap.competitionName) snap.competitionName = r.competitionName || leagueTag;

    const pred = predictMatchWinner(snap, r.competitionName || leagueTag);
    const ok = isMatchOk(pred?.winner, actual);

    if (ok) pass++; else fail++;

    results.push({
      matchId: r.matchId,
      matchName: r.matchName || `${r.team1} v ${r.team2}`,
      date: r.startTime ? new Date(r.startTime).toLocaleDateString('en-IN') : '?',
      actual,
      predicted: pred?.winner || 'NO SIGNAL',
      confidence: pred?.confidence || '—',
      tier: pred?.tier || '—',
      ok,
    });
  }

  const COL_M = 46, COL_T = 26, COL_C = 36;
  console.log(
    `${'#'.padEnd(3)} ${'Match'.padEnd(COL_M)} ${'Date'.padEnd(10)} ` +
    `${'Actual Winner'.padEnd(COL_T)} ${'Predicted'.padEnd(COL_T)} ${'Confidence / Tier'.padEnd(COL_C)} Result`
  );
  console.log('─'.repeat(COL_M + COL_T * 2 + COL_C + 30));

  results.forEach((r, i) => {
    const mName = r.matchName.length > COL_M ? r.matchName.slice(0, COL_M - 1) + '…' : r.matchName;
    console.log(
      `${String(i + 1).padEnd(3)} ` +
      `${mName.padEnd(COL_M)} ` +
      `${r.date.padEnd(10)} ` +
      `${r.actual.padEnd(COL_T)} ` +
      `${r.predicted.padEnd(COL_T)} ` +
      `${r.confidence.padEnd(COL_C)} ` +
      `${r.ok ? '✅ PASS' : '❌ FAIL'}`
    );
  });

  console.log(`\n${SEP}`);
  console.log(`  📊 ${title} SUMMARY`);
  console.log(`  ✅ PASS : ${pass}`);
  console.log(`  ❌ FAIL : ${fail}`);
  console.log(`  📋 TOTAL: ${pass + fail}`);
  console.log(`  🎯 ACCURACY: ${pass + fail > 0 ? ((pass / (pass + fail)) * 100).toFixed(1) : '0.0'}%`);
  console.log(`${SEP}\n`);

  const fails = results.filter(r => !r.ok);
  if (fails.length) {
    console.log(`❌ FAILED PREDICTIONS (${fails.length})\n`);
    for (const f of fails) {
      console.log(`  ✗ [${f.matchId}] ${f.matchName}`);
      console.log(`    Actual   : ${f.actual}`);
      console.log(`    Predicted: ${f.predicted}  (${f.confidence})`);
    }
    console.log();
  }
}

// 1. Run Men's CPL Backtest
runBacktest(menCpl, "Men's Caribbean Premier League (CPL)", "Caribbean Premier League");

// 2. Run Women's CPL Backtest
runBacktest(womenCpl, "Women's Caribbean Premier League (WCPL)", "Women's Caribbean Premier League");
