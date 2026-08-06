/**
 * Analyze ALL ended cricket matches — odds vs winner + build match winner algo
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'https://tennisliveload.com';

async function fetchMatches() {
  const { data } = await axios.get(`${BASE}/api/cricket/matches`, { timeout: 15000 });
  return (Array.isArray(data) ? data : []).filter(m => m.status === 'ended' && (m.totalMatched || 0) > 500);
}

async function fetchSnapshot(matchId) {
  try {
    const { data } = await axios.get(`${BASE}/api/cricket/snapshot`, { params: { matchId }, timeout: 20000 });
    return data?.error ? null : data;
  } catch { return null; }
}

function inferWinnerFromOdds(snap) {
  const t1 = snap.teamNames?.[0], t2 = snap.teamNames?.[1];
  if (!t1 || !t2) return null;

  const getOdds = (team) => {
    const trades = snap.teams?.[team]?.trades || [];
    if (!trades.length) return { min: 999, max: 0, last: null, last5min: null };
    const prices = trades.map(t => t.price).filter(p => p > 0);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const last = trades[trades.length - 1]?.price;
    // Last 5 min trades (by updatedAt if available)
    const cutoff = Date.now() - 5 * 60 * 1000;
    const recent = trades.filter(t => !t.updatedAt || t.updatedAt > cutoff);
    const recentMin = recent.length ? Math.min(...recent.map(t => t.price)) : min;
    return { min, max, last, recentMin, tradeCount: trades.length };
  };

  const o1 = getOdds(t1), o2 = getOdds(t2);

  // Winner = team whose min odds dropped closest to 1.0 (Betfair settled)
  let winner = null;
  if (o1.min <= 1.10 && o1.min < o2.min) winner = t1;
  else if (o2.min <= 1.10 && o2.min < o1.min) winner = t2;
  else if (o1.min <= 1.15 && o2.min <= 1.15) winner = o1.min <= o2.min ? t1 : t2;
  else winner = o1.min < o2.min ? t1 : t2; // fallback: lower min odds

  return { winner, t1: { name: t1, ...o1 }, t2: { name: t2, ...o2 } };
}

function extractMatchMetrics(snap) {
  const t1 = snap.teamNames[0], t2 = snap.teamNames[1];
  const m1 = snap.advancedMetricsV2?.team1 || {}, m2 = snap.advancedMetricsV2?.team2 || {};
  const s1 = snap.syntheticSupport?.teamA || {}, s2 = snap.syntheticSupport?.teamB || {};
  const am1 = snap.advancedMetrics?.team1 || {}, am2 = snap.advancedMetrics?.team2 || {};

  const t1Trades = snap.teams?.[t1]?.trades || [];
  const t2Trades = snap.teams?.[t2]?.trades || [];

  const getOdds = (trades) => {
    if (!trades.length) return { min: 999, last: null, first: null };
    const prices = trades.map(t => t.price);
    return { min: Math.min(...prices), last: trades[trades.length-1]?.price, first: trades[0]?.price };
  };

  const o1 = getOdds(t1Trades), o2 = getOdds(t2Trades);

  const t1Back = m1.back ?? 0, t2Back = m2.back ?? 0;
  const t1Lay = m1.lay ?? 0, t2Lay = m2.lay ?? 0;
  const t1Total = m1.totalBet ?? 0, t2Total = m2.totalBet ?? 0;
  const mTotal = t1Total + t2Total;
  const t1LoadPct = mTotal > 0 ? t1Total / mTotal : 0.5;
  const t2LoadPct = mTotal > 0 ? t2Total / mTotal : 0.5;
  const t1LayTrades = s1.tradeCount ?? t1Trades.filter(t => t.type === 'lay').length;
  const t2LayTrades = s2.tradeCount ?? t2Trades.filter(t => t.type === 'lay').length;

  const bookieFav = snap.marketSignals?.bookieFavouriteOutcome;
  const msPred = snap.marketSignals?.prediction?.prediction;
  const trap = snap.marketSignals?.trap?.level || 'none';

  // Pre-match odds from first trades
  const preMatchOdds1 = t1Trades.length ? t1Trades.slice(0, 5).reduce((s,t)=>s+t.price,0)/Math.min(5,t1Trades.length) : null;
  const preMatchOdds2 = t2Trades.length ? t2Trades.slice(0, 5).reduce((s,t)=>s+t.price,0)/Math.min(5,t2Trades.length) : null;

  return {
    t1, t2, o1, o2, t1Back, t2Back, t1Lay, t2Lay, t1Total, t2Total, mTotal,
    t1LoadPct, t2LoadPct, t1LayTrades, t2LayTrades, bookieFav, msPred, trap,
    preMatchOdds1, preMatchOdds2, t1BackPct: am1.backPercentage, t2BackPct: am2.backPercentage,
  };
}

// Prediction strategies (using data available before/during match)
const strategies = {
  'Lower Min Odds': (m) => m.o1.min <= m.o2.min ? m.t1 : m.t2,
  'Lower Last Odds': (m) => (m.o1.last ?? 999) <= (m.o2.last ?? 999) ? m.t1 : m.t2,
  'Lower Pre-Match Odds': (m) => {
    if (!m.preMatchOdds1 || !m.preMatchOdds2) return null;
    return m.preMatchOdds1 <= m.preMatchOdds2 ? m.t1 : m.t2;
  },
  'Market Signals Prediction': (m) => m.msPred || null,
  'Bookie Favourite': (m) => m.bookieFav && m.bookieFav !== 'balanced' ? m.bookieFav : null,
  'Higher Load': (m) => m.t1Total >= m.t2Total ? m.t1 : m.t2,
  'Higher Lay Trades': (m) => {
    if (m.t1LayTrades > m.t2LayTrades) return m.t1;
    if (m.t2LayTrades > m.t1LayTrades) return m.t2;
    return null;
  },
  'Higher Lay Vol': (m) => m.t1Lay >= m.t2Lay ? m.t1 : m.t2,
  'Higher Back Vol': (m) => m.t1Back >= m.t2Back ? m.t1 : m.t2,
  'Lower Back %': (m) => (m.t1BackPct ?? 50) <= (m.t2BackPct ?? 50) ? m.t1 : m.t2,
};

function predictMatchWinnerV1(m) {
  // Composite: favorite by odds + market signals confirmation
  const oddsFav = m.o1.min <= m.o2.min ? m.t1 : m.t2;
  const msPred = m.msPred;
  if (msPred) return { winner: msPred, reason: 'Market Signals AI' };
  if (m.bookieFav && m.bookieFav !== 'balanced') return { winner: m.bookieFav, reason: 'Bookie Favourite' };
  return { winner: oddsFav, reason: 'Lower Odds Favourite' };
}

function predictMatchWinnerV2(m) {
  // Trap reversal + odds
  const t1IsFav = m.t1LoadPct > 0.70;
  const t2IsFav = m.t2LoadPct > 0.70;
  const trap = m.trap === 'high';

  if (trap && t1IsFav && m.t2Lay > m.t1Lay && m.t2Lay > m.t2Back)
    return { winner: m.t2, reason: 'Smart Money Trap' };
  if (trap && t2IsFav && m.t1Lay > m.t2Lay && m.t1Lay > m.t1Back)
    return { winner: m.t1, reason: 'Smart Money Trap' };

  if (m.msPred) return { winner: m.msPred, reason: 'Market Signals' };

  const oddsFav = (m.o1.last ?? m.o1.min) <= (m.o2.last ?? m.o2.min) ? m.t1 : m.t2;
  if (m.t1LayTrades !== m.t2LayTrades) {
    const layWinner = m.t1LayTrades > m.t2LayTrades ? m.t1 : m.t2;
    if (layWinner === oddsFav) return { winner: layWinner, reason: 'Odds + Lay Trades Align' };
  }
  return { winner: oddsFav, reason: 'Lower Odds' };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const matches = await fetchMatches();
  console.log(`\nAnalyzing ${matches.length} ended cricket matches...\n`);

  const results = [];
  for (const m of matches) {
    const snap = await fetchSnapshot(m.matchId);
    await sleep(150);
    if (!snap?.teamNames) continue;

    const inferred = inferWinnerFromOdds(snap);
    if (!inferred?.winner) continue;

    const metrics = extractMatchMetrics(snap);
    results.push({
      matchId: m.matchId,
      matchName: m.matchName,
      competition: m.competitionName,
      totalMatched: m.totalMatched,
      actualWinner: inferred.winner,
      odds: inferred,
      metrics,
    });
  }

  console.log(`Got ${results.length} matches with odds data\n`);

  // Verify: lower min odds = winner?
  let lowerMinCorrect = 0;
  for (const r of results) {
    const m = r.metrics;
    const lowerMin = m.o1.min <= m.o2.min ? m.t1 : m.t2;
    if (lowerMin === r.actualWinner) lowerMinCorrect++;
  }
  console.log(`✅ Lower MIN odds = winner: ${lowerMinCorrect}/${results.length} (${(lowerMinCorrect/results.length*100).toFixed(1)}%)\n`);

  // Strategy backtest
  console.log('STRATEGY ACCURACY (predict vs inferred winner):\n');
  const scores = {};
  for (const [name] of Object.entries(strategies)) scores[name] = { c: 0, t: 0 };
  scores['MatchWinner V1'] = { c: 0, t: 0 };
  scores['MatchWinner V2'] = { c: 0, t: 0 };

  for (const r of results) {
    const m = r.metrics;
    const actual = r.actualWinner;
    for (const [name, fn] of Object.entries(strategies)) {
      const pred = fn(m);
      if (!pred) continue;
      scores[name].t++;
      if (pred === actual) scores[name].c++;
    }
    for (const [name, fn] of [['MatchWinner V1', predictMatchWinnerV1], ['MatchWinner V2', predictMatchWinnerV2]]) {
      const { winner } = fn(m);
      if (!winner) continue;
      scores[name].t++;
      if (winner === actual) scores[name].c++;
    }
  }

  Object.entries(scores)
    .map(([n, s]) => ({ n, pct: s.t ? s.c/s.t*100 : 0, ...s }))
    .sort((a, b) => b.pct - a.pct)
    .forEach(s => console.log(`${s.n.padEnd(28)} ${s.c}/${s.t} = ${s.pct.toFixed(1)}%`));

  // Print match-by-match odds analysis
  console.log('\n\nMATCH-BY-MATCH ODDS ANALYSIS:\n');
  console.log('| Match | Winner (low odds) | T1 min | T2 min | T1 last | T2 last | MS Pred |');
  console.log('|-------|-------------------|--------|--------|---------|---------|---------|');
  for (const r of results.slice(0, 20)) {
    const m = r.metrics;
    console.log(`| ${r.matchName.slice(0,35)} | ${r.actualWinner.slice(0,20)} | ${m.o1.min?.toFixed(2)} | ${m.o2.min?.toFixed(2)} | ${m.o1.last?.toFixed(2)||'—'} | ${m.o2.last?.toFixed(2)||'—'} | ${m.msPred?.slice(0,15)||'—'} |`);
  }
  if (results.length > 20) console.log(`... and ${results.length - 20} more`);

  fs.writeFileSync(path.join(__dirname, 'match_odds_analysis.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nSaved to match_odds_analysis.json`);
})();
