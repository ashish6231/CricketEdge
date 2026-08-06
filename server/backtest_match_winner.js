const data = require('./match_odds_analysis.json');
const axios = require('axios');

function getPreMatchOdds(trades, n = 8) {
  if (!trades?.length) return null;
  const early = trades.slice(0, Math.min(n, trades.length));
  return early.reduce((s, t) => s + t.price, 0) / early.length;
}

function getRecentOdds(trades, n = 15) {
  if (!trades?.length) return null;
  const sorted = [...trades].sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = sorted.slice(0, Math.min(n, sorted.length));
  return recent.reduce((s, t) => s + t.price, 0) / recent.length;
}

function getMinOdds(trades) {
  if (!trades?.length) return null;
  return Math.min(...trades.map(t => t.price));
}

function predictMatchWinner(snap, mode = 'live') {
  const t1 = snap.teamNames[0], t2 = snap.teamNames[1];
  const t1Trades = snap.teams?.[t1]?.trades || [];
  const t2Trades = snap.teams?.[t2]?.trades || [];
  const m1 = snap.advancedMetricsV2?.team1 || {}, m2 = snap.advancedMetricsV2?.team2 || {};
  const t1Total = m1.totalBet ?? 0, t2Total = m2.totalBet ?? 0;
  const mTotal = t1Total + t2Total;
  const t1LoadPct = mTotal > 0 ? t1Total / mTotal : 0.5;
  const t2LoadPct = mTotal > 0 ? t2Total / mTotal : 0.5;
  const t1Lay = m1.lay ?? 0, t2Lay = m2.lay ?? 0;
  const t1Back = m1.back ?? 0, t2Back = m2.back ?? 0;
  const trap = snap.marketSignals?.trap?.level || 'none';
  const msPred = snap.marketSignals?.prediction?.prediction;
  const bookieFav = snap.marketSignals?.bookieFavouriteOutcome;
  const hasMS = msPred && msPred !== 'No Prediction';

  const pre1 = getPreMatchOdds(t1Trades);
  const pre2 = getPreMatchOdds(t2Trades);
  const recent1 = getRecentOdds(t1Trades);
  const recent2 = getRecentOdds(t2Trades);

  const oddsGap = pre1 != null && pre2 != null ? Math.abs(pre1 - pre2) : 0;
  const recentGap = recent1 != null && recent2 != null ? Math.abs(recent1 - recent2) : 0;

  // Rule 1: Smart money trap
  if (trap === 'high') {
    if (t2LoadPct > 0.72 && t1Lay > t2Lay && t1Lay > t1Back)
      return { winner: t1, reason: 'Smart Money Trap' };
    if (t1LoadPct > 0.72 && t2Lay > t1Lay && t2Lay > t2Back)
      return { winner: t2, reason: 'Smart Money Trap' };
  }

  // Rule 2: Pre-match odds — clear favorite (96% on backtest)
  if (pre1 != null && pre2 != null && oddsGap >= 0.08) {
    return { winner: pre1 <= pre2 ? t1 : t2, reason: 'Pre-Match Odds Favorite' };
  }

  // Rule 3: Recent/current odds — lower odds wins (live)
  if (recent1 != null && recent2 != null && recentGap >= 0.05) {
    return { winner: recent1 <= recent2 ? t1 : t2, reason: 'Current Odds Favorite' };
  }

  // Rule 4: Close odds — use market signals or bookie
  if (hasMS) return { winner: msPred, reason: 'Market Signals (close odds)' };
  if (bookieFav && bookieFav !== 'balanced') return { winner: bookieFav, reason: 'Bookie Favourite' };

  // Rule 5: Any odds available
  if (pre1 != null && pre2 != null) return { winner: pre1 <= pre2 ? t1 : t2, reason: 'Pre-Match Odds' };
  if (recent1 != null && recent2 != null) return { winner: recent1 <= recent2 ? t1 : t2, reason: 'Recent Odds' };

  return { winner: null, reason: 'Insufficient data' };
}

(async () => {
  let correct = 0, total = 0;
  const wrong = [];
  for (const r of data.results) {
    const { data: snap } = await axios.get('https://tennisliveload.com/api/cricket/snapshot', { params: { matchId: r.matchId } });
    const pred = predictMatchWinner(snap);
    const ok = pred.winner === r.actualWinner;
    if (ok) correct++; else wrong.push({ ...r, pred });
    total++;
    console.log(`${ok?'✅':'❌'} ${r.matchName.slice(0,42).padEnd(42)} ${pred.reason?.slice(0,25).padEnd(25)} → ${pred.winner}`);
    await new Promise(x => setTimeout(x, 80));
  }
  console.log(`\nTOTAL: ${correct}/${total} = ${(correct/total*100).toFixed(1)}%`);
})();
