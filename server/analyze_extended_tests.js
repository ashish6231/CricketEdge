/**
 * Extended match-start + early in-play signal tests on ALL ended cricket matches.
 * Fetches fresh snapshots and grid-searches 40+ signals/combos.
 */
const axios = require('axios');
const fs = require('fs');

const BASE = 'https://tennisliveload.com';

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

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

function sortTrades(trades) {
  return [...(trades || [])].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
}

function firstN(trades, n) {
  return sortTrades(trades).slice(0, n);
}

function tradesInWindow(trades, startMs, endMs) {
  return sortTrades(trades).filter(t => {
    const ts = t.updatedAt || 0;
    return ts >= startMs && ts <= endMs;
  });
}

function oddsMedian(trades) {
  const p = trades.map(t => t.price).filter(x => x > 0);
  return median(p);
}

function volSum(trades) {
  let back = 0, lay = 0;
  for (const t of trades) {
    const s = t.size || 0;
    if (t.type === 'back') back += s; else if (t.type === 'lay') lay += s;
  }
  return { back, lay, total: back + lay };
}

function extractFull(snap) {
  const t1 = snap.teamNames[0], t2 = snap.teamNames[1];
  const allT1 = snap.teams?.[t1]?.trades || [];
  const allT2 = snap.teams?.[t2]?.trades || [];
  const sorted1 = sortTrades(allT1);
  const sorted2 = sortTrades(allT2);

  const minTs = Math.min(
    sorted1[0]?.updatedAt || Infinity,
    sorted2[0]?.updatedAt || Infinity,
  );
  const maxTs = Math.max(
    sorted1.at(-1)?.updatedAt || 0,
    sorted2.at(-1)?.updatedAt || 0,
  );

  const win15_1 = tradesInWindow(allT1, minTs, minTs + 15 * 60 * 1000);
  const win15_2 = tradesInWindow(allT2, minTs, minTs + 15 * 60 * 1000);
  const win30_1 = tradesInWindow(allT1, minTs, minTs + 30 * 60 * 1000);
  const win30_2 = tradesInWindow(allT2, minTs, minTs + 30 * 60 * 1000);

  const preVol1 = snap.preMatchVolume?.team1 || {};
  const preVol2 = snap.preMatchVolume?.team2 || {};
  const ipVol1 = snap.inPlayVolume?.team1 || {};
  const ipVol2 = snap.inPlayVolume?.team2 || {};
  const tmVol1 = snap.threeMinVolume?.team1 || {};
  const tmVol2 = snap.threeMinVolume?.team2 || {};

  const m1 = snap.advancedMetricsV2?.team1 || {};
  const m2 = snap.advancedMetricsV2?.team2 || {};
  const s1 = snap.syntheticSupport?.teamA || {};
  const s2 = snap.syntheticSupport?.teamB || {};
  const sup1 = snap.supportMetrics?.team1 || {};
  const sup2 = snap.supportMetrics?.team2 || {};

  const preBets1 = snap.preMatchTotalBets?.team1 ?? 0;
  const preBets2 = snap.preMatchTotalBets?.team2 ?? 0;
  const mTotal = preBets1 + preBets2;

  return {
    t1, t2,
    // Pre-match odds (chronological first N)
    pre5_1: oddsMedian(firstN(allT1, 5)), pre5_2: oddsMedian(firstN(allT2, 5)),
    pre3_1: oddsMedian(firstN(allT1, 3)), pre3_2: oddsMedian(firstN(allT2, 3)),
    pre10_1: oddsMedian(firstN(allT1, 10)), pre10_2: oddsMedian(firstN(allT2, 10)),
    pre20_1: oddsMedian(firstN(allT1, 20)), pre20_2: oddsMedian(firstN(allT2, 20)),
    // Early in-play windows
    e15_1: oddsMedian(win15_1), e15_2: oddsMedian(win15_2),
    e30_1: oddsMedian(win30_1), e30_2: oddsMedian(win30_2),
    e15v1: volSum(win15_1), e15v2: volSum(win15_2),
    // Pre-match volume
    preBack1: preVol1.back || 0, preLay1: preVol1.lay || 0,
    preBack2: preVol2.back || 0, preLay2: preVol2.lay || 0,
    preBets1, preBets2, t1Load: mTotal > 0 ? preBets1 / mTotal : 0.5,
    prePnl1: snap.preMatchPnl?.team1, prePnl2: snap.preMatchPnl?.team2,
    // In-play / 3min API fields
    ipBack1: ipVol1.back || 0, ipLay1: ipVol1.lay || 0,
    ipBack2: ipVol2.back || 0, ipLay2: ipVol2.lay || 0,
    tmBack1: tmVol1.back || 0, tmLay1: tmVol1.lay || 0,
    tmBack2: tmVol2.back || 0, tmLay2: tmVol2.lay || 0,
    // V2 metrics
    v2Back1: m1.back || 0, v2Lay1: m1.lay || 0, v2Total1: m1.totalBet || 0,
    v2Back2: m2.back || 0, v2Lay2: m2.lay || 0, v2Total2: m2.totalBet || 0,
    // Support
    synSup1: s1.support ?? s1.supportMoney, synSup2: s2.support ?? s2.supportMoney,
    supPct1: sup1.support, supPct2: sup2.support,
    supMoney1: sup1.supportMoney, supMoney2: sup2.supportMoney,
    // Market signals
    msPred: snap.marketSignals?.prediction?.prediction,
    bookieFav: snap.marketSignals?.bookieFavouriteOutcome,
    trap: snap.marketSignals?.trap?.level || 'none',
    riskTeam: snap.marketSignals?.riskTeam,
    moreBetted: snap.marketSignals?.moreBettedTeam,
    load1: snap.matchLoadV2?.team1, load2: snap.matchLoadV2?.team2,
    matchDurationMs: maxTs - minTs,
    tradeCount1: allT1.length, tradeCount2: allT2.length,
  };
}

