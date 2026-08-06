/**
 * Backtest improved toss predictor variants.
 */
const axios = require('axios');

const ACTUAL = {
  '35896815': 'Galle Marvels', '35883428': null, '35891017': 'Madurai Panthers',
  '35898104': 'Welsh Fire W', '35891019': 'Chepauk Super Gillies', '35896816': 'Colombo Kaps',
  '35898055': 'Welsh Fire', '35894891': 'Trent Rockets W', '35894895': 'Trent Rockets',
  '35902018': 'London Spirit W', '35891022': 'Salem Spartans', '35902022': 'MI London',
};

function getMetrics(snap) {
  const t1 = snap.teamNames[0], t2 = snap.teamNames[1];
  const m1 = snap.advancedMetricsV2?.team1 || {}, m2 = snap.advancedMetricsV2?.team2 || {};
  const s1 = snap.syntheticSupport?.teamA || {}, s2 = snap.syntheticSupport?.teamB || {};
  const t1Back = m1.back ?? 0, t2Back = m2.back ?? 0;
  const t1LayVol = m1.lay ?? 0, t2LayVol = m2.lay ?? 0;
  const t1Total = m1.totalBet ?? 0, t2Total = m2.totalBet ?? 0;
  const mTotal = t1Total + t2Total;
  const t1LoadPct = mTotal > 0 ? t1Total / mTotal : 0.5;
  const t2LoadPct = mTotal > 0 ? t2Total / mTotal : 0.5;
  const t1LayTrades = s1.tradeCount ?? 0, t2LayTrades = s2.tradeCount ?? 0;
  const bookieFav = snap.marketSignals?.bookieFavouriteOutcome;
  const trap = snap.marketSignals?.trap?.level || 'none';
  const loadDiff = Math.abs(t1LoadPct - t2LoadPct);
  const favLoadPct = bookieFav === t1 ? t1LoadPct : bookieFav === t2 ? t2LoadPct : 0.5;
  return { t1, t2, t1Back, t2Back, t1LayVol, t2LayVol, t1Total, t2Total, mTotal,
    t1LoadPct, t2LoadPct, t1LayTrades, t2LayTrades, bookieFav, trap, loadDiff, favLoadPct };
}

function predictToss(m, opts = {}) {
  const { balancedThreshold = 0.12, underdogThreshold = 0.45 } = opts;
  if (m.mTotal <= 0) return { winner: null, reason: 'No data' };

  const t1IsTrap = m.t2LoadPct > 0.74 && m.t1LayVol > m.t2LayVol && m.t1LayVol > m.t1Back;
  const t2IsTrap = m.t1LoadPct > 0.74 && m.t2LayVol > m.t1LayVol && m.t2LayVol > m.t2Back;
  const t1ZeroLay = m.t2LayVol === 0 && m.t1LayVol > 0 && m.t2LoadPct <= 0.75;
  const t2ZeroLay = m.t1LayVol === 0 && m.t2LayVol > 0 && m.t1LoadPct <= 0.75;

  if (t1IsTrap || t1ZeroLay) return { winner: m.t1, reason: t1IsTrap ? 'Smart Money Trap' : 'Zero Lay Trap' };
  if (t2IsTrap || t2ZeroLay) return { winner: m.t2, reason: t2IsTrap ? 'Smart Money Trap' : 'Zero Lay Trap' };

  const hasBookieFav = m.bookieFav && m.bookieFav !== 'balanced';

  // High trap + bookie fav is underdog (Salem pattern)
  if (m.trap === 'high' && hasBookieFav && m.favLoadPct < underdogThreshold)
    return { winner: m.bookieFav, reason: 'Trap — Bookie Fav Underdog' };

  // Balanced load — trust bookie (London Spirit W pattern)
  if (m.loadDiff < balancedThreshold && hasBookieFav)
    return { winner: m.bookieFav, reason: 'Balanced Load — Bookie Fav' };

  if (m.t1LayTrades > m.t2LayTrades) return { winner: m.t1, reason: 'Higher Lay Trades' };
  if (m.t2LayTrades > m.t1LayTrades) return { winner: m.t2, reason: 'Higher Lay Trades' };
  if (m.t1LayVol > m.t2LayVol) return { winner: m.t1, reason: 'Higher Lay Vol' };
  if (m.t2LayVol > m.t1LayVol) return { winner: m.t2, reason: 'Higher Lay Vol' };

  return { winner: hasBookieFav ? m.bookieFav : null, reason: 'Bookie Fav (fallback)' };
}

(async () => {
  const ids = Object.keys(ACTUAL).filter(id => ACTUAL[id]);
  const results = [];

  for (const id of ids) {
    const { data: snap } = await axios.get('https://tennisliveload.com/api/toss/snapshot', { params: { matchId: id } });
    const m = getMetrics(snap);
    const pred = predictToss(m);
    const ok = pred.winner === ACTUAL[id];
    results.push({ name: snap.matchName, pred: pred.winner, actual: ACTUAL[id], reason: pred.reason, ok });
    await new Promise(r => setTimeout(r, 100));
  }

  const correct = results.filter(r => r.ok).length;
  console.log(`\nUnified Predictor: ${correct}/${results.length} = ${(correct/results.length*100).toFixed(1)}%\n`);
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}`);
    console.log(`   Pred: ${r.pred} | Actual: ${r.actual} | ${r.reason}`);
  }
})();
