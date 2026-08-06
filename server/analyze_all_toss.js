/**
 * Fetch ALL toss matches + snapshots and run prediction algorithms.
 * Output: structured report for user to fill in actual winners.
 */
const axios = require('axios');

const BASE = 'https://tennisliveload.com';

async function fetchMatches() {
  const { data } = await axios.get(`${BASE}/api/toss/matches`, { timeout: 15000 });
  return Array.isArray(data) ? data : [];
}

async function fetchSnapshot(matchId) {
  try {
    const { data } = await axios.get(`${BASE}/api/toss/snapshot`, { params: { matchId }, timeout: 15000 });
    return data?.error ? null : data;
  } catch { return null; }
}

function getTradeStats(trades = []) {
  let tBack = 0, tLay = 0, tBackLiab = 0, tLayLiab = 0;
  let layCount = 0, backCount = 0, backVal = 0;
  for (const t of trades) {
    if (t.type === 'back') { tBack += t.size; tBackLiab += t.size * (t.price - 1); backCount++; backVal += t.size; }
    else if (t.type === 'lay') { tLay += t.size; tLayLiab += t.size * (t.price - 1); layCount++; }
  }
  return { tBack, tLay, tBackLiab, tLayLiab, layCount, backCount, backVal, totalVol: tBack + tLay };
}

// TossDetail.jsx 3-rule algorithm
function predictTossDetail(snap) {
  const t1 = snap.teamNames?.[0];
  const t2 = snap.teamNames?.[1];
  const t1Trades = snap.teams?.[t1]?.trades || [];
  const t2Trades = snap.teams?.[t2]?.trades || [];
  if (!t1Trades.length && !t2Trades.length) return null;

  const s1 = getTradeStats(t1Trades);
  const s2 = getTradeStats(t2Trades);

  const rules = [];
  const layTie = s1.layCount === s2.layCount;
  rules.push({ name: 'Fewer Lay Trades', weight: 3, t1wins: s1.layCount < s2.layCount, tie: layTie });
  rules.push({ name: 'Higher Back Value', weight: 1, t1wins: s1.backVal > s2.backVal, tie: s1.backVal === s2.backVal });
  rules.push({ name: 'Higher Volume', weight: 1, t1wins: s1.totalVol > s2.totalVol, tie: s1.totalVol === s2.totalVol });

  let t1Score = 0, t2Score = 0;
  for (const r of rules) {
    if (r.tie) continue;
    if (r.t1wins) t1Score += r.weight; else t2Score += r.weight;
  }
  const winner = t1Score >= t2Score ? t1 : t2;
  return { winner, t1Score, t2Score, rules, s1, s2 };
}

// MatchDetail.jsx composite trap algorithm
function predictMatchDetail(snap) {
  const t1 = snap.teamNames?.[0];
  const t2 = snap.teamNames?.[1];
  const m1 = snap.advancedMetricsV2?.team1 || {};
  const m2 = snap.advancedMetricsV2?.team2 || {};
  const s1 = snap.syntheticSupport?.teamA || {};
  const s2 = snap.syntheticSupport?.teamB || {};

  const t1Back = m1.back ?? 0, t2Back = m2.back ?? 0;
  const t1LayVol = m1.lay ?? 0, t2LayVol = m2.lay ?? 0;
  const t1Total = m1.totalBet ?? 0, t2Total = m2.totalBet ?? 0;
  const mTotal = t1Total + t2Total;
  const t1LayTrades = s1.tradeCount ?? 0, t2LayTrades = s2.tradeCount ?? 0;

  if (mTotal <= 0) return null;

  const t1LoadPct = t1Total / mTotal;
  const t2LoadPct = t2Total / mTotal;

  const t1IsTrap = t2LoadPct > 0.74 && t1LayVol > t2LayVol && t1LayVol > t1Back;
  const t2IsTrap = t1LoadPct > 0.74 && t2LayVol > t1LayVol && t2LayVol > t2Back;
  const t1ZeroLayTrap = t2LayVol === 0 && t1LayVol > 0 && t2LoadPct <= 0.75;
  const t2ZeroLayTrap = t1LayVol === 0 && t2LayVol > 0 && t1LoadPct <= 0.75;

  let winner, reason;
  if (t1IsTrap || t1ZeroLayTrap) { winner = t1; reason = t1IsTrap ? 'Smart Money Trap' : 'Zero Lay Trap'; }
  else if (t2IsTrap || t2ZeroLayTrap) { winner = t2; reason = t2IsTrap ? 'Smart Money Trap' : 'Zero Lay Trap'; }
  else if (t1LayTrades > t2LayTrades) { winner = t1; reason = 'Higher Lay Trades'; }
  else if (t2LayTrades > t1LayTrades) { winner = t2; reason = 'Higher Lay Trades'; }
  else if (t1LayVol > t2LayVol) { winner = t1; reason = 'Higher Lay Vol'; }
  else if (t2LayVol > t1LayVol) { winner = t2; reason = 'Higher Lay Vol'; }
  else { winner = null; reason = 'Tie'; }

  return { winner, reason, t1LoadPct: (t1LoadPct * 100).toFixed(1), t2LoadPct: (t2LoadPct * 100).toFixed(1), t1LayTrades, t2LayTrades, t1LayVol, t2LayVol, t1Total, t2Total };
}

