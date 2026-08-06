/**
 * Verify scraper data vs UI calculations — P/L, volumes, metrics
 */
const axios = require('axios');

function processTeamData(trades) {
  let totalBack = 0, totalLay = 0, totalBackLiability = 0, totalLayLiability = 0, totalBet = 0;
  for (const t of trades || []) {
    const p = parseFloat(t.price) || 0, s = parseFloat(t.size) || 0;
    totalBet += s;
    if (t.type === 'back') { totalBack += s; totalBackLiability += s * (p - 1); }
    else if (t.type === 'lay') { totalLay += s; totalLayLiability += s * (p - 1); }
  }
  return { totalBack, totalLay, totalBackLiability, totalLayLiability, totalBet };
}

// MatchDetail.jsx graph formula (with negation)
function plMatchDetailGraph(t1, t2) {
  return {
    t1: -(t1.totalBackLiability - t1.totalLayLiability - t2.totalBack + t2.totalLay),
    t2: -(t2.totalBackLiability - t2.totalLayLiability - t1.totalBack + t1.totalLay),
  };
}

// TossDetail.jsx formula (no negation)
function plTossDetail(t1, t2) {
  return {
    t1: t1.totalBackLiability - t1.totalLayLiability - t2.totalBack + t2.totalLay,
    t2: t2.totalBackLiability - t2.totalLayLiability - t1.totalBack + t1.totalLay,
  };
}

// Bookie perspective: negative of customer net if team wins
function plBookieCorrect(t1, t2) {
  return {
    t1: -(t1.totalBackLiability - t1.totalLayLiability - t2.totalBack + t2.totalLay),
    t2: -(t2.totalBackLiability - t2.totalLayLiability - t1.totalBack + t1.totalLay),
  };
}

function pctDiff(a, b) {
  if (a == null || b == null) return null;
  if (Math.abs(a) < 1 && Math.abs(b) < 1) return Math.abs(a - b);
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / denom * 100;
}

