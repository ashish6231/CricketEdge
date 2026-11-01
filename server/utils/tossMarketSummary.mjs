import { finiteNumber, getSelectionStakes, getMarketExposureFromTrades, latestMatchedPrice, timestamp } from './bookiePl.mjs';

const nonNegative = value => {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? number : null;
};
const price = value => {
  const number = finiteNumber(value);
  return number > 1 ? number : null;
};
const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function findRunner(runners, name, index) {
  if (!Array.isArray(runners)) return null;
  return runners.find(runner => normalized(runner.runnerName || runner.name) === normalized(name))
    || (!runners[index]?.runnerName && !runners[index]?.name ? runners[index] : null);
}

/** Compact current toss values for list cards. V2 liabilities are never matched stakes. */
export function getTossMarketSummary(snapshot, matchInfo = {}) {
  const snap = snapshot?.error ? null : snapshot;
  const parts = String(matchInfo.matchName || '').split(/\s+v(?:s)?\.?\s+/i);
  const names = [0,1].map(index => snap?.teamNames?.[index] || matchInfo[`team${index+1}`] || parts[index] || `Team ${index+1}`);
  const exposure = getMarketExposureFromTrades(snap, ...names);
  const teams = names.map((name,index) => {
    const runner = findRunner(snap?.runners, name, index) || findRunner(matchInfo.runners, name, index);
    const level = runner?.ex?.availableToBack?.[0] || runner?.availableToBack?.[0];
    const livePrice = price(runner?.back) ?? price(runner?.backPrice) ?? price(level?.price) ?? price(runner?.price);
    const odds = livePrice ?? latestMatchedPrice(snap?.teams?.[name]?.trades || []);
    const liquidity = livePrice == null ? null : nonNegative(runner?.backSize) ?? nonNegative(level?.size);
    return {name,money:getSelectionStakes(snap,name).totalBet,odds,liquidity,
      netExposure:exposure[`team${index+1}`].netExposure};
  });
  const sum = teams.every(team => team.money != null) ? teams[0].money + teams[1].money : null;
  const totalMatched = nonNegative(snap?.totalMatched) ?? sum ?? nonNegative(matchInfo.totalMatched);
  return {team1:teams[0],team2:teams[1],totalMatched,
    updatedAt:timestamp(snap?.serverTime ?? snap?.updatedAt),
    available:teams.some(team => team.money != null || team.odds != null || team.netExposure != null)};
}
