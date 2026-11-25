/**
 * services/dataCache.js
 * Unified Facade for Layer 3 (Storage) and Layer 4 (API-Broadcast).
 * 
 * Replaces the old duplicate background pollers and raw scraper calls.
 * All reads seamlessly source from the Normalizer & Redis live cache (0ms).
 */

const normalizer = require('./normalizer/normalizer');

let _lastUpdatedAt = Date.now();

function start() {
  console.log('ℹ️  [dataCache] unified facade active — background ingestion handled by Layer 1 & 2 pipeline.');
}

function stop() {
  // No-op: Background ingestion workers are cleanly managed by server/index.js
}

function getCricketMatches() {
  return normalizer.getCricketMatches();
}

function getTossMatches() {
  return normalizer.getTossMatches();
}

function getSessionMatches() {
  return normalizer.getSessionMatches();
}

function getTennisMatches() {
  return normalizer.getTennisMatches();
}

function getCricketMatchesUpdatedAt() {
  return normalizer.getCricketMatchesUpdatedAt ? normalizer.getCricketMatchesUpdatedAt() : new Date().toISOString();
}

function getTossMatchesUpdatedAt() {
  return normalizer.getTossMatchesUpdatedAt ? normalizer.getTossMatchesUpdatedAt() : new Date().toISOString();
}

function getSessionMatchesUpdatedAt() {
  return normalizer.getSessionMatchesUpdatedAt ? normalizer.getSessionMatchesUpdatedAt() : new Date().toISOString();
}

function getTennisMatchesUpdatedAt() {
  return normalizer.getTennisMatchesUpdatedAt ? normalizer.getTennisMatchesUpdatedAt() : new Date().toISOString();
}

async function getCricketSnapshot(matchId) {
  if(!normalizer.getMatchBundle(matchId)?.cricket)await normalizer.syncCachedBundle(matchId);
  const bundle = normalizer.getMatchBundle(matchId);
  return bundle?.cricket || null;
}

async function getTossSnapshot(matchId) {
  if(!normalizer.getMatchBundle(matchId)?.toss)await normalizer.syncCachedBundle(matchId);
  const bundle = normalizer.getMatchBundle(matchId);
  return bundle?.toss || null;
}

async function getSessionTrades(matchId) {
  if(!normalizer.getMatchBundle(matchId)?.session)await normalizer.syncCachedBundle(matchId);
  const bundle = normalizer.getMatchBundle(matchId);
  return bundle?.session || null;
}

async function getTennisSnapshot(matchId) {
  const bundle = normalizer.getMatchBundle(matchId);
  return bundle?.cricket || null;
}

async function getLiveOdds(matchId) {
  const bundle = normalizer.getMatchBundle(matchId);
  return bundle?.cricket?.odds || null;
}

function getCrexOverview() {
  return normalizer.getCrexOverview();
}

function getCrexDetail(matchId) {
  const bundle = normalizer.getMatchBundle(matchId);
  return bundle?.crex || null;
}

function setCrexDetail(matchId, detail) {
  normalizer.setCrexDetail(matchId, detail);
}

function getLastUpdatedAt() {
  return _lastUpdatedAt;
}

function isWarmedUp() {
  return normalizer.getCricketMatches().length > 0 || normalizer.getCrexOverview().length > 0;
}

async function getCricketFullData(includeSnapshots = true) {
  const matches = getCricketMatches();
  const result = {
    total_matches: Array.isArray(matches) ? matches.length : 0,
    scraped_at: new Date().toISOString(),
    matches: [],
  };
  if (!Array.isArray(matches)) return result;
  result.matches = await Promise.all(matches.map(async match => {
    const matchData = { match_info: match };
    if (includeSnapshots) {
      const mid = match.id || match.matchId;
      const snapshot = await getCricketSnapshot(mid);
      if (snapshot && !snapshot.error) matchData.snapshot = snapshot;
      else if (snapshot?.error) matchData.snapshot_error = snapshot.error;
    }
    return matchData;
  }));
  return result;
}

module.exports = {
  warmCricketSnapshots: ids => normalizer.syncCachedBundles(ids),
  start,
  stop,
  getCricketMatches,
  getTossMatches,
  getSessionMatches,
  getTennisMatches,
  getCricketSnapshot,
  getTossSnapshot,
  getSessionTrades,
  getTennisSnapshot,
  getLiveOdds,
  getCrexOverview,
  getCrexDetail,
  setCrexDetail,
  getCricketFullData,
  getLastUpdatedAt,
  isWarmedUp,
  getCricketMatchesUpdatedAt,
  getTossMatchesUpdatedAt,
  getSessionMatchesUpdatedAt,
  getTennisMatchesUpdatedAt,
};