function pickLowerOdds(o1, o2, t1, t2, minGap = 0) {
  if (o1 == null || o2 == null) return null;
  if (Math.abs(o1 - o2) < minGap) return null;
  return o1 <= o2 ? t1 : t2;
}

function pickHigher(a1, a2, t1, t2) {
  return a1 >= a2 ? t1 : t2;
}

// ─── Individual signal predictors ───
const SIGNALS = {
  'MS AI': r => r.msPred && r.msPred !== 'No Prediction' ? r.msPred : null,
  'Bookie Fav': r => r.bookieFav && r.bookieFav !== 'balanced' ? r.bookieFav : null,
  'Risk Team': r => r.riskTeam || null,
  'Fade Risk Team': r => r.riskTeam ? (r.riskTeam === r.t1 ? r.t2 : r.t1) : null,
  'More Betted': r => r.moreBetted || null,
  'Fade More Betted': r => r.moreBetted ? (r.moreBetted === r.t1 ? r.t2 : r.t1) : null,

  'Pre odds 5 (gap≥0.05)': r => pickLowerOdds(r.pre5_1, r.pre5_2, r.t1, r.t2, 0.05),
  'Pre odds 5 (gap≥0.08)': r => pickLowerOdds(r.pre5_1, r.pre5_2, r.t1, r.t2, 0.08),
  'Pre odds 5 (gap≥0.10)': r => pickLowerOdds(r.pre5_1, r.pre5_2, r.t1, r.t2, 0.10),
  'Pre odds 5 (any)': r => pickLowerOdds(r.pre5_1, r.pre5_2, r.t1, r.t2, 0),
  'Pre odds 3 (gap≥0.05)': r => pickLowerOdds(r.pre3_1, r.pre3_2, r.t1, r.t2, 0.05),
  'Pre odds 10 (gap≥0.05)': r => pickLowerOdds(r.pre10_1, r.pre10_2, r.t1, r.t2, 0.05),
  'Pre odds 20 (gap≥0.05)': r => pickLowerOdds(r.pre20_1, r.pre20_2, r.t1, r.t2, 0.05),

  'Early 15min odds (gap≥0.05)': r => pickLowerOdds(r.e15_1, r.e15_2, r.t1, r.t2, 0.05),
  'Early 15min odds (any)': r => pickLowerOdds(r.e15_1, r.e15_2, r.t1, r.t2, 0),
  'Early 30min odds (gap≥0.05)': r => pickLowerOdds(r.e30_1, r.e30_2, r.t1, r.t2, 0.05),

  'Pre back vol': r => pickHigher(r.preBack1, r.preBack2, r.t1, r.t2),
  'Pre lay vol': r => pickHigher(r.preLay1, r.preLay2, r.t1, r.t2),
  'Pre bets total': r => pickHigher(r.preBets1, r.preBets2, r.t1, r.t2),
  'IP back vol': r => pickHigher(r.ipBack1, r.ipBack2, r.t1, r.t2),
  'IP lay vol': r => pickHigher(r.ipLay1, r.ipLay2, r.t1, r.t2),
  '3min back vol': r => pickHigher(r.tmBack1, r.tmBack2, r.t1, r.t2),
  '3min lay vol': r => pickHigher(r.tmLay1, r.tmLay2, r.t1, r.t2),

  'V2 back vol': r => pickHigher(r.v2Back1, r.v2Back2, r.t1, r.t2),
  'V2 lay vol': r => pickHigher(r.v2Lay1, r.v2Lay2, r.t1, r.t2),
  'V2 total bet': r => pickHigher(r.v2Total1, r.v2Total2, r.t1, r.t2),

  'Syn support %': r => {
    if (r.synSup1 == null || r.synSup2 == null) return null;
    return r.synSup1 >= r.synSup2 ? r.t1 : r.t2;
  },
  'Support money': r => pickHigher(r.supMoney1 || 0, r.supMoney2 || 0, r.t1, r.t2),
  'Support %': r => {
    if (r.supPct1 == null || r.supPct2 == null) return null;
    return r.supPct1 >= r.supPct2 ? r.t1 : r.t2;
  },

  'matchLoadV2 higher': r => {
    if (r.load1 == null || r.load2 == null) return null;
    return r.load1 >= r.load2 ? r.t1 : r.t2;
  },
  'matchLoadV2 lower (fade)': r => {
    if (r.load1 == null || r.load2 == null) return null;
    return r.load1 <= r.load2 ? r.t1 : r.t2;
  },

  'Pre PnL higher (bookie wins)': r => {
    if (r.prePnl1 == null || r.prePnl2 == null) return null;
    return r.prePnl1 >= r.prePnl2 ? r.t1 : r.t2;
  },

  'Smart Money Trap (pre)': r => {
    if (r.t2Load > 0.68 && r.preLay1 > r.preLay2 && r.preLay1 > r.preBack1) return r.t1;
    if (r.t1Load > 0.68 && r.preLay2 > r.preLay1 && r.preLay2 > r.preBack2) return r.t2;
    return null;
  },

  'Trap high → fade loaded': r => {
    if (r.trap !== 'high') return null;
    return r.t1Load > 0.55 ? r.t2 : r.t1;
  },

  'Early 15min back vol': r => pickHigher(r.e15v1.back, r.e15v2.back, r.t1, r.t2),
  'Early 15min lay vol': r => pickHigher(r.e15v1.lay, r.e15v2.lay, r.t1, r.t2),

  'MS + Bookie agree': r => {
    if (!r.msPred || !r.bookieFav || r.bookieFav === 'balanced') return null;
    return r.msPred === r.bookieFav ? r.msPred : null;
  },
  'MS + Pre odds agree (gap≥0.05)': r => {
    const pre = pickLowerOdds(r.pre5_1, r.pre5_2, r.t1, r.t2, 0.05);
    if (!r.msPred || !pre || r.msPred !== pre) return null;
    return pre;
  },
};