async function verifySnapshot(matchId, label) {
  const { data: snap } = await axios.get('https://tennisliveload.com/api/cricket/snapshot', { params: { matchId } });
  const t1 = snap.teamNames[0], t2 = snap.teamNames[1];
  const t1Trades = snap.teams?.[t1]?.trades || [];
  const t2Trades = snap.teams?.[t2]?.trades || [];
  const td1 = processTeamData(t1Trades);
  const td2 = processTeamData(t2Trades);

  const am1 = snap.advancedMetrics?.team1 || {};
  const am2 = snap.advancedMetrics?.team2 || {};
  const amv1 = snap.advancedMetricsV2?.team1 || {};
  const amv2 = snap.advancedMetricsV2?.team2 || {};
  const sp = snap.deepMetrics?.simplePL || {};
  const dp = snap.deepMetrics?.derivedPL || {};
  const t1Data = snap.teams?.[t1] || {};
  const t2Data = snap.teams?.[t2] || {};

  const plGraph = plMatchDetailGraph(td1, td2);
  const plToss = plTossDetail(td1, td2);
  const plBook = plBookieCorrect(td1, td2);

  // What UI shows on Simple tab (MatchDetail)
  const uiPl1 = sp.team1_win ?? t1Data.pnlIfWins;
  const uiPl2 = sp.team2_win ?? t2Data.pnlIfWins;

  // What UI shows on Graph tab after override
  const graphUiPl1 = sp.team1_win ?? t1Data.pnlIfWins ?? plGraph.t1;
  const graphUiPl2 = sp.team2_win ?? t2Data.pnlIfWins ?? plGraph.t2;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}: ${snap.matchName} (${matchId})`);
  console.log(`${'='.repeat(70)}`);

  // Volume checks
  console.log('\n📊 VOLUME — API vs Trades Sum:');
  const checks = [
    ['advMetrics.back T1', am1.back, td1.totalBack],
    ['advMetrics.lay T1', am1.lay, td1.totalLay],
    ['advMetricsV2.back T1', amv1.back, td1.totalBack],
    ['advMetricsV2.lay T1', amv1.lay, td1.totalLay],
    ['advMetricsV2.totalBet T1', amv1.totalBet, td1.totalBet],
    ['advMetrics.back T2', am2.back, td2.totalBack],
    ['advMetricsV2.totalBet T2', amv2.totalBet, td2.totalBet],
  ];
  for (const [name, api, calc] of checks) {
    const diff = pctDiff(api, calc);
    const ok = diff != null && diff < 1;
    console.log(`  ${ok ? '✅' : '⚠️'} ${name}: API=${fmt(api)} | Trades=${fmt(calc)} | diff=${diff?.toFixed(2)}%`);
  }

  // P/L checks
  console.log('\n💰 P/L IF WINS — Sources:');
  console.log(`  API simplePL.team1_win:     ${fmt(sp.team1_win)}`);
  console.log(`  API simplePL.team2_win:     ${fmt(sp.team2_win)}`);
  console.log(`  API derivedPL.team1_win:    ${fmt(dp.team1_win)}`);
  console.log(`  API derivedPL.team2_win:    ${fmt(dp.team2_win)}`);
  console.log(`  API teams[].pnlIfWins T1:   ${fmt(t1Data.pnlIfWins)}`);
  console.log(`  API teams[].pnlIfWins T2:   ${fmt(t2Data.pnlIfWins)}`);
  console.log(`  Calc MatchDetail (graph):   T1=${fmt(plGraph.t1)} T2=${fmt(plGraph.t2)}`);
  console.log(`  Calc TossDetail:            T1=${fmt(plToss.t1)} T2=${fmt(plToss.t2)}`);

  const uiVsApi1 = pctDiff(uiPl1, sp.team1_win);
  const uiVsApi2 = pctDiff(uiPl2, sp.team2_win);
  console.log(`\n  UI Simple Tab shows:        T1=${fmt(uiPl1)} T2=${fmt(uiPl2)}`);
  console.log(`  UI vs API simplePL:         T1 diff=${uiVsApi1?.toFixed(2)}% T2 diff=${uiVsApi2?.toFixed(2)}% ${uiVsApi1 < 0.01 && uiVsApi2 < 0.01 ? '✅ MATCH' : '⚠️'}`);

  const calcVsApi1 = pctDiff(plGraph.t1, sp.team1_win);
  const calcVsApi2 = pctDiff(plGraph.t2, sp.team2_win);
  const tossVsApi1 = pctDiff(plToss.t1, sp.team1_win);
  console.log(`  Graph calc vs API simplePL: T1=${calcVsApi1?.toFixed(2)}% T2=${calcVsApi2?.toFixed(2)}%`);
  console.log(`  Toss calc vs API simplePL:  T1=${tossVsApi1?.toFixed(2)}%`);

  // Sign check: Toss vs MatchDetail graph
  const signMatch = Math.sign(plToss.t1) === Math.sign(plGraph.t1);
  console.log(`\n  ⚠️ SIGN CHECK TossDetail vs MatchDetail Graph: ${signMatch ? '✅ Same sign' : '❌ OPPOSITE SIGN — BUG!'}`);

  // deepMetrics totals
  const tot = snap.deepMetrics?.totals || {};
  console.log('\n📦 deepMetrics.totals vs trades:');
  console.log(`  totalBetTeam1: API=${fmt(tot.totalBetTeam1 ?? tot.team1)} Trades=${fmt(td1.totalBet)}`);
  console.log(`  totalBetTeam2: API=${fmt(tot.totalBetTeam2 ?? tot.team2)} Trades=${fmt(td2.totalBet)}`);

  // inPlay vs preMatch
  console.log('\n🕐 inPlay vs preMatch volume:');
  console.log(`  preMatch T1 back: ${fmt(snap.preMatchVolume?.team1?.back)} lay: ${fmt(snap.preMatchVolume?.team1?.lay)}`);
  console.log(`  inPlay T1 back:   ${fmt(snap.inPlayVolume?.team1?.back)} lay: ${fmt(snap.inPlayVolume?.team1?.lay)}`);

  return { signBug: !signMatch, uiPlOk: uiVsApi1 < 0.01 && uiVsApi2 < 0.01, calcVsApi: calcVsApi1, tossVsApi: tossVsApi1 };
}

function fmt(n) {
  if (n == null) return '—';
  return Math.round(n).toLocaleString('en-IN');
}

(async () => {
  const matches = [
    { id: '35896815', label: 'Cricket ended' },
    { id: '35898055', label: 'Cricket live/ended' },
    { id: '35896816', label: 'Colombo toss' },
  ];

  // Also get a live match
  const { data: matchList } = await axios.get('https://tennisliveload.com/api/cricket/matches');
  const live = matchList.find(m => m.status === 'in-play');
  if (live) matches.push({ id: live.matchId, label: 'Live match' });

  const tossList = await axios.get('https://tennisliveload.com/api/toss/matches');
  const tossLive = (tossList.data || []).find(m => m.status === 'in-play');
  if (tossLive) matches.push({ id: tossLive.matchId, label: 'Toss live', type: 'toss' });

  let signBugs = 0, uiOk = 0, calcIssues = 0;

  for (const m of matches) {
    const url = m.type === 'toss'
      ? 'https://tennisliveload.com/api/toss/snapshot'
      : 'https://tennisliveload.com/api/cricket/snapshot';
    const { data: snap } = await axios.get(url, { params: { matchId: m.id } });
    const t1 = snap.teamNames?.[0], t2 = snap.teamNames?.[1];
    if (!t1) continue;

    const t1Trades = snap.teams?.[t1]?.trades || [];
    const t2Trades = snap.teams?.[t2]?.trades || [];
    const td1 = processTeamData(t1Trades);
    const td2 = processTeamData(t2Trades);
    const sp = snap.deepMetrics?.simplePL || {};
    const plGraph = plMatchDetailGraph(td1, td2);
    const plToss = plTossDetail(td1, td2);
    const amv1 = snap.advancedMetricsV2?.team1 || {};

    console.log(`\n${'='.repeat(70)}`);
    console.log(`${m.label}: ${snap.matchName} (${m.id}) [${m.type || 'cricket'}]`);

    console.log('\n📊 VOLUME — API vs Trades:');
    const v1back = pctDiff(amv1.back, td1.totalBack);
    const v1lay = pctDiff(amv1.lay, td1.totalLay);
    console.log(`  advV2.back T1: API=${fmt(amv1.back)} Trades=${fmt(td1.totalBack)} diff=${v1back?.toFixed(1)}% ${v1back < 5 ? '✅' : '⚠️'}`);
    console.log(`  advV2.lay T1:  API=${fmt(amv1.lay)} Trades=${fmt(td1.totalLay)} diff=${v1lay?.toFixed(1)}% ${v1lay < 5 ? '✅' : '⚠️'}`);

    console.log('\n💰 P/L:');
    console.log(`  API simplePL:  T1=${fmt(sp.team1_win)} T2=${fmt(sp.team2_win)}`);
    console.log(`  Graph calc:    T1=${fmt(plGraph.t1)} T2=${fmt(plGraph.t2)}`);
    console.log(`  Toss calc:     T1=${fmt(plToss.t1)} T2=${fmt(plToss.t2)}`);
    const signOk = Math.sign(plToss.t1) === Math.sign(plGraph.t1);
    console.log(`  Sign match: ${signOk ? '✅' : '❌ OPPOSITE — TossDetail BUG'}`);
    if (!signOk) signBugs++;

    const cv1 = pctDiff(plGraph.t1, sp.team1_win);
    const tv1 = pctDiff(plToss.t1, sp.team1_win);
    console.log(`  Graph vs API: ${cv1?.toFixed(1)}% | Toss vs API: ${tv1?.toFixed(1)}%`);
    if (cv1 > 5) calcIssues++;
    if (sp.team1_win != null) uiOk++;

    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}`);
  console.log(`Sign bugs (TossDetail vs MatchDetail): ${signBugs}`);
  console.log(`Graph calc vs API simplePL mismatches (>5%): ${calcIssues}`);
})();
