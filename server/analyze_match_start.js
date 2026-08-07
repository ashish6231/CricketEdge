/**
 * Analyze ALL ended cricket matches — find patterns at MATCH START that predict winner.
 * Uses only pre-match / first-trade data (not full-match hindsight).
 */
const axios = require('axios');
const fs = require('fs');

const BASE = 'https://tennisliveload.com';

async function fetchMatches() {
  const { data } = await axios.get(`${BASE}/api/cricket/matches`, { timeout: 15000 });
  return (Array.isArray(data) ? data : []).filter(m => m.status === 'ended');
}

async function fetchSnapshot(matchId) {
  try {
    const { data } = await axios.get(`${BASE}/api/cricket/snapshot`, { params: { matchId }, timeout: 25000 });
    return data?.error ? null : data;
  } catch { return null; }
}

function inferWinner(snap) {
  const t1 = snap.teamNames?.[0], t2 = snap.teamNames?.[1];
  const tr1 = snap.teams?.[t1]?.trades || [];
  const tr2 = snap.teams?.[t2]?.trades || [];
  if (!tr1.length && !tr2.length) return null;
  const min1 = tr1.length ? Math.min(...tr1.map(t => t.price)) : 999;
  const min2 = tr2.length ? Math.min(...tr2.map(t => t.price)) : 999;
  if (min1 <= 1.12 && min1 < min2) return t1;
  if (min2 <= 1.12 && min2 < min1) return t2;
  return min1 <= min2 ? t1 : t2;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function firstNTrades(trades, n) {
  const sorted = [...(trades || [])].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  return sorted.slice(0, n);
}

function extractStartMetrics(snap) {
  const t1 = snap.teamNames[0], t2 = snap.teamNames[1];
  const allT1 = snap.teams?.[t1]?.trades || [];
  const allT2 = snap.teams?.[t2]?.trades || [];

  const preVol1 = snap.preMatchVolume?.team1 || {};
  const preVol2 = snap.preMatchVolume?.team2 || {};
  const prePnl1 = snap.preMatchPnl?.team1;
  const prePnl2 = snap.preMatchPnl?.team2;
  const preBets1 = snap.preMatchTotalBets?.team1 ?? 0;
  const preBets2 = snap.preMatchTotalBets?.team2 ?? 0;
  const load1 = snap.matchLoadV2?.team1;
  const load2 = snap.matchLoadV2?.team2;

  const m1 = snap.advancedMetricsV2?.team1 || {};
  const m2 = snap.advancedMetricsV2?.team2 || {};
  const am1 = snap.advancedMetrics?.team1 || {};
  const am2 = snap.advancedMetrics?.team2 || {};

  const first3_1 = firstNTrades(allT1, 3);
  const first3_2 = firstNTrades(allT2, 3);
  const first5_1 = firstNTrades(allT1, 5);
  const first5_2 = firstNTrades(allT2, 5);
  const first10_1 = firstNTrades(allT1, 10);
  const first10_2 = firstNTrades(allT2, 10);

  const preOdds = (trades) => median(trades.map(t => t.price).filter(p => p > 0));
  const preMatchOdds1 = preOdds(first5_1);
  const preMatchOdds2 = preOdds(first5_2);
  const first3Odds1 = preOdds(first3_1);
  const first3Odds2 = preOdds(first3_2);
  const first10Odds1 = preOdds(first10_1);
  const first10Odds2 = preOdds(first10_2);

  const preBack1 = preVol1.back ?? 0, preLay1 = preVol1.lay ?? 0;
  const preBack2 = preVol2.back ?? 0, preLay2 = preVol2.lay ?? 0;
  const preTotal1 = preBack1 + preLay1, preTotal2 = preBack2 + preLay2;

  // Bookie fav pre-match: lower back/lay ratio = more lay = bookie backing team
  const preRatio1 = preLay1 > 0 ? preBack1 / preLay1 : 999;
  const preRatio2 = preLay2 > 0 ? preBack2 / preLay2 : 999;

  const bookieFav = snap.marketSignals?.bookieFavouriteOutcome;
  const msPred = snap.marketSignals?.prediction?.prediction;
  const trap = snap.marketSignals?.trap?.level || 'none';
  const riskTeam = snap.marketSignals?.riskTeam;

  // Derived PL from pre-match volume only (bookie P/L if team wins pre-match)
  const preDerivedPl1 = preLay1 - preBack1 - preBack2 + preLay2; // simplified
  const preDerivedPl2 = preLay2 - preBack2 - preBack1 + preLay1;

  return {
    t1, t2, preMatchOdds1, preMatchOdds2, first3Odds1, first3Odds2, first10Odds1, first10Odds2,
    preBack1, preLay1, preBack2, preLay2, preTotal1, preTotal2, preBets1, preBets2,
    prePnl1, prePnl2, preRatio1, preRatio2, load1, load2,
    bookieFav, msPred, trap, riskTeam,
    preDerivedPl1, preDerivedPl2,
    t1BackPct: am1.backPercentage, t2BackPct: am2.backPercentage,
    v2Back1: m1.back, v2Lay1: m1.lay, v2Back2: m2.back, v2Lay2: m2.lay,
    tradeCount1: allT1.length, tradeCount2: allT2.length,
  };
}

// ─── Start-only prediction strategies ───
const strategies = {
  'Pre-Match Odds (first 5 trades median)': (m) => {
    if (m.preMatchOdds1 == null || m.preMatchOdds2 == null) return null;
    return m.preMatchOdds1 <= m.preMatchOdds2 ? m.t1 : m.t2;
  },
  'Pre-Match Odds (first 3 trades)': (m) => {
    if (m.first3Odds1 == null || m.first3Odds2 == null) return null;
    return m.first3Odds1 <= m.first3Odds2 ? m.t1 : m.t2;
  },
  'Pre-Match Odds (first 10 trades)': (m) => {
    if (m.first10Odds1 == null || m.first10Odds2 == null) return null;
    return m.first10Odds1 <= m.first10Odds2 ? m.t1 : m.t2;
  },
  'Pre-Match Odds gap >= 0.05': (m) => {
    if (m.preMatchOdds1 == null || m.preMatchOdds2 == null) return null;
    if (Math.abs(m.preMatchOdds1 - m.preMatchOdds2) < 0.05) return null;
    return m.preMatchOdds1 <= m.preMatchOdds2 ? m.t1 : m.t2;
  },
  'Pre-Match Odds gap >= 0.08': (m) => {
    if (m.preMatchOdds1 == null || m.preMatchOdds2 == null) return null;
    if (Math.abs(m.preMatchOdds1 - m.preMatchOdds2) < 0.08) return null;
    return m.preMatchOdds1 <= m.preMatchOdds2 ? m.t1 : m.t2;
  },
  'Pre-Match Volume: higher back': (m) => m.preBack1 >= m.preBack2 ? m.t1 : m.t2,
  'Pre-Match Volume: higher lay': (m) => m.preLay1 >= m.preLay2 ? m.t1 : m.t2,
  'Pre-Match Volume: higher total': (m) => m.preTotal1 >= m.preTotal2 ? m.t1 : m.t2,
  'Pre-Match Bets: higher total': (m) => m.preBets1 >= m.preBets2 ? m.t1 : m.t2,
  'Pre-Match PnL: bookie profits if T1 wins': (m) => {
    if (m.prePnl1 == null || m.prePnl2 == null) return null;
    return m.prePnl1 >= m.prePnl2 ? m.t1 : m.t2; // bookie wants team with higher PL to lose?
  },
  'Pre-Match PnL: pick team bookie LOSES less on': (m) => {
    if (m.prePnl1 == null || m.prePnl2 == null) return null;
    // If bookie has negative PL if T1 wins, T1 winning hurts bookie — public on T1? Reverse: pick higher prePnl team
    return m.prePnl1 > m.prePnl2 ? m.t1 : m.t2;
  },
  'Pre-Match back/lay ratio (bookie fav)': (m) => {
    const r1 = m.preRatio1 === 999 ? 999 : m.preRatio1;
    const r2 = m.preRatio2 === 999 ? 999 : m.preRatio2;
    return r1 <= r2 ? m.t1 : m.t2; // lower ratio = lay heavy = bookie team
  },
  'matchLoadV2 higher load': (m) => {
    if (m.load1 == null || m.load2 == null) return null;
    return m.load1 >= m.load2 ? m.t1 : m.t2;
  },
  'matchLoadV2 lower load (contrarian)': (m) => {
    if (m.load1 == null || m.load2 == null) return null;
    return m.load1 <= m.load2 ? m.t1 : m.t2;
  },
  'Bookie Favourite (marketSignals)': (m) => m.bookieFav && m.bookieFav !== 'balanced' ? m.bookieFav : null,
  'Market Signals AI': (m) => m.msPred && m.msPred !== 'No Prediction' ? m.msPred : null,
  'Risk Team (inverse)': (m) => m.riskTeam ? (m.riskTeam === m.t1 ? m.t2 : m.t1) : null,
  'Risk Team (follow)': (m) => m.riskTeam || null,
  'Lower back % (lay heavy)': (m) => (m.t1BackPct ?? 50) <= (m.t2BackPct ?? 50) ? m.t1 : m.t2,
};

function compositeStartAlgo(m) {
  const reasons = [];

  // TRICK 1: Clear pre-match favorite (odds gap >= 0.08) — strongest at start
  if (m.preMatchOdds1 != null && m.preMatchOdds2 != null) {
    const gap = Math.abs(m.preMatchOdds1 - m.preMatchOdds2);
    if (gap >= 0.08) {
      const fav = m.preMatchOdds1 <= m.preMatchOdds2 ? m.t1 : m.t2;
      return { winner: fav, reason: 'Pre-Match Favorite (odds gap ≥8%)', confidence: 'high' };
    }
  }

  // TRICK 2: Smart money — heavy load on one team but other getting lay money (trap at start)
  const mTotal = (m.preBets1 || 0) + (m.preBets2 || 0);
  const t1Load = mTotal > 0 ? m.preBets1 / mTotal : 0.5;
  const t2Load = mTotal > 0 ? m.preBets2 / mTotal : 0.5;
  if (t2Load > 0.70 && m.preLay1 > m.preLay2 && m.preLay1 > m.preBack1) {
    return { winner: m.t1, reason: 'Smart Money Trap (pre-match)', confidence: 'high' };
  }
  if (t1Load > 0.70 && m.preLay2 > m.preLay1 && m.preLay2 > m.preBack2) {
    return { winner: m.t2, reason: 'Smart Money Trap (pre-match)', confidence: 'high' };
  }

  // TRICK 3: Pre-match bookie position — team with lower back/lay ratio (lay dominant)
  if (m.preTotal1 > 100 || m.preTotal2 > 100) {
    const r1 = m.preRatio1 === 999 ? 999 : m.preRatio1;
    const r2 = m.preRatio2 === 999 ? 999 : m.preRatio2;
    if (Math.abs(r1 - r2) > 0.3 && r1 !== 999 && r2 !== 999) {
      return { winner: r1 <= r2 ? m.t1 : m.t2, reason: 'Pre-Match Bookie Lay Signal', confidence: 'moderate' };
    }
  }

  // TRICK 4: matchLoadV2 — if one team >65% load, fade the public (contrarian)
  if (m.load1 != null && m.load2 != null) {
    const loadTotal = m.load1 + m.load2;
    const l1pct = loadTotal > 0 ? m.load1 / loadTotal : 0.5;
    if (l1pct > 0.65) return { winner: m.t2, reason: 'Fade Heavy Load (T1 overloaded)', confidence: 'moderate' };
    if (l1pct < 0.35) return { winner: m.t1, reason: 'Fade Heavy Load (T2 overloaded)', confidence: 'moderate' };
  }

  // TRICK 5: Pre-match odds any gap
  if (m.preMatchOdds1 != null && m.preMatchOdds2 != null) {
    const gap = Math.abs(m.preMatchOdds1 - m.preMatchOdds2);
    if (gap >= 0.03) {
      return { winner: m.preMatchOdds1 <= m.preMatchOdds2 ? m.t1 : m.t2, reason: 'Pre-Match Odds (small gap)', confidence: 'moderate' };
    }
  }

  // TRICK 6: Market signals
  if (m.msPred && m.msPred !== 'No Prediction') {
    return { winner: m.msPred, reason: 'Market Signals AI', confidence: 'moderate' };
  }
  if (m.bookieFav && m.bookieFav !== 'balanced') {
    return { winner: m.bookieFav, reason: 'Bookie Favourite', confidence: 'low' };
  }

  // Fallback: first 5 trades odds
  if (m.preMatchOdds1 != null && m.preMatchOdds2 != null) {
    return { winner: m.preMatchOdds1 <= m.preMatchOdds2 ? m.t1 : m.t2, reason: 'Pre-Match Odds Fallback', confidence: 'low' };
  }

  return { winner: null, reason: 'Insufficient pre-match data', confidence: 'none' };
}

(async () => {
  console.log('Fetching all ended cricket matches...\n');
  const matches = await fetchMatches();
  console.log(`Found ${matches.length} ended matches\n`);

  const results = [];
  const stratScores = {};
  for (const name of Object.keys(strategies)) stratScores[name] = { correct: 0, total: 0, skipped: 0 };
  let compositeCorrect = 0, compositeTotal = 0;

  for (const match of matches) {
    const snap = await fetchSnapshot(match.matchId);
    if (!snap?.teamNames?.length) continue;

    const actual = inferWinner(snap);
    if (!actual) continue;

    const m = extractStartMetrics(snap);
    results.push({ matchId: match.matchId, matchName: match.matchName, actual, metrics: m });

    for (const [name, fn] of Object.entries(strategies)) {
      const pred = fn(m);
      if (pred == null) { stratScores[name].skipped++; continue; }
      stratScores[name].total++;
      if (pred === actual) stratScores[name].correct++;
    }

    const comp = compositeStartAlgo(m);
    if (comp.winner) {
      compositeTotal++;
      if (comp.winner === actual) compositeCorrect++;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log('='.repeat(72));
  console.log('STRATEGY ACCURACY (match-start signals only)');
  console.log('='.repeat(72));
  const ranked = Object.entries(stratScores)
    .filter(([, s]) => s.total > 0)
    .map(([name, s]) => ({ name, acc: s.correct / s.total * 100, ...s }))
    .sort((a, b) => b.acc - a.acc || b.total - a.total);

  for (const s of ranked) {
    console.log(`  ${s.acc.toFixed(1).padStart(5)}% (${s.correct}/${s.total}, skip ${s.skipped}) — ${s.name}`);
  }

  console.log('\n' + '='.repeat(72));
  console.log(`COMPOSITE START ALGO: ${compositeCorrect}/${compositeTotal} = ${(compositeCorrect / compositeTotal * 100).toFixed(1)}%`);
  console.log('='.repeat(72));

  console.log('\nPer-match composite predictions:');
  for (const r of results) {
    const comp = compositeStartAlgo(r.metrics);
    const ok = comp.winner === r.actual;
    console.log(`  ${ok ? '✅' : '❌'} ${r.matchName.slice(0, 40).padEnd(40)} | ${comp.reason?.slice(0, 35).padEnd(35)} → pred: ${comp.winner?.slice(0, 20)} | actual: ${r.actual?.slice(0, 20)}`);
  }

  fs.writeFileSync('match_start_analysis.json', JSON.stringify({ results, stratScores, composite: { correct: compositeCorrect, total: compositeTotal } }, null, 2));
  console.log('\nSaved match_start_analysis.json');
})();