// Simple heuristics for comparison
function predictHigherLoad(snap) {
  const m1 = snap.advancedMetricsV2?.team1?.totalBet ?? 0;
  const m2 = snap.advancedMetricsV2?.team2?.totalBet ?? 0;
  if (m1 + m2 === 0) return null;
  return m1 >= m2 ? snap.teamNames[0] : snap.teamNames[1];
}

function predictFewerLayTrades(snap) {
  const t1 = snap.teamNames?.[0], t2 = snap.teamNames?.[1];
  const t1Lay = (snap.teams?.[t1]?.trades || []).filter(t => t.type === 'lay').length;
  const t2Lay = (snap.teams?.[t2]?.trades || []).filter(t => t.type === 'lay').length;
  if (t1Lay === t2Lay) return null;
  return t1Lay < t2Lay ? t1 : t2;
}

function predictBookieFav(snap) {
  const fav = snap.marketSignals?.bookieFavouriteOutcome;
  return fav || null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const matches = await fetchMatches();
  const withData = matches.filter(m => (m.totalMatched || 0) > 0);
  const ended = withData.filter(m => m.status === 'ended');
  const live = withData.filter(m => m.status === 'in-play');
  const upcoming = withData.filter(m => m.status === 'upcoming');

  console.log(`\n${'='.repeat(80)}`);
  console.log(`TOSS DATA ANALYSIS — ${new Date().toISOString()}`);
  console.log(`Total matches: ${matches.length} | With betting data: ${withData.length}`);
  console.log(`Ended: ${ended.length} | Live/In-play: ${live.length} | Upcoming (with data): ${upcoming.length}`);
  console.log(`${'='.repeat(80)}\n`);

  const results = [];

  for (const m of withData) {
    const snap = await fetchSnapshot(m.matchId);
    await sleep(200);
    if (!snap?.teamNames) {
      results.push({ ...m, error: 'No snapshot' });
      continue;
    }

    const detail = predictTossDetail(snap);
    const matchDetail = predictMatchDetail(snap);
    const higherLoad = predictHigherLoad(snap);
    const fewerLay = predictFewerLayTrades(snap);
    const bookieFav = predictBookieFav(snap);

    results.push({
      matchId: m.matchId,
      matchName: m.matchName,
      competition: m.competitionName,
      status: m.status,
      totalMatched: m.totalMatched,
      team1: snap.teamNames[0],
      team2: snap.teamNames[1],
      predTossDetail: detail?.winner || '—',
      predMatchDetail: matchDetail?.winner || '—',
      matchDetailReason: matchDetail?.reason || '—',
      predHigherLoad: higherLoad || '—',
      predFewerLay: fewerLay || '—',
      predBookieFav: bookieFav || '—',
      t1Load: matchDetail?.t1Total?.toFixed(0) || '—',
      t2Load: matchDetail?.t2Total?.toFixed(0) || '—',
      t1LayTrades: matchDetail?.t1LayTrades ?? '—',
      t2LayTrades: matchDetail?.t2LayTrades ?? '—',
      t1LayVol: matchDetail?.t1LayVol?.toFixed(0) || '—',
      t2LayVol: matchDetail?.t2LayVol?.toFixed(0) || '—',
      trap: snap.marketSignals?.trap?.level || 'none',
      actualWinner: '???', // USER TO FILL
    });
  }

  // Print ended matches
  console.log('\n📋 ENDED MATCHES (need actual toss winners from you):\n');
  console.log('| # | Match | Competition | TossDetail Pred | MatchDetail Pred | Reason | Bookie Fav | T1 Load | T2 Load | T1 Lay# | T2 Lay# |');
  console.log('|---|-------|-------------|-----------------|------------------|--------|------------|---------|---------|---------|---------|');
  ended.forEach((r, i) => {
    const row = results.find(x => x.matchId === r.matchId);
    if (!row || row.error) return;
    console.log(`| ${i + 1} | ${row.matchName} | ${row.competition} | ${row.predTossDetail} | ${row.predMatchDetail} | ${row.matchDetailReason} | ${row.predBookieFav} | ${row.t1Load} | ${row.t2Load} | ${row.t1LayTrades} | ${row.t2LayTrades} |`);
  });

  // Print live matches
  if (live.length) {
    console.log('\n\n🔴 LIVE / IN-PLAY MATCHES:\n');
    live.forEach((r, i) => {
      const row = results.find(x => x.matchId === r.matchId);
      if (!row || row.error) return;
      console.log(`${i + 1}. ${row.matchName} (${row.competition})`);
      console.log(`   Status: ${row.status} | Total Matched: ₹${row.totalMatched?.toFixed(0)}`);
      console.log(`   Teams: ${row.team1} vs ${row.team2}`);
      console.log(`   TossDetail Pred: ${row.predTossDetail}`);
      console.log(`   MatchDetail Pred: ${row.predMatchDetail} (${row.matchDetailReason})`);
      console.log(`   Bookie Fav: ${row.predBookieFav} | Higher Load: ${row.predHigherLoad}`);
      console.log(`   Load: ${row.team1}=${row.t1Load} | ${row.team2}=${row.t2Load}`);
      console.log(`   Lay Trades: ${row.team1}=${row.t1LayTrades} | ${row.team2}=${row.t2LayTrades}`);
      console.log('');
    });
  }

  // Print upcoming with data
  if (upcoming.length) {
    console.log('\n\n⏳ UPCOMING (with betting data):\n');
    upcoming.forEach((r, i) => {
      const row = results.find(x => x.matchId === r.matchId);
      if (!row || row.error) return;
      console.log(`${i + 1}. ${row.matchName} — Pred: ${row.predMatchDetail} (${row.matchDetailReason})`);
    });
  }

  // Agreement analysis between algorithms (for ended only)
  console.log('\n\n📊 ALGORITHM AGREEMENT (ended matches):\n');
  const endedResults = results.filter(r => r.status === 'ended' && !r.error);
  let agree = 0, disagree = 0;
  for (const r of endedResults) {
    if (r.predTossDetail === r.predMatchDetail && r.predTossDetail !== '—') agree++;
    else if (r.predTossDetail !== '—' && r.predMatchDetail !== '—') disagree++;
  }
  console.log(`TossDetail vs MatchDetail agree: ${agree}/${agree + disagree}`);

  // Save JSON for later backtest
  const fs = require('fs');
  const outPath = require('path').join(__dirname, 'toss_analysis_data.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\n✅ Full data saved to: ${outPath}`);

  // Simple copy-paste format for user
  console.log('\n\n📝 COPY THIS — Fill in actual toss winners:\n');
  endedResults.forEach((r, i) => {
    console.log(`${i + 1}. ${r.matchName} | Pred(MD): ${r.predMatchDetail} | Pred(TD): ${r.predTossDetail} | ACTUAL: ???`);
  });
})();
