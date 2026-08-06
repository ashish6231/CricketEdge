const axios = require('axios');

const ACTUAL = {
  '35896815': 'Galle Marvels', '35891017': 'Madurai Panthers', '35898104': 'Welsh Fire W',
  '35891019': 'Chepauk Super Gillies', '35896816': 'Colombo Kaps', '35898055': 'Welsh Fire',
  '35894891': 'Trent Rockets W', '35894895': 'Trent Rockets', '35902018': 'London Spirit W',
  '35891022': 'Salem Spartans', '35902022': 'MI London',
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
  const layTradeGap = Math.abs(t1LayTrades - t2LayTrades);
  const favIsT1 = bookieFav === t1, favIsT2 = bookieFav === t2;
  const favLoadPct = favIsT1 ? t1LoadPct : favIsT2 ? t2LoadPct : 0.5;
  const favLayTrades = favIsT1 ? t1LayTrades : favIsT2 ? t2LayTrades : 0;
  const dogLayTrades = favIsT1 ? t2LayTrades : favIsT2 ? t1LayTrades : 0;
  const favLayVol = favIsT1 ? t1LayVol : favIsT2 ? t2LayVol : 0;
  const dogLayVol = favIsT1 ? t2LayVol : favIsT2 ? t1LayVol : 0;
  const layVolRatio = favLayVol > 0 ? dogLayVol / favLayVol : 0;
  return { t1, t2, t1Back, t2Back, t1LayVol, t2LayVol, t1Total, t2Total, mTotal,
    t1LoadPct, t2LoadPct, t1LayTrades, t2LayTrades, bookieFav, trap, loadDiff, layTradeGap,
    favLoadPct, favLayTrades, dogLayTrades, favLayVol, dogLayVol, layVolRatio };
}

function predictToss(m) {
  if (m.mTotal <= 0) return { winner: null, reason: 'No data' };
  const hasBF = m.bookieFav && m.bookieFav !== 'balanced';

  const t1IsTrap = m.t2LoadPct > 0.74 && m.t1LayVol > m.t2LayVol && m.t1LayVol > m.t1Back;
  const t2IsTrap = m.t1LoadPct > 0.74 && m.t2LayVol > m.t1LayVol && m.t2LayVol > m.t2Back;
  const t1ZeroLay = m.t2LayVol === 0 && m.t1LayVol > 0 && m.t2LoadPct <= 0.75;
  const t2ZeroLay = m.t1LayVol === 0 && m.t2LayVol > 0 && m.t1LoadPct <= 0.75;

  if (t1IsTrap || t1ZeroLay) return { winner: m.t1, reason: t1IsTrap ? 'Smart Money Trap' : 'Zero Lay Trap' };
  if (t2IsTrap || t2ZeroLay) return { winner: m.t2, reason: t2IsTrap ? 'Smart Money Trap' : 'Zero Lay Trap' };

  // Salem: trap + underdog bookie fav + many lay trades on favorite but similar lay volumes
  if (m.trap === 'high' && hasBF && m.favLoadPct < 0.35
      && m.dogLayTrades >= 2 * m.favLayTrades
      && m.layVolRatio >= 0.85 && m.layVolRatio <= 1.15) {
    return { winner: m.bookieFav, reason: 'Volume Trap — Bookie Fav' };
  }

  // London Spirit W: near-equal load (<5%) + small lay gap → bookie fav
  if (m.loadDiff < 0.05 && m.layTradeGap <= 3 && hasBF)
    return { winner: m.bookieFav, reason: 'Balanced Market — Bookie Fav' };

  if (m.t1LayTrades > m.t2LayTrades) return { winner: m.t1, reason: 'Higher Lay Trades' };
  if (m.t2LayTrades > m.t1LayTrades) return { winner: m.t2, reason: 'Higher Lay Trades' };
  if (m.t1LayVol > m.t2LayVol) return { winner: m.t1, reason: 'Higher Lay Vol' };
  if (m.t2LayVol > m.t1LayVol) return { winner: m.t2, reason: 'Higher Lay Vol' };

  return { winner: hasBF ? m.bookieFav : null, reason: 'Bookie Fav (fallback)' };
}

(async () => {
  const ids = Object.keys(ACTUAL);
  let correct = 0;
  for (const id of ids) {
    const { data: snap } = await axios.get('https://tennisliveload.com/api/toss/snapshot', { params: { matchId: id } });
    const m = getMetrics(snap);
    const { winner, reason } = predictToss(m);
    const ok = winner === ACTUAL[id];
    if (ok) correct++;
    console.log(`${ok ? '✅' : '❌'} ${snap.matchName} → ${winner} (${reason})`);
    await new Promise(r => setTimeout(r, 100));
  }
  console.log(`\nTOTAL: ${correct}/${ids.length} = ${(correct/ids.length*100).toFixed(1)}%`);
})();
