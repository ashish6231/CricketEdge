/**
 * Backtest toss prediction strategies against known actual winners.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ACTUAL = {
  '35896815': 'Galle Marvels',
  '35883428': null, // called off
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
};

const BASE = 'https://tennisliveload.com';

async function fetchSnapshot(matchId) {
  const { data } = await axios.get(`${BASE}/api/toss/snapshot`, { params: { matchId }, timeout: 15000 });
  return data;
}

function getMetrics(snap) {
  const t1 = snap.teamNames[0], t2 = snap.teamNames[1];
  const m1 = snap.advancedMetricsV2?.team1 || {};
  const m2 = snap.advancedMetricsV2?.team2 || {};
  const s1 = snap.syntheticSupport?.teamA || {};
  const s2 = snap.syntheticSupport?.teamB || {};
  const t1Trades = snap.teams?.[t1]?.trades || [];
  const t2Trades = snap.teams?.[t2]?.trades || [];
  const t1LayCount = t1Trades.filter(t => t.type === 'lay').length;
  const t2LayCount = t2Trades.filter(t => t.type === 'lay').length;

  const t1Back = m1.back ?? 0, t2Back = m2.back ?? 0;
  const t1LayVol = m1.lay ?? 0, t2LayVol = m2.lay ?? 0;
  const t1Total = m1.totalBet ?? 0, t2Total = m2.totalBet ?? 0;
  const mTotal = t1Total + t2Total;
  const t1LoadPct = mTotal > 0 ? t1Total / mTotal : 0.5;
  const t2LoadPct = mTotal > 0 ? t2Total / mTotal : 0.5;
  const t1LayTrades = s1.tradeCount ?? t1LayCount;
  const t2LayTrades = s2.tradeCount ?? t2LayCount;
  const bookieFav = snap.marketSignals?.bookieFavouriteOutcome;
  const trap = snap.marketSignals?.trap?.level || 'none';
  const loadDiff = Math.abs(t1LoadPct - t2LoadPct);

  return { t1, t2, t1Back, t2Back, t1LayVol, t2LayVol, t1Total, t2Total, mTotal,
    t1LoadPct, t2LoadPct, t1LayTrades, t2LayTrades, t1LayCount, t2LayCount, bookieFav, trap, loadDiff };
}

function pick(m, team) {
  if (team === 't1') return m.t1;
  if (team === 't2') return m.t2;
  return team;
}

const strategies = {
  'MatchDetail (current)': (m) => {
    if (m.mTotal <= 0) return null;
    const t1IsTrap = m.t2LoadPct > 0.74 && m.t1LayVol > m.t2LayVol && m.t1LayVol > m.t1Back;
    const t2IsTrap = m.t1LoadPct > 0.74 && m.t2LayVol > m.t1LayVol && m.t2LayVol > m.t2Back;
    const t1ZeroLay = m.t2LayVol === 0 && m.t1LayVol > 0 && m.t2LoadPct <= 0.75;
    const t2ZeroLay = m.t1LayVol === 0 && m.t2LayVol > 0 && m.t1LoadPct <= 0.75;
    if (t1IsTrap || t1ZeroLay) return m.t1;
    if (t2IsTrap || t2ZeroLay) return m.t2;
    if (m.t1LayTrades > m.t2LayTrades) return m.t1;
    if (m.t2LayTrades > m.t1LayTrades) return m.t2;
    if (m.t1LayVol > m.t2LayVol) return m.t1;
    if (m.t2LayVol > m.t1LayVol) return m.t2;
    return null;
  },
  'Bookie Favourite': (m) => m.bookieFav && m.bookieFav !== 'balanced' ? m.bookieFav : null,
  'Higher Lay Trades': (m) => {
    if (m.t1LayTrades > m.t2LayTrades) return m.t1;
    if (m.t2LayTrades > m.t1LayTrades) return m.t2;
    return null;
  },
  'Fewer Lay Trades': (m) => {
    if (m.t1LayTrades < m.t2LayTrades) return m.t1;
    if (m.t2LayTrades < m.t1LayTrades) return m.t2;
    return null;
  },
  'Higher Load': (m) => m.t1Total >= m.t2Total ? m.t1 : m.t2,
  'Lower Load (underdog)': (m) => m.t1Total <= m.t2Total ? m.t1 : m.t2,
  'Higher Lay Vol': (m) => {
    if (m.t1LayVol > m.t2LayVol) return m.t1;
    if (m.t2LayVol > m.t1LayVol) return m.t2;
    return null;
  },
  // OPTIMIZED: traps first, then balanced-load uses bookie fav, else lay trades
  'Optimized V4': (m) => {
    if (m.mTotal <= 0) return null;
    const t1IsTrap = m.t2LoadPct > 0.74 && m.t1LayVol > m.t2LayVol && m.t1LayVol > m.t1Back;
    const t2IsTrap = m.t1LoadPct > 0.74 && m.t2LayVol > m.t1LayVol && m.t2LayVol > m.t2Back;
    const t1ZeroLay = m.t2LayVol === 0 && m.t1LayVol > 0 && m.t2LoadPct <= 0.75;
    const t2ZeroLay = m.t1LayVol === 0 && m.t2LayVol > 0 && m.t1LoadPct <= 0.75;
    if (t1IsTrap || t1ZeroLay) return m.t1;
    if (t2IsTrap || t2ZeroLay) return m.t2;
    // High trap + bookie fav underdog pattern (Salem case: ~70% load on favorite, bookie fav underdog)
    if (m.trap === 'high' && m.bookieFav && m.bookieFav !== 'balanced') {
      const favIsT1 = m.bookieFav === m.t1;
      const favIsT2 = m.bookieFav === m.t2;
      const favLoadPct = favIsT1 ? m.t1LoadPct : favIsT2 ? m.t2LoadPct : 0.5;
      if (favLoadPct < 0.45) return m.bookieFav; // bookie fav is underdog
    }
    // Balanced load (<12% diff): trust bookie favourite
    if (m.loadDiff < 0.12 && m.bookieFav && m.bookieFav !== 'balanced') return m.bookieFav;
    // Default: higher lay trades, then lay vol
    if (m.t1LayTrades > m.t2LayTrades) return m.t1;
    if (m.t2LayTrades > m.t1LayTrades) return m.t2;
    if (m.t1LayVol > m.t2LayVol) return m.t1;
    if (m.t2LayVol > m.t1LayVol) return m.t2;
    return m.bookieFav !== 'balanced' ? m.bookieFav : null;
  },
  // Variant: traps + bookie fav when trap high + else lay trades
  'Trap + Bookie Fav': (m) => {
    if (m.mTotal <= 0) return null;
    const t1IsTrap = m.t2LoadPct > 0.74 && m.t1LayVol > m.t2LayVol && m.t1LayVol > m.t1Back;
    const t2IsTrap = m.t1LoadPct > 0.74 && m.t2LayVol > m.t1LayVol && m.t2LayVol > m.t2Back;
    const t1ZeroLay = m.t2LayVol === 0 && m.t1LayVol > 0 && m.t2LoadPct <= 0.75;
    const t2ZeroLay = m.t1LayVol === 0 && m.t2LayVol > 0 && m.t1LoadPct <= 0.75;
    if (t1IsTrap || t1ZeroLay) return m.t1;
    if (t2IsTrap || t2ZeroLay) return m.t2;
    if (m.trap === 'high' && m.bookieFav && m.bookieFav !== 'balanced') return m.bookieFav;
    if (m.t1LayTrades > m.t2LayTrades) return m.t1;
    if (m.t2LayTrades > m.t1LayTrades) return m.t2;
    if (m.t1LayVol > m.t2LayVol) return m.t1;
    if (m.t2LayVol > m.t1LayVol) return m.t2;
    return null;
  },
};

(async () => {
  const matchIds = Object.keys(ACTUAL);
  const snaps = {};
  for (const id of matchIds) {
    snaps[id] = await fetchSnapshot(id);
    await new Promise(r => setTimeout(r, 150));
  }

  const valid = matchIds.filter(id => ACTUAL[id] !== null);
  console.log(`\nBacktesting ${valid.length} matches (Ireland skipped - called off)\n`);

  const scores = {};
  for (const [name] of Object.entries(strategies)) {
    scores[name] = { correct: 0, total: 0, wrong: [] };
  }

  for (const id of valid) {
    const snap = snaps[id];
    if (!snap?.teamNames) continue;
    const m = getMetrics(snap);
    const actual = ACTUAL[id];
    const matchName = snap.matchName;

    for (const [name, fn] of Object.entries(strategies)) {
      const pred = fn(m);
      if (!pred) continue;
      scores[name].total++;
      if (pred === actual) {
        scores[name].correct++;
      } else {
        scores[name].wrong.push(`${matchName}: pred=${pred}, actual=${actual}`);
      }
    }
  }

  console.log('STRATEGY ACCURACY:\n');
  const sorted = Object.entries(scores)
    .map(([name, s]) => ({ name, pct: s.total ? (s.correct / s.total * 100) : 0, ...s }))
    .sort((a, b) => b.pct - a.pct);

  for (const s of sorted) {
    console.log(`${s.name.padEnd(30)} ${s.correct}/${s.total} = ${s.pct.toFixed(1)}%`);
    if (s.wrong.length) console.log(`  Wrong: ${s.wrong.join(' | ')}`);
  }

  // Per-match detail for best strategy
  const best = sorted[0];
  console.log(`\nBest: ${best.name} at ${best.pct.toFixed(1)}%`);

  // Detailed per-match for Optimized V4
  console.log('\n\nOptimized V4 per-match:');
  for (const id of valid) {
    const snap = snaps[id];
    const m = getMetrics(snap);
    const pred = strategies['Optimized V4'](m);
    const actual = ACTUAL[id];
    const ok = pred === actual ? '✅' : '❌';
    console.log(`${ok} ${snap.matchName}: pred=${pred} actual=${actual}`);
  }
})();
