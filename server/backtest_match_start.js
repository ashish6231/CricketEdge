/**
 * Grid-search best MATCH-START composite algo on all ended matches.
 */
const axios = require('axios');
const fs = require('fs');

const BASE = 'https://tennisliveload.com';
const data = fs.existsSync('match_start_analysis.json')
  ? JSON.parse(fs.readFileSync('match_start_analysis.json', 'utf8'))
  : null;

async function fetchAll() {
  if (data?.results?.length >= 20) {
    return data.results.map(r => ({ ...r.metrics, matchId: r.matchId, matchName: r.matchName, actual: r.actual }));
  }

  const { data: matches } = await axios.get(`${BASE}/api/cricket/matches`, { timeout: 15000 });
  const ended = (Array.isArray(matches) ? matches : []).filter(m => m.status === 'ended');
  const results = [];

  for (const match of ended) {
    const { data: snap } = await axios.get(`${BASE}/api/cricket/snapshot`, { params: { matchId: match.matchId }, timeout: 25000 }).catch(() => ({}));
    if (!snap?.teamNames) continue;
    const t1 = snap.teamNames[0], t2 = snap.teamNames[1];
    const tr1 = snap.teams?.[t1]?.trades || [];
    const tr2 = snap.teams?.[t2]?.trades || [];
    const min1 = tr1.length ? Math.min(...tr1.map(t => t.price)) : 999;
    const min2 = tr2.length ? Math.min(...tr2.map(t => t.price)) : 999;
    const actual = min1 <= 1.12 && min1 < min2 ? t1 : min2 <= 1.12 && min2 < min1 ? t2 : min1 <= min2 ? t1 : t2;

    const sorted1 = [...tr1].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    const sorted2 = [...tr2].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    const median = (arr) => {
      if (!arr.length) return null;
      const s = arr.map(t => t.price).filter(Boolean).sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };

    const firstN = (trades, n) => trades.slice(0, n);
    const preVol1 = snap.preMatchVolume?.team1 || {};
    const preVol2 = snap.preMatchVolume?.team2 || {};
    const ipVol1 = snap.inPlayVolume?.team1 || {};
    const ipVol2 = snap.inPlayVolume?.team2 || {};

    results.push({
      matchId: match.matchId,
      matchName: match.matchName,
      actual,
      t1, t2,
      preOdds1: median(firstN(sorted1, 5)),
      preOdds2: median(firstN(sorted2, 5)),
      preOdds3_1: median(firstN(sorted1, 3)),
      preOdds3_2: median(firstN(sorted2, 3)),
      preBack1: preVol1.back || 0, preLay1: preVol1.lay || 0,
      preBack2: preVol2.back || 0, preLay2: preVol2.lay || 0,
      preBets1: snap.preMatchTotalBets?.team1 || 0,
      preBets2: snap.preMatchTotalBets?.team2 || 0,
      prePnl1: snap.preMatchPnl?.team1,
      prePnl2: snap.preMatchPnl?.team2,
      load1: snap.matchLoadV2?.team1,
      load2: snap.matchLoadV2?.team2,
      ipBack1: ipVol1.back || 0, ipLay1: ipVol1.lay || 0,
      ipBack2: ipVol2.back || 0, ipLay2: ipVol2.lay || 0,
      bookieFav: snap.marketSignals?.bookieFavouriteOutcome,
      msPred: snap.marketSignals?.prediction?.prediction,
      trap: snap.marketSignals?.trap?.level || 'none',
      riskTeam: snap.marketSignals?.riskTeam,
      moreBetted: snap.marketSignals?.moreBettedTeam,
      m1: snap.advancedMetricsV2?.team1 || {},
      m2: snap.advancedMetricsV2?.team2 || {},
    });
    await new Promise(r => setTimeout(r, 80));
  }
  return results;
}