// ─── Composite algos to test ───
function combo(steps) {
  return (r) => {
    for (const step of steps) {
      const p = typeof step === 'function' ? step(r) : SIGNALS[step]?.(r);
      if (p) return p;
    }
    return null;
  };
}

const COMPOSITES = {
  'A: MS→pre5→back': combo(['MS AI', 'Pre odds 5 (gap≥0.05)', 'Pre back vol']),
  'B: trap→MS→pre5→bookie': combo(['Smart Money Trap (pre)', 'MS AI', 'Pre odds 5 (gap≥0.08)', 'Bookie Fav', 'Pre odds 5 (any)']),
  'C: MS→pre5→synSupport': combo(['MS AI', 'Pre odds 5 (gap≥0.05)', 'Syn support %', 'Pre back vol']),
  'D: MS→e15→pre5→back': combo(['MS AI', 'Early 15min odds (gap≥0.05)', 'Pre odds 5 (gap≥0.05)', 'Pre back vol']),
  'E: MS+agree→pre5→back': combo(['MS + Pre odds agree (gap≥0.05)', 'MS AI', 'Pre odds 5 (gap≥0.05)', 'Pre back vol']),
  'F: MS→pre5→V2lay': combo(['MS AI', 'Pre odds 5 (gap≥0.05)', 'V2 lay vol', 'Pre back vol']),
  'G: trap→MS→e15→pre5': combo(['Smart Money Trap (pre)', 'MS AI', 'Early 15min odds (gap≥0.05)', 'Pre odds 5 (gap≥0.05)', 'Pre back vol']),
  'H: MS→load fade→pre5': combo(['MS AI', 'matchLoadV2 lower (fade)', 'Pre odds 5 (gap≥0.05)', 'Pre back vol']),
  'I: MS→supMoney→pre5': combo(['MS AI', 'Support money', 'Pre odds 5 (gap≥0.05)', 'Pre back vol']),
  'J: MS+bookie→pre5→back': combo(['MS + Bookie agree', 'MS AI', 'Pre odds 5 (gap≥0.05)', 'Pre back vol']),
  'K: e15→MS→pre5→back': combo(['Early 15min odds (gap≥0.05)', 'MS AI', 'Pre odds 5 (gap≥0.05)', 'Pre back vol']),
  'L: pre10→MS→back': combo(['Pre odds 10 (gap≥0.05)', 'MS AI', 'Pre back vol']),
  'M: MS→IP lay→pre5': combo(['MS AI', 'IP lay vol', 'Pre odds 5 (gap≥0.05)', 'Pre back vol']),
  'N: weighted vote top3': (r) => {
    const votes = {};
    const add = (t, w) => { if (t) votes[t] = (votes[t] || 0) + w; };
    add(SIGNALS['MS AI'](r), 4);
    add(SIGNALS['Pre odds 5 (gap≥0.05)'](r), 3);
    add(SIGNALS['Pre back vol'](r), 2);
    add(SIGNALS['Bookie Fav'](r), 2);
    add(SIGNALS['Smart Money Trap (pre)'](r), 4);
    add(SIGNALS['Support money'](r), 1);
    add(SIGNALS['V2 lay vol'](r), 1);
    const e = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    return e[0]?.[0] || null;
  },
};

