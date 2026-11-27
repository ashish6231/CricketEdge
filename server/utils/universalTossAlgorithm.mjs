import { getCurrentProviderTotals, getExplicitPreMatchProviderTotals } from './providerTotals.mjs';
import { getDirectProviderBookiePl, getMarketExposureFromTrades, tradeSide } from './bookiePl.mjs';

export const UNIVERSAL_TOSS_VERSION = 'toss-v20-higher-positive-bookie-pl';

export const INCOMPLETE_TOSS_DATA_MESSAGE = "Prediction data is incomplete, can't predict.";

const finite = value => value == null || !['number', 'string'].includes(typeof value) || String(value).trim() === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const validNames = names => Array.isArray(names) && names.length === 2
  && names.every(name => typeof name === 'string' && name.trim())
  && names[0].trim().toLowerCase() !== names[1].trim().toLowerCase();
const formatPl = value => `${value >= 0 ? '+' : '−'}€${Math.abs(value).toFixed(2)}`;

/**
 * Group valid trades by odd (price) and return the price level with the
 * highest Total Traded volume (`back + lay`).
 */
export function getPeakTradedOdd(trades) {
  if (!Array.isArray(trades) || trades.length === 0) return null;
  const byPrice = new Map();
  for (const trade of trades) {
    const price = finite(trade?.price);
    const size = finite(trade?.size);
    const side = tradeSide(trade);
    if (price == null || price <= 1 || size == null || size <= 0 || !side) continue;
    byPrice.set(price, (byPrice.get(price) || 0) + size);
  }
  if (!byPrice.size) return null;
  let peak = null;
  for (const [price, traded] of [...byPrice.entries()].sort((a, b) => a[0] - b[0])) {
    if (!peak || traded > peak.traded) peak = { price, traded };
  }
  return peak;
}

/** Pick the team with a positive and higher Bookie P/L. */
export function selectTossWinner({ teamNames, pl } = {}) {
  if (!validNames(teamNames) || !Array.isArray(pl) || pl.length !== 2) return null;
  const pl1 = finite(pl[0]);
  const pl2 = finite(pl[1]);
  if (pl1 == null || pl2 == null || pl1 === pl2) return null;
  if (!(pl1 > 0 || pl2 > 0)) return null;
  const winnerIdx = pl1 > pl2 ? 0 : 1;
  return { winner: teamNames[winnerIdx], winnerIdx, pl: [pl1, pl2] };
}

export function getTossRuleInputs(snapshot) {
  const teamNames = snapshot?.teamNames;
  const providerTotals = getCurrentProviderTotals(snapshot) || getExplicitPreMatchProviderTotals(snapshot);
  const displayedPl = getDirectProviderBookiePl(snapshot, teamNames?.[0], teamNames?.[1]);
  const pl = [finite(displayedPl.pl1), finite(displayedPl.pl2)];
  const exposure = getMarketExposureFromTrades(snapshot, teamNames?.[0], teamNames?.[1]);
  const risk = {
    back: [finite(exposure.team1.backExposure), finite(exposure.team2.backExposure)],
    lay: [finite(exposure.team1.layExposure), finite(exposure.team2.layExposure)],
  };
  risk.net = [0, 1].map(index => risk.back[index] != null && risk.lay[index] != null
    ? finite(risk.back[index] - risk.lay[index]) : null);
  const peaks = validNames(teamNames)
    ? teamNames.map(name => getPeakTradedOdd(snapshot?.teams?.[name]?.trades))
    : [null, null];
  const rule = {
    mode: 'bookie-pl',
    selection: 'higher',
    requirePositivePl: true,
    signalCount: 1,
    predictorVersion: UNIVERSAL_TOSS_VERSION,
  };
  const available = !snapshot?.error && validNames(teamNames) && pl[0] != null && pl[1] != null;
  return {
    teamNames,
    peaks,
    providerTotals,
    pl,
    risk,
    netExposure: risk.net,
    period: 'current',
    rule,
    mode: rule.mode,
    selection: rule.selection,
    requirePositivePl: true,
    available,
    unavailableReason: available ? null : INCOMPLETE_TOSS_DATA_MESSAGE,
  };
}

/** Predict toss winner using positive and higher Bookie P/L across all leagues. */
export function getUniversalTossPrediction(snapshot, _competition = '') {
  const inputs = getTossRuleInputs(snapshot);
  const metadata = {
    predictorVersion: UNIVERSAL_TOSS_VERSION,
    tier: 'UNIVERSAL_TOSS_HIGHER_POSITIVE_BOOKIE_PL',
    algoName: 'Higher Positive Bookie P/L Toss Algorithm',
    ruleFamily: 'higher-positive-bookie-pl',
    validation: 'unvalidated-bookie-pl-rule',
    trainingSamples: 0,
    validationNote: 'Selects the team with a positive and higher current Bookie P/L.',
    inputTiming: 'current-displayed-bookie-pl',
    usedFallback: false,
  };
  const pick = inputs.available ? selectTossWinner(inputs) : null;
  if (!pick) {
    const abstainReason = inputs.unavailableReason
      || (inputs.pl[0] === inputs.pl[1]
        ? 'No pick: Bookie P/L is equal for both teams.'
        : 'No pick: neither team has a positive Bookie P/L.');
    return {
      ...metadata,
      winner: null,
      winnerName: null,
      abstain: true,
      reason: abstainReason,
    };
  }
  const { winner, winnerIdx, pl } = pick;
  const { providerTotals, risk, peaks } = inputs;
  const reason = `${winner} has the higher positive Bookie P/L (${formatPl(pl[winnerIdx])} vs ${formatPl(pl[1 - winnerIdx])}).`;
  const signals = [{
    label: 'Bookie P/L',
    sublabel: 'Team with positive and higher Bookie P/L wins the prediction',
    active: true,
    v1: formatPl(pl[0]),
    v2: formatPl(pl[1]),
    winnerWins: true,
  }];
  return {
    ...metadata,
    winner,
    winnerName: winner,
    winnerIdx,
    reason,
    pattern: 'HIGHER_POSITIVE_BOOKIE_PL',
    verdictTag: 'HIGHER POSITIVE P/L',
    confidence: { label: 'Rule support; future accuracy unvalidated', color: 'text-yellow-500', pct: 'Uncalibrated', calibrated: false },
    confidenceCalibrated: false,
    risk: { tier: 'unvalidated', label: 'Risk unvalidated', shortLabel: 'Unvalidated', wrongPct: 'Uncalibrated', calibrated: false, note: metadata.validationNote },
    algorithmEvidence: {
      peaks,
      risk,
      providerTotal: { team1: providerTotals?.[0] ?? null, team2: providerTotals?.[1] ?? null },
      pl: { team1: pl[0], team2: pl[1] },
      winnerIdx,
      signalCount: 1,
      mode: inputs.mode,
      selection: 'higher',
      requirePositivePl: true,
      inputSource: 'toss-current-display',
    },
    signals,
    activeSignals: 1,
    metrics: { t1: inputs.teamNames[0], t2: inputs.teamNames[1] },
    matchedRules: [{ reason, winner, priority: 100, selected: true }],
  };
}
