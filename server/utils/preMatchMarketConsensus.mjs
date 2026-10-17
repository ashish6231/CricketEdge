// Shared arithmetic for independently registered league consensus algorithms.
export function getPreMatchMarketConsensus(snap, b1, b2, l1, l2, pnl1, pnl2, team1, team2, tier) {
  const support1 = b1 + l2;
  const support2 = b2 + l1;
  const activity1 = Math.max(0, Number(snap?.preMatchTotalBets?.team1) || 0);
  const activity2 = Math.max(0, Number(snap?.preMatchTotalBets?.team2) || 0);
  const supportLeader = support1 === support2 ? null : support1 > support2 ? 0 : 1;
  const activityLeader = activity1 === activity2 ? null : activity1 > activity2 ? 0 : 1;
  const pressureLeader = Number.isFinite(pnl1) && Number.isFinite(pnl2) && pnl1 !== pnl2
    ? (pnl1 < pnl2 ? 0 : 1)
    : null;
  const votes = [supportLeader, activityLeader, pressureLeader].filter(Number.isInteger);
  const team1Votes = votes.filter(index => index === 0).length;
  const team2Votes = votes.filter(index => index === 1).length;
  const winnerIdx = team1Votes === team2Votes ? supportLeader : team1Votes > team2Votes ? 0 : 1;
  if (!Number.isInteger(winnerIdx)) return null;

  const supportTotal = support1 + support2;
  const activityTotal = activity1 + activity2;
  const supportPct1 = supportTotal > 0 ? support1 / supportTotal * 100 : 50;
  const supportPct2 = 100 - supportPct1;
  const activityPct1 = activityTotal > 0 ? activity1 / activityTotal * 100 : 50;
  const activityPct2 = 100 - activityPct1;
  const winner = winnerIdx === 0 ? team1 : team2;
  const agreeingSignals = winnerIdx === 0 ? team1Votes : team2Votes;
  const signalCount = votes.length;

  return {
    winner,
    tier,
    confidence: `Pre-match market consensus (${agreeingSignals}/${signalCount} signals)`,
    reason: `${winner} leads corrected support (${(winnerIdx === 0 ? supportPct1 : supportPct2).toFixed(0)}%); ${agreeingSignals}/${signalCount} frozen signals agree`,
    marketEvidence: {
      method: 'back-plus-opponent-lay',
      support: { team1: support1, team2: support2, pct1: supportPct1, pct2: supportPct2, leaderIdx: supportLeader },
      activity: { team1: activity1, team2: activity2, pct1: activityPct1, pct2: activityPct2, leaderIdx: activityLeader },
      bookmakerPressureIdx: pressureLeader,
      agreeingSignals,
      signalCount,
    },
  };
}