function score(name, fn, rows) {
  let c = 0, t = 0, skip = 0;
  const wrong = [];
  for (const row of rows) {
    const p = fn(row.m);
    if (!p) { skip++; continue; }
    t++;
    if (p === row.actual) c++;
    else wrong.push({ name: row.matchName, pred: p, actual: row.actual });
  }
  return { name, acc: t ? c / t : 0, c, t, skip, wrong };
}

(async () => {
  console.log('Fetching ALL ended cricket matches (fresh)...\n');
  const { data: matchList } = await axios.get(`${BASE}/api/cricket/matches`, { timeout: 15000 });
  const ended = (Array.isArray(matchList) ? matchList : []).filter(m => m.status === 'ended');

  const rows = [];
  for (const m of ended) {
    try {
      const { data: snap } = await axios.get(`${BASE}/api/cricket/snapshot`, {
        params: { matchId: m.matchId }, timeout: 25000,
      });
      const actual = inferWinner(snap);
      if (!actual) continue;
      rows.push({ matchId: m.matchId, matchName: m.matchName, actual, m: extractFull(snap) });
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 120));
    } catch (e) {
      process.stdout.write('x');
    }
  }
  console.log(`\n\nLoaded ${rows.length} matches with winners\n`);

  // Individual signals
  const indResults = Object.entries(SIGNALS).map(([name, fn]) => score(name, fn, rows));
  indResults.sort((a, b) => b.acc - a.acc || b.t - a.t);

  console.log('='.repeat(78));
  console.log('INDIVIDUAL SIGNALS (sorted by accuracy)');
  console.log('='.repeat(78));
  for (const r of indResults) {
    if (r.t === 0) continue;
    console.log(`  ${(r.acc * 100).toFixed(1).padStart(5)}% (${String(r.c).padStart(2)}/${r.t}, skip ${r.skip}) — ${r.name}`);
  }

  // Composites
  const compResults = Object.entries(COMPOSITES).map(([name, fn]) => score(name, fn, rows));
  compResults.sort((a, b) => b.acc - a.acc || b.t - a.t);

  console.log('\n' + '='.repeat(78));
  console.log('COMPOSITE ALGOS');
  console.log('='.repeat(78));
  for (const r of compResults) {
    console.log(`  ${(r.acc * 100).toFixed(1).padStart(5)}% (${String(r.c).padStart(2)}/${r.t}) — ${r.name}`);
  }

  // Best composite detail
  const best = compResults[0];
  console.log('\n' + '='.repeat(78));
  console.log(`BEST: ${best.name} — ${(best.acc * 100).toFixed(1)}% (${best.c}/${best.t})`);
  console.log('='.repeat(78));
  for (const row of rows) {
    const fn = COMPOSITES[best.name.split(': ')[1] ? best.name : Object.keys(COMPOSITES).find(k => k.startsWith(best.name.split(' ')[0]))];
  }
  const bestFn = COMPOSITES[Object.keys(COMPOSITES).find(k => compResults[0].name.endsWith(k.split(': ')[1] || k))] || compResults[0];
  const bestKey = Object.entries(COMPOSITES).find(([, fn]) => {
    const s = score('x', fn, rows);
    return s.c === best.c && s.t === best.t;
  })?.[0];

  const bestAlgo = COMPOSITES[bestKey];
  for (const row of rows) {
    const p = bestAlgo(row.m);
    const ok = p === row.actual;
    console.log(`  ${ok ? '✅' : '❌'} ${row.matchName.slice(0, 42).padEnd(42)} pred=${(p || '?').slice(0, 22).padEnd(22)} actual=${row.actual.slice(0, 22)}`);
  }

  // Grid search pre-odds gap threshold with MS first
  console.log('\n' + '='.repeat(78));
  console.log('GRID SEARCH: MS → pre-odds (varying gap) → back vol');
  console.log('='.repeat(78));
  for (const gap of [0, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.12, 0.15]) {
    const fn = combo(['MS AI', (r) => pickLowerOdds(r.pre5_1, r.pre5_2, r.t1, r.t2, gap), 'Pre back vol']);
    const s = score(`gap=${gap}`, fn, rows);
    console.log(`  gap≥${gap.toFixed(2)}: ${(s.acc * 100).toFixed(1)}% (${s.c}/${s.t})`);
  }

  // Early in-play only tests
  console.log('\n' + '='.repeat(78));
  console.log('EARLY IN-PLAY ONLY (first 15/30 min trades — no full match data)');
  console.log('='.repeat(78));
  for (const [label, fn] of [
    ['15min odds any', r => pickLowerOdds(r.e15_1, r.e15_2, r.t1, r.t2, 0)],
    ['15min odds gap≥0.05', r => pickLowerOdds(r.e15_1, r.e15_2, r.t1, r.t2, 0.05)],
    ['15min back vol', r => pickHigher(r.e15v1.back, r.e15v2.back, r.t1, r.t2)],
    ['15min lay vol', r => pickHigher(r.e15v1.lay, r.e15v2.lay, r.t1, r.t2)],
    ['15min→pre5→back combo', combo(['Early 15min odds (gap≥0.05)', 'Pre odds 5 (gap≥0.05)', 'Pre back vol'])],
  ]) {
    const s = score(label, fn, rows);
    console.log(`  ${(s.acc * 100).toFixed(1)}% (${s.c}/${s.t}) — ${label}`);
  }

  fs.writeFileSync('match_extended_tests.json', JSON.stringify({
    testedAt: new Date().toISOString(),
    matchCount: rows.length,
    topSignals: indResults.slice(0, 15).map(r => ({ name: r.name, acc: r.acc, c: r.c, t: r.t })),
    composites: compResults.map(r => ({ name: r.name, acc: r.acc, c: r.c, t: r.t })),
    gridSearch: {},
  }, null, 2));

  console.log('\nSaved match_extended_tests.json');
})();
