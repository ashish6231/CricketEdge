import { getPreMatchMarketConsensus } from './preMatchMarketConsensus.mjs';

export const WOMENS_SPRING_LEAGUE = "Women's T20 Spring Challenge";

// Team names overlap WBBL and WNCL, so only competition metadata selects this.
export function isWomensSpringT20(compName = '') {
  const name = String(compName).toLowerCase()
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return /^t20 spring challenge(?: \d{4})?$/.test(name)
    || (/\bwomens?\b/.test(name) && /\bspring\b/.test(name)
      && /\b(t20|twenty20)\b/.test(name));
}

export function springTeamKey(name) {
  const key = String(name || '').toLowerCase().replace(/\b(womens?|w)\b/g, '').replace(/[^a-z0-9]/g, '');
  return ['australiancapitalterritory', 'act', 'actmeteors'].includes(key) ? 'actmeteors' : key;
}

export function getWomensSpringMatchPrediction(snap, b1, b2, l1, l2, pnl1, pnl2, team1, team2) {
  // Same initial consensus as Legends: own back + opponent lay, frozen
  // activity, and lower bookmaker P/L. Spring keeps its own tier/profile.
  return getPreMatchMarketConsensus(
    snap, b1, b2, l1, l2, pnl1, pnl2, team1, team2,
    'WOMENS_SPRING_T20_PREMATCH_CONSENSUS',
  );
}

function timestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  const result = Number.isFinite(numeric)
    ? (numeric < 1e12 ? numeric * 1000 : numeric)
    : Date.parse(value);
  return Number.isFinite(result) && result > 0 ? result : null;
}

// These derived fields are not frozen by the provider. Only consume them from
// a snapshot demonstrably observed before kickoff; archived live signals must
// never be relabeled as a successful pre-match forecast.
export function applyWomensSpringTrapOverride(input, baseline) {
  if (!baseline || !isWomensSpringT20(input?.competitionName)) return baseline;
  const start = timestamp(input.startTime);
  const observed = timestamp(input.serverTime ?? input.capturedAt);
  const captured = timestamp(input.capturedAt);
  if (start === null || observed === null || observed >= start
    || (captured !== null && captured >= start)
    || input.inPlay === true
    || /^(live|inplay|in-play|ended|completed|closed|verified)$/i.test(input.status || '')
    || /after-start/i.test(input.inputTiming || '')) return baseline;

  const normalize = name => typeof name === 'string' ? name.trim().toLowerCase() : '';
  const trap = input.marketSignals?.prediction;
  const support = input.syntheticSupport;
  if (normalize(trap?.pattern) !== 'the market trap'
    || !Number.isFinite(support?.supportRatio) || support.supportRatio <= 1) return baseline;
  const winnerIdx = input.teamNames?.findIndex(name => normalize(name) === normalize(trap.prediction));
  if (![0, 1].includes(winnerIdx) || winnerIdx === baseline.winnerIdx
    || normalize(support.strongerTeam) !== normalize(input.teamNames[winnerIdx])) return baseline;

  const winner = input.teamNames[winnerIdx];
  const evidence = baseline.marketEvidence;
  const agreeingSignals = evidence ? [evidence.support.leaderIdx, evidence.activity.leaderIdx,
    evidence.bookmakerPressureIdx].filter(index => index === winnerIdx).length : 0;
  return {
    ...baseline, winner, winnerIdx,
    tier: 'WOMENS_SPRING_T20_TRAP_SUPPORT_OVERRIDE',
    ruleFamily: 'spring-prematch-trap-support',
    ruleAdjusted: true,
    reason: `Pre-match Market Trap and synthetic support (${support.supportRatio.toFixed(2)}x) agree on ${winner}, opposing the consensus pick ${baseline.winner}.`,
    confidence: 'Trap and synthetic support agree; future accuracy uncalibrated',
    confidenceCalibrated: false,
    validation: 'unvalidated-spring-trap-rule',
    inputTiming: 'pre-match-snapshot-signals',
    marketEvidence: evidence ? { ...evidence, agreeingSignals } : evidence,
    trapOverrideEvidence: {
      consensusWinner: baseline.winner,
      trapPrediction: winner,
      syntheticSupportTeam: winner,
      supportRatio: support.supportRatio,
      observedAt: new Date(observed).toISOString(),
      startTime: new Date(start).toISOString(),
    },
  };
}
