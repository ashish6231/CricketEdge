/**
 * shared/matchStatus.js
 * Single definition of live/ended provider statuses for listing, polling and
 * access checks. Dataset capture code that needs a *verified result* (and so
 * deliberately excludes `pending`/`cancelled`) keeps its own stricter sets.
 */

const ENDED_STATUSES = Object.freeze([
  'ended', 'verified', 'pending', 'closed', 'completed', 'finished', 'result',
  'cancelled', 'canceled', 'abandoned',
]);
const LIVE_STATUSES = Object.freeze(['live', 'in-play', 'inplay']);

const ENDED_SET = new Set(ENDED_STATUSES);
const LIVE_SET = new Set(LIVE_STATUSES);

const normalizeStatus = status => String(status ?? '').trim().toLowerCase();

function isEndedStatus(status) {
  return ENDED_SET.has(normalizeStatus(status));
}

function isLiveStatus(status) {
  return LIVE_SET.has(normalizeStatus(status));
}

function isEndedMatch(match) {
  return Boolean(match) && isEndedStatus(match.status);
}

function isLiveMatch(match) {
  return Boolean(match) && !isEndedMatch(match) && Boolean(match.inPlay || isLiveStatus(match.status));
}

/** True when the status is already decided by the provider (live or ended). */
function isTerminalOrLiveStatus(status) {
  return isEndedStatus(status) || isLiveStatus(status);
}

module.exports = {
  ENDED_STATUSES,
  LIVE_STATUSES,
  normalizeStatus,
  isEndedStatus,
  isLiveStatus,
  isEndedMatch,
  isLiveMatch,
  isTerminalOrLiveStatus,
};
