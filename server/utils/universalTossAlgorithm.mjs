import { getCurrentProviderTotals, getExplicitPreMatchProviderTotals } from './providerTotals.mjs';
import { getBookiePlFromMatchedTrades, getMarketExposureFromTrades } from './bookiePl.mjs';
import { resolveInternationalMatchLeague } from './providerTotalMatchPredictor.mjs';

export const UNIVERSAL_TOSS_VERSION = 'toss-v16-complete-league-net-exposure';

export const INCOMPLETE_TOSS_DATA_MESSAGE = "Prediction data is incomplete, can't predict.";

/** Competition metadata determines the exception; domestic women's leagues stay lower. */
export function usesHigherTossExposure(snapshot, competition = '') {
  const explicit = typeof competition === 'object' && competition !== null
    ? competition.competitionName || competition.seriesName || '' : competition;
  const name = String(explicit || snapshot?.competitionName || snapshot?.seriesName || '');
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/20\d{2}$/, '');
  return /^(?:wbbl|womens?bigbash(?:league)?)$/.test(key)
    || !!resolveInternationalMatchLeague(name)
    || (/\binternationals?\b/i.test(name) && !/\bleague\b/i.test(name));
}

const finite = value => value == null || !['number','string'].includes(typeof value) || String(value).trim() === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const validNames = names => Array.isArray(names) && names.length === 2
  && names.every(name => typeof name === 'string' && name.trim())
  && names[0].trim().toLowerCase() !== names[1].trim().toLowerCase();
const validPair = values => Array.isArray(values) && values.length === 2 && values.every(value => value != null && value >= 0 && Number.isFinite(value));

const positivePair = values => validPair(values) && values.every(value => value > 0);

/** All four back/lay exposure values must be positive before selecting a winner. */
export function selectTossWinner({teamNames, risk, selection = 'lower'} = {}) {
  if (!validNames(teamNames) || !positivePair(risk?.back) || !positivePair(risk?.lay)) return null;
  const netExposure = risk.back.map((back,index) => finite(back - risk.lay[index]));
  if (netExposure.some(value => value == null) || netExposure[0] === netExposure[1]) return null;
  // Compare signed values: negative net exposure and a balanced net of zero are valid.
  const winnerIdx = selection === 'higher' ? (netExposure[0] > netExposure[1] ? 0 : 1) : (netExposure[0] < netExposure[1] ? 0 : 1);
  return {winner:teamNames[winnerIdx],winnerIdx,netExposure};
}

export function getTossRuleInputs(snapshot, competition = '') {
  const teamNames = snapshot?.teamNames;
  const providerTotals = getCurrentProviderTotals(snapshot) || getExplicitPreMatchProviderTotals(snapshot);
  const displayedPl = getBookiePlFromMatchedTrades(snapshot,teamNames?.[0],teamNames?.[1]);
  const pl = [finite(displayedPl.pl1),finite(displayedPl.pl2)];
  // Net exposure is the same Back risk − Lay risk displayed on TossDetail.
  const exposure = getMarketExposureFromTrades(snapshot,teamNames?.[0],teamNames?.[1]);
  const risk = {
    back:[finite(exposure.team1.backExposure),finite(exposure.team2.backExposure)],
    lay:[finite(exposure.team1.layExposure),finite(exposure.team2.layExposure)],
  };
  risk.net = [0,1].map(index => risk.back[index] != null && risk.lay[index] != null
    ? finite(risk.back[index] - risk.lay[index]) : null);
  risk.available = positivePair(risk.back) && positivePair(risk.lay) && risk.net.every(value => value != null);
  const rule = {
    mode:'risk',selection:usesHigherTossExposure(snapshot,competition) ? 'higher' : 'lower',
    requirePositivePl:false,signalCount:1,predictorVersion:UNIVERSAL_TOSS_VERSION,
  };
  const available = !snapshot?.error && validNames(teamNames) && risk.available;
  return {teamNames,providerTotals,pl,risk,netExposure:risk.net,period:'current',rule,
    mode:rule.mode,selection:rule.selection,requirePositivePl:false,available,unavailableReason:available ? null : INCOMPLETE_TOSS_DATA_MESSAGE};
}

/** WBBL and internationals select higher net exposure; every other league selects lower. */
export function getUniversalTossPrediction(snapshot, competition = '') {
  const inputs = getTossRuleInputs(snapshot,competition);
  const direction = inputs.selection;
  const upper = direction.toUpperCase();
  const metadata = {
    predictorVersion:UNIVERSAL_TOSS_VERSION,
    tier:`UNIVERSAL_TOSS_${upper}_NET_EXPOSURE`,
    algoName:`${direction === 'higher' ? 'Higher' : 'Lower'} Net Exposure Toss Algorithm`,
    ruleFamily:`${direction}-net-back-minus-lay-exposure`,
    validation:'unvalidated-league-exposure-rule',trainingSamples:0,
    validationNote:'WBBL and international matches select higher net exposure (back minus lay). All other leagues select lower net exposure. Future accuracy is unvalidated.',
    inputTiming:'current-displayed-back-and-lay-risk',usedFallback:false,
  };
  const pick = inputs.available ? selectTossWinner(inputs) : null;
  if (!pick) return {...metadata,winner:null,winnerName:null,abstain:true,
    reason:inputs.unavailableReason || 'No pick: net exposure is equal for both teams.'};
  const {winner,winnerIdx} = pick;
  const {providerTotals,pl,risk} = inputs;
  const reason = `${winner} has the ${direction} net exposure (${risk.back[winnerIdx].toFixed(2)} back − ${risk.lay[winnerIdx].toFixed(2)} lay = ${risk.net[winnerIdx].toFixed(2)} vs ${risk.net[1-winnerIdx].toFixed(2)}).`;
  const signals = [{label:'Net exposure (Back − Lay)',sublabel:`${direction === 'higher' ? 'Higher' : 'Lower'} net exposure selects the winner`,active:true,
    v1:risk.net[0].toFixed(2),v2:risk.net[1].toFixed(2),winnerWins:true}];
  return {...metadata,winner,winnerName:winner,winnerIdx,reason,
    pattern:`${upper}_NET_BACK_MINUS_LAY_EXPOSURE`,verdictTag:`${upper} NET EXPOSURE`,
    confidence:{label:'Rule support; future accuracy unvalidated',color:'text-yellow-500',pct:'Uncalibrated',calibrated:false},
    confidenceCalibrated:false,
    risk:{tier:'unvalidated',label:'Risk unvalidated',shortLabel:'Unvalidated',wrongPct:'Uncalibrated',calibrated:false,note:metadata.validationNote},
    algorithmEvidence:{risk,providerTotal:{team1:providerTotals?.[0] ?? null,team2:providerTotals?.[1] ?? null},
      pl:{team1:pl[0],team2:pl[1]},winnerIdx,signalCount:1,mode:inputs.mode,
      selection:direction,requirePositivePl:false,inputSource:'toss-current-display'},
    signals,activeSignals:1,metrics:{t1:inputs.teamNames[0],t2:inputs.teamNames[1]},
    matchedRules:[{reason,winner,priority:100,selected:true}],
  };
}
