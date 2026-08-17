function isEndedMatch(match) {
  return match?.status === 'ended';
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

module.exports = { isEndedMatch, filterMatchesForViewer, guestMayViewMatch };
