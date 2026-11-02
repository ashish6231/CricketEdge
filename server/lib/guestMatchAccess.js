function isEndedMatch(match) {
  if (!match || !match.status) return false;
  const s = String(match.status).trim().toLowerCase();
  return ['ended', 'verified', 'pending', 'closed', 'completed', 'finished', 'result', 'cancelled', 'canceled', 'abandoned'].includes(s);
}

/** Lists are public — guests see live/upcoming/ended. Detail is gated separately. */
function filterMatchesForViewer(matches, _user) {
  return Array.isArray(matches) ? matches : [];
}

/** Detail: guests may open ended only; live/upcoming need login (then Pro). */
function guestMayViewMatch(matchInfo, user) {
  if (user) return true;
  return isEndedMatch(matchInfo);
}

/** Toss/session snapshots are keyed by cricket or market id — allow guest if any related row is ended. */
function guestMayViewFromInfos(user, infos) {
  if (user) return true;
  return (Array.isArray(infos) ? infos : []).some(isEndedMatch);
}

module.exports = { isEndedMatch, filterMatchesForViewer, guestMayViewMatch, guestMayViewFromInfos };
