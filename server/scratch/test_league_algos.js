
const fs = require('fs');
const { getLeagueAlgorithmPrediction, getDefaultAlgorithmPrediction } = require('../utils/leagueAlgorithms');

const matchData = JSON.parse(fs.readFileSync('./server/data/match_dataset.json', 'utf8'));
const records = matchData.records || [];

function teamNamesMatch(a, b) {
  const na = String(a || '').trim().toLowerCase();
  const nb = String(b || '').trim().toLowerCase();
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

const verified = records.filter(r => r.actualWinner && r.actualWinner !== 'No Result');

const failsByLeague = {};

verified.forEach(r => {
  const s = r.snapshot;
  const pmv1 = s?.preMatchVolume?.team1;
  const pmv2 = s?.preMatchVolume?.team2;
  const m1 = pmv1 || s?.advancedMetricsV2?.team1 || s?.advancedMetrics?.team1;
  const m2 = pmv2 || s?.advancedMetricsV2?.team2 || s?.advancedMetrics?.team2;

  const b1 = m1?.back || 0;
  const b2 = m2?.back || 0;
  const l1 = m1?.lay || 0;
  const l2 = m2?.lay || 0;

  const prePnl1 = s?.preMatchPnl?.team1;
  const prePnl2 = s?.preMatchPnl?.team2;
  const sp = s?.deepMetrics?.simplePL || {};

  let pnl1 = 0, pnl2 = 0;
  if (prePnl1 != null && prePnl2 != null) {
    pnl1 = prePnl1;
    pnl2 = prePnl2;
  } else if (sp.team1_win != null) {
    pnl1 = sp.team1_win;
    pnl2 = sp.team2_win ?? 0;
  } else {
    pnl1 = (l1 - b1) + (b2 - l2);
    pnl2 = (l2 - b2) + (b1 - l1);
  }

  const team1 = s?.teamNames?.[0] || r.team1;
  const team2 = s?.teamNames?.[1] || r.team2;
  const comp = r.competitionName || 'Unknown';

  const predObj = getLeagueAlgorithmPrediction(comp, b1, b2, l1, l2, pnl1, pnl2, team1, team2, s)
    || getDefaultAlgorithmPrediction(b1, b2, l1, l2, pnl1, pnl2, team1, team2);

  const pred = predObj?.winner;
  const isPass = teamNamesMatch(pred, r.actualWinner);
  if (!isPass) {
    if (!failsByLeague[comp]) failsByLeague[comp] = [];
    failsByLeague[comp].push({
      matchId: r.matchId,
      name: r.matchName,
      pred,
      tier: predObj?.tier,
      conf: predObj?.confidence,
      actual: r.actualWinner,
      team1, team2,
      b1, b2, l1, l2, pnl1, pnl2,
      prePnl1, prePnl2,
      bookieFav: s?.marketSignals?.bookieFavouriteOutcome,
      moreBetted: s?.marketSignals?.moreBettedTeam,
      msPred: s?.marketSignals?.prediction?.prediction,
      pattern: s?.marketSignals?.prediction?.pattern,
      date: r.capturedAt
    });
  }
});

console.log('=== FAILS GROUPED BY LEAGUE ===');
for (const [league, items] of Object.entries(failsByLeague)) {
  console.log(`\n🏆 LEAGUE: "${league}" (${items.length} fails)`);
  items.forEach((item, idx) => {
    console.log(`  ${idx + 1}. [${item.matchId}] ${item.name}`);
    console.log(`     Pred: ${item.pred} (${item.tier}) | Actual: ${item.actual}`);
    console.log(`     b1: ${item.b1}, b2: ${item.b2}, l1: ${item.l1}, l2: ${item.l2}`);
    console.log(`     pnl1: ${item.pnl1}, pnl2: ${item.pnl2}, prePnl: [${item.prePnl1}, ${item.prePnl2}]`);
    console.log(`     bookieFav: ${item.bookieFav}, moreBetted: ${item.moreBetted}, msPred: ${item.msPred}`);
  });
}
