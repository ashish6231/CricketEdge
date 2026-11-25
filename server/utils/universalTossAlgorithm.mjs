import { getCurrentProviderTotals, getExplicitPreMatchProviderTotals } from './providerTotals.mjs';
import { getDirectProviderBookiePl, getMarketExposureFromTrades, tradeSide } from './bookiePl.mjs';

export const UNIVERSAL_TOSS_VERSION = 'toss-v19-peak-odd-lower-traded-volume';

export const INCOMPLETE_TOSS_DATA_MESSAGE = "Prediction data is incomplete, can't predict.";

const finite = value => value == null || !['number', 'string'].includes(typeof value) || String(value).trim() === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const validNames = names => Array.isArray(names) && names.length === 2
  && names.every(name => typeof name === 'string' && name.trim())
  && names[0].trim().toLowerCase() !== names[1].trim().toLowerCase();

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

/** Pick the team whose highest-traded-volume odd has the LOWER traded amount. */
export function selectTossWinner({ teamNames, peaks } = {}) {
  if (!validNames(teamNames) || !Array.isArray(peaks) || peaks.length !== 2) return null;
  if (!peaks[0] || !peaks[1] || !(peaks[0].traded > 0) || !(peaks[1].traded > 0)) return null;
  if (peaks[0].traded === peaks[1].traded) return null;
  const winnerIdx = peaks[0].traded < peaks[1].traded ? 0 : 1;
  return { winner: teamNames[winnerIdx], winnerIdx, peaks };
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
    mode: 'peak-odd-volume',
    selection: 'lower',
    requirePositivePl: false,
    signalCount: 1,
    predictorVersion: UNIVERSAL_TOSS_VERSION,
  };
  const available = !snapshot?.error && validNames(teamNames) && Boolean(peaks[0] && peaks[1]);
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
    requirePositivePl: false,
    available,
    unavailableReason: available ? null : INCOMPLETE_TOSS_DATA_MESSAGE,
  };
}

/** Predict toss winner using lower peak-odd traded volume across all leagues. */
export function getUniversalTossPrediction(snapshot, _competition = '') {
  const inputs = getTossRuleInputs(snapshot);
  const metadata = {
    predictorVersion: UNIVERSAL_TOSS_VERSION,
    tier: 'UNIVERSAL_TOSS_LOWER_PEAK_ODD_VOLUME',
    algoName: 'Lower Peak-Odd Traded Volume Toss Algorithm',
    ruleFamily: 'lower-peak-odd-traded-volume',
    validation: 'unvalidated-peak-odd-volume-rule',
    trainingSamples: 0,
    validationNote: 'Selects the odd with the highest traded volume for each team and predicts the team with the lower peak traded volume.',
    inputTiming: 'current-per-odd-traded-volume',
    usedFallback: false,
  };
  const pick = inputs.available ? selectTossWinner(inputs) : null;
  if (!pick) {
    return {
      ...metadata,
      winner: null,
      winnerName: null,
      abstain: true,
      reason: inputs.unavailableReason || 'No pick: peak-odd traded volume is equal for both teams.',
    };
  }
  const { winner, winnerIdx, peaks } = pick;
  const { providerTotals, pl, risk } = inputs;
  const winPeak = peaks[winnerIdx];
  const losePeak = peaks[1 - winnerIdx];
  const reason = `${winner} has the lower peak-odd traded volume (${winPeak.traded.toFixed(2)} @ ${winPeak.price.toFixed(2)} vs ${losePeak.traded.toFixed(2)} @ ${losePeak.price.toFixed(2)}).`;
  const signals = [{
    label: 'Peak-odd traded volume',
    sublabel: 'Team with lower highest-traded-odd volume wins the prediction',
    active: true,
    v1: `${peaks[0].traded.toFixed(2)} @ ${peaks[0].price.toFixed(2)}`,
    v2: `${peaks[1].traded.toFixed(2)} @ ${peaks[1].price.toFixed(2)}`,
    winnerWins: true,
  }];
  return {
    ...metadata,
    winner,
    winnerName: winner,
    winnerIdx,
    reason,
    pattern: 'LOWER_PEAK_ODD_TRADED_VOLUME',
    verdictTag: 'LOWER PEAK ODD VOLUME',
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
      selection: 'lower',
      requirePositivePl: false,
      inputSource: 'toss-current-display',
    },
    signals,
    activeSignals: 1,
    metrics: { t1: inputs.teamNames[0], t2: inputs.teamNames[1] },
    matchedRules: [{ reason, winner, priority: 100, selected: true }],
  };
}
