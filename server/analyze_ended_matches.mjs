/**
 * Analyze ended cricket matches for common winner factors.
 * Winner label (user rule): lower last-5 odds side.
 *
 *   node server/analyze_ended_matches.mjs
 */
import axios from 'axios';
import { getBookiePl, splitMatchOutcomes } from '../frontend/src/utils/bookiePl.js';

const BASE = process.env.SCRAPER_BASE || 'https://tennisliveload.com';
const SLEEP_MS = Number(process.env.BACKTEST_SLEEP_MS || 120);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function median(arr) {
  const a = arr.filter((x) => x > 0).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
}
function firstOdds(trades, n = 5) {
  if (!trades?.length) return null;
  const early = [...trades].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0)).slice(0, Math.min(n, trades.length));
  return median(early.map((t) => t.price));
}
function lastOdds(trades, n = 5) {
  if (!trades?.length) return null;
  const late = [...trades].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0)).slice(-Math.min(n, trades.length));
  return median(late.map((t) => t.price));
}
function teamEq(a, b) {
  const na = (a || '').trim().toLowerCase();
  const nb = (b || '').trim().toLowerCase();
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
}
function pickLower(o1, o2, t1, t2) {
  if (o1 == null || o2 == null || o1 === o2) return null;
  return o1 < o2 ? t1 : t2;
}
function opposite(name, t1, t2) {
  return teamEq(name, t1) ? t2 : teamEq(name, t2) ? t1 : null;
}

function score(rows, label, pickFn) {
  let hit = 0;
  let n = 0;
  for (const r of rows) {
    const p = pickFn(r);
    if (!p) continue;
    n++;
    if (teamEq(p, r.winner)) hit++;
  }
  return { label, hit, n, pct: n ? +(100 * hit / n).toFixed(1) : 0 };
}

async function main() {
  const { data: list } = await axios.get(`${BASE}/api/cricket/matches`, { timeout: 25000 });
  const matches = (Array.isArray(list) ? list : list.matches || [])
    .filter((m) => m.status === 'ended' && (m.totalMatched || 0) > 0);

  const rows = [];
  for (const m of matches) {
    try {
      const { data: s } = await axios.get(`${BASE}/api/cricket/snapshot`, {
        params: { matchId: m.matchId },
        timeout: 25000,
      });
      if (!s || s.error) continue;
      const { t1, t2 } = splitMatchOutcomes(s.teamNames);
      const tr1 = s.teams?.[t1]?.trades || [];
      const tr2 = s.teams?.[t2]?.trades || [];
      if (!tr1.length || !tr2.length) continue;

      const last1 = lastOdds(tr1, 5);
      const last2 = lastOdds(tr2, 5);
      const winner = pickLower(last1, last2, t1, t2);
      if (!winner) continue;

      const pre1 = firstOdds(tr1);
      const pre2 = firstOdds(tr2);
      const { pl1, pl2 } = getBookiePl(s, t1, t2);
      const m1 = s.advancedMetricsV2?.team1 || {};
      const m2 = s.advancedMetricsV2?.team2 || {};
      const r1 = (m1.lay || 0) > 0 ? (m1.back || 0) / m1.lay : null;
      const r2 = (m2.lay || 0) > 0 ? (m2.back || 0) / m2.lay : null;
      const moreBetted = s.marketSignals?.moreBettedTeam;

      rows.push({
        id: m.matchId,
        name: m.matchName,
        winner,
        t1,
        t2,
        preFav: pickLower(pre1, pre2, t1, t2),
        fadePublic: moreBetted ? opposite(moreBetted, t1, t2) : null,
        plGreen: pl1 != null && pl2 != null && pl1 !== pl2 ? (pl1 > pl2 ? t1 : t2) : null,
        lowerRatio: r1 != null && r2 != null && r1 !== r2 ? (r1 < r2 ? t1 : t2) : null,
        bookieFav: s.marketSignals?.bookieFavouriteOutcome,
        msPred: s.marketSignals?.prediction?.prediction,
      });
    } catch { /* skip */ }
    await sleep(SLEEP_MS);
  }

  const signals = [
    score(rows, 'Fade moreBetted', (r) => r.fadePublic),
    score(rows, 'PL green', (r) => r.plGreen),
    score(rows, 'Lower B/L ratio', (r) => r.lowerRatio),
    score(rows, 'Pre-match odds fav', (r) => r.preFav),
    score(rows, 'Bookie fav', (r) => (r.bookieFav && r.bookieFav !== 'balanced' ? r.bookieFav : null)),
    score(rows, 'MS prediction', (r) => (r.msPred && r.msPred !== 'No Prediction' ? r.msPred : null)),
    score(rows, 'FadePublic + PL green', (r) => (
      r.fadePublic && r.plGreen && teamEq(r.fadePublic, r.plGreen) ? r.fadePublic : null
    )),
    score(rows, 'FadePublic + lower B/L', (r) => (
      r.fadePublic && r.lowerRatio && teamEq(r.fadePublic, r.lowerRatio) ? r.fadePublic : null
    )),
    score(rows, 'PL green + lower B/L', (r) => (
      r.plGreen && r.lowerRatio && teamEq(r.plGreen, r.lowerRatio) ? r.plGreen : null
    )),
  ].sort((a, b) => b.pct - a.pct || b.n - a.n);

  console.log(`\nEnded matches analyzed: ${rows.length}`);
  console.log('Winner label: lower last-5 odds\n');
  for (const s of signals) {
    if (s.n < 5) continue;
    console.log(`${String(s.pct).padStart(5)}%  ${String(s.hit).padStart(2)}/${String(s.n).padStart(2)}  ${s.label}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
