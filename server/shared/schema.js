/**
 * shared/schema.js
 * Common Match, Odds, Toss, and Session type definitions and normalization utilities.
 * Ensures both TennisLiveLoad and CREX data are transformed into one standard format.
 */

/**
 * Standard Match Object
 * @typedef {Object} NormalizedMatch
 * @property {string} id - Canonical match ID
 * @property {string} matchName - Formatted "Team 1 v Team 2"
 * @property {string} team1 - Home / First team
 * @property {string} team2 - Away / Second team
 * @property {string} competitionName - Tournament / League name
 * @property {string} format - T20, ODI, Test, League, etc.
 * @property {number} startTime - Epoch timestamp in ms
 * @property {string} status - 'live' | 'upcoming' | 'completed' | 'ended'
 * @property {boolean} inPlay - Whether match is currently active
 * @property {string} source - 'tennisliveload' | 'crex' | 'merged'
 * @property {Object} [odds] - Match odds (back/lay, probabilities)
 * @property {Object} [crex] - Real-time CREX scorecard & commentary
 * @property {Object} [toss] - Toss information and prediction
 * @property {Object} [session] - Session markets and trades
 * @property {Object} [snapshot] - Deep analytics (PNL, volume, sentiment, AI prediction)
 */

function createNormalizedMatch(raw = {}) {
  const matchId = String(raw.id || raw.matchId || raw.match_id || '').trim();
  const rawName = String(raw.name || raw.matchName || raw.eventName || raw.title || '').trim();
  
  let team1 = String(raw.team1 || '').trim();
  let team2 = String(raw.team2 || '').trim();

  if ((!team1 || !team2) && rawName.includes(' v ')) {
    const parts = rawName.split(' v ');
    team1 = parts[0]?.trim() || team1;
    team2 = parts[1]?.trim() || team2;
  } else if ((!team1 || !team2) && rawName.includes(' vs ')) {
    const parts = rawName.split(' vs ');
    team1 = parts[0]?.trim() || team1;
    team2 = parts[1]?.trim() || team2;
  }

  const rawStatus = String(raw.status || '').toLowerCase();
  const isEnded = ['ended', 'verified', 'pending', 'completed', 'closed'].includes(rawStatus) ||
    /won by|won the|match drawn|match tied|no result/i.test(raw.crex?.statusText || '');

  const inPlay = Boolean(!isEnded && (raw.inPlay || rawStatus === 'in-play' || rawStatus === 'live'));

  let normalizedStatus = 'upcoming';
  if (isEnded) normalizedStatus = 'completed';
  else if (inPlay) normalizedStatus = 'live';

  return {
    id: matchId,
    matchId: matchId, // Backward-compat with existing frontend components
    matchName: rawName || (team1 && team2 ? `${team1} v ${team2}` : 'Unknown Match'),
    team1: team1 || 'Team 1',
    team2: team2 || 'Team 2',
    competitionName: String(raw.competitionName || raw.competition || raw.seriesName || 'Other').trim(),
    format: String(raw.format || raw.matchFormat || 'T20').toUpperCase(),
    startTime: raw.startTime ? Number(raw.startTime) : Date.now(),
    status: normalizedStatus,
    inPlay: inPlay,
    totalMatched: Number(raw.totalMatched || raw.volume || 0),
    source: raw.source || 'merged',
    odds: raw.odds || null,
    crex: raw.crex || null,
    toss: raw.toss || null,
    session: raw.session || null,
    snapshot: raw.snapshot || null,
    updatedAt: Date.now(),
  };
}

/**
 * Standard Odds Object
 * @typedef {Object} NormalizedOdds
 * @property {string} matchId
 * @property {Array<{runnerName: string, back: number, lay: number, backSize: number, laySize: number}>} runners
 * @property {Object} bookmakerExposure
 * @property {number} updatedAt
 */
function createNormalizedOdds(matchId, rawOdds = {}) {
  const runners = Array.isArray(rawOdds.runners)
    ? rawOdds.runners.map(r => ({
        runnerName: String(r.runnerName || r.name || ''),
        back: Number(r.back || r.backPrice || 0),
        lay: Number(r.lay || r.layPrice || 0),
        backSize: Number(r.backSize || 0),
        laySize: Number(r.laySize || 0),
      }))
    : [];

  return {
    matchId: String(matchId),
    runners,
    bookmakerExposure: rawOdds.bookmakerExposure || rawOdds.exposure || {},
    marketName: rawOdds.marketName || 'Match Odds',
    totalMatched: Number(rawOdds.totalMatched || 0),
    updatedAt: Date.now(),
  };
}

/**
 * Merge two match records (e.g. TennisLiveLoad odds + CREX public scorecard)
 */
function mergeMatches(primary = {}, secondary = {}) {
  const merged = { ...primary, ...secondary };
  merged.id = primary.id || secondary.id;
  merged.matchId = merged.id;
  merged.matchName = primary.matchName || secondary.matchName;
  merged.competitionName = primary.competitionName || secondary.competitionName || 'Other';
  merged.odds = primary.odds || secondary.odds || null;
  merged.crex = secondary.crex || primary.crex || null;
  merged.toss = primary.toss || secondary.toss || null;
  merged.session = primary.session || secondary.session || null;
  merged.snapshot = primary.snapshot || secondary.snapshot || null;
  merged.source = 'merged';
  merged.updatedAt = Date.now();
  return merged;
}

module.exports = {
  createNormalizedMatch,
  createNormalizedOdds,
  mergeMatches,
};