function predictV2(r) {
  const votes = {};
  const add = (team, w, reason) => {
    if (!team) return;
    votes[team] = (votes[team] || 0) + w;
    if (!votes._reasons) votes._reasons = [];
    votes._reasons.push(reason);
  };

  const t1 = r.t1, t2 = r.t2;
  const preOdds1 = r.preOdds1 ?? r.preMatchOdds1;
  const preOdds2 = r.preOdds2 ?? r.preMatchOdds2;
  const preGap = preOdds1 != null && preOdds2 != null ? Math.abs(preOdds1 - preOdds2) : 0;

  if (preOdds1 != null && preOdds2 != null) {
    const fav = preOdds1 <= preOdds2 ? t1 : t2;
    if (preGap >= 0.15) add(fav, 5, 'strong pre odds');
    else if (preGap >= 0.08) add(fav, 4, 'pre odds gap 8%');
    else if (preGap >= 0.04) add(fav, 2, 'pre odds gap 4%');
    else add(fav, 1, 'pre odds tie-break');
  }

  // Signal 2: Market Signals AI (64% alone)
  if (r.msPred && r.msPred !== 'No Prediction') add(r.msPred, 3, 'market signals');

  // Signal 3: Bookie favourite
  if (r.bookieFav && r.bookieFav !== 'balanced') add(r.bookieFav, 2, 'bookie fav');

  // Signal 4: Pre-match lay dominance (bookie backing)
  const r1 = r.preLay1 > 0 ? r.preBack1 / r.preLay1 : 999;
  const r2 = r.preLay2 > 0 ? r.preBack2 / r.preLay2 : 999;
  if (r1 !== 999 && r2 !== 999 && Math.abs(r1 - r2) > 0.25) {
    add(r1 <= r2 ? t1 : t2, 2, 'pre lay ratio');
  }

  // Signal 5: Smart money trap (pre-match bets load + lay vol)
  const mTotal = r.preBets1 + r.preBets2;
  const t2Load = mTotal > 0 ? r.preBets2 / mTotal : 0.5;
  const t1Load = mTotal > 0 ? r.preBets1 / mTotal : 0.5;
  if (t2Load > 0.68 && r.preLay1 > r.preLay2) add(t1, 4, 'smart money trap');
  if (t1Load > 0.68 && r.preLay2 > r.preLay1) add(t2, 4, 'smart money trap');

  // Signal 6: Fade extreme matchLoad (contrarian)
  if (r.load1 != null && r.load2 != null) {
    const lt = r.load1 + r.load2;
    const l1pct = lt > 0 ? r.load1 / lt : 0.5;
    if (l1pct > 0.62) add(t2, 2, 'fade load t1');
    else if (l1pct < 0.38) add(t1, 2, 'fade load t2');
  }

  // Signal 7: Higher pre-match back volume (61.5% alone)
  if (r.preBack1 !== r.preBack2) add(r.preBack1 >= r.preBack2 ? t1 : t2, 1, 'pre back vol');

  // Signal 8: Risk team = team market thinks loses (follow at 53.8%)
  if (r.riskTeam) add(r.riskTeam, 1, 'risk team');

  // Signal 9: Trap high → fade loaded favorite
  if (r.trap === 'high' && r.moreBetted) {
    const fade = r.moreBetted === t1 ? t2 : t1;
    add(fade, 3, 'trap fade');
  }

  const entries = Object.entries(votes).filter(([k]) => !k.startsWith('_'));
  if (!entries.length) return { winner: null, reason: 'no data' };
  entries.sort((a, b) => b[1] - a[1]);
  const [winner, score] = entries[0];
  const margin = entries.length > 1 ? score - entries[1][1] : score;
  return {
    winner,
    reason: `Weighted vote (${margin.toFixed(0)}pt lead)`,
    confidence: margin >= 4 ? 'high' : margin >= 2 ? 'moderate' : 'low',
    votes: entries,
  };
}

function predictStartOnly(r) {
  const t1 = r.t1, t2 = r.t2;
  const preOdds1 = r.preOdds1 ?? r.preMatchOdds1;
  const preOdds2 = r.preOdds2 ?? r.preMatchOdds2;

  if (preOdds1 != null && preOdds2 != null) {
    const gap = Math.abs(preOdds1 - preOdds2);
    if (gap >= 0.08) return { winner: preOdds1 <= preOdds2 ? t1 : t2, reason: 'Pre-Match Odds Favorite' };

    const mTotal = r.preBets1 + r.preBets2;
    const t2Load = mTotal > 0 ? r.preBets2 / mTotal : 0.5;
    const t1Load = mTotal > 0 ? r.preBets1 / mTotal : 0.5;
    if (t2Load > 0.68 && r.preLay1 > r.preLay2 && r.preLay1 > r.preBack1)
      return { winner: t1, reason: 'Smart Money Trap' };
    if (t1Load > 0.68 && r.preLay2 > r.preLay1 && r.preLay2 > r.preBack2)
      return { winner: t2, reason: 'Smart Money Trap' };

    if (r.preBack1 + r.preBack2 > 0) {
      const backFav = r.preBack1 >= r.preBack2 ? t1 : t2;
      if (gap < 0.05) return { winner: backFav, reason: 'Pre-Match Back Volume (close odds)' };
    }

    return { winner: preOdds1 <= preOdds2 ? t1 : t2, reason: 'Pre-Match Odds' };
  }

  if (r.preBack1 !== r.preBack2) return { winner: r.preBack1 >= r.preBack2 ? t1 : t2, reason: 'Pre-Match Back Vol only' };
  return { winner: null, reason: 'No data' };
}

(async () => {
  console.log('Loading match data...\n');
  const results = await fetchAll();
  console.log(`Testing ${results.length} matches\n`);

  const test = (name, fn) => {
    let c = 0, t = 0;
    const wrong = [];
    for (const r of results) {
      const p = fn(r);
      if (!p.winner) continue;
      t++;
      if (p.winner === r.actual) c++;
      else wrong.push({ ...r, pred: p.winner, reason: p.reason });
    }
    console.log(`${(c / t * 100).toFixed(1)}% (${c}/${t}) — ${name}`);
    return { name, acc: c / t, wrong, c, t };
  };

  const r1 = test('STRICT Start-Only (pre-match + first trades)', predictStartOnly);
  const r2 = test('Weighted Ensemble (+ market signals)', predictV2);

  console.log('\n--- Best wrong predictions (ensemble) ---');
  for (const w of r2.wrong.slice(0, 8)) {
    console.log(`  ❌ ${w.matchName.slice(0, 40)} pred=${w.pred?.slice(0, 25)} actual=${w.actual?.slice(0, 25)} (${w.reason})`);
  }

  // Per-match detail for best algo
  console.log('\n--- Per match: Weighted Ensemble ---');
  for (const r of results) {
    const p = predictV2(r);
    const ok = p.winner === r.actual;
    console.log(`  ${ok ? '✅' : '❌'} ${r.matchName.slice(0, 38).padEnd(38)} ${p.confidence?.padEnd(8)} → ${p.winner?.slice(0, 22)}`);
  }
})();
