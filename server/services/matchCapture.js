const { getDefaultStore } = require('./matchDatasetStore');
const scraperModule = require('./scraper');
const { predictMatchWinner: defaultPredictMatchWinner } = require('../utils/matchWinnerPredictor');
const { getCrexOverview, findCrexMatch, getCrexMatchDetail } = require('./crexService');

function sanitizeError(message) {
  if (!message) return 'Capture failed';
  return String(message).replace(/tennisliveload\.com/gi, 'live feed');
}

function hasSuccessfulSnapshot(snapshot) {
  if (snapshot === null || snapshot === undefined) return false;
  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  if (snapshot.error) return false;
  if (Object.keys(snapshot).length === 0) return false;
  return true;
}

function parseTeamsFromMatchName(matchName) {
  if (!matchName) return [null, null];
  const parts = String(matchName).split(/\s+v\s+/i);
  if (parts.length >= 2) {
    return [parts[0].trim(), parts[1].trim()];
  }
  return [null, null];
}

function extractTeams(snapshot, match) {
  const t1 = snapshot?.teamNames?.[0];
  const t2 = snapshot?.teamNames?.[1];
  if (t1 && t2) return [t1, t2];
  return parseTeamsFromMatchName(match.matchName || match.name);
}

function extractWinnerFromText(text, team1, team2) {
  if (!text) return null;
  const lowerText = text.toLowerCase();
  // Ensure we don't accidentally match if text is empty/null or if team1/team2 is null
  if (team1 && lowerText.includes(team1.toLowerCase())) return team1;
  if (team2 && lowerText.includes(team2.toLowerCase())) return team2;
  return null;
}

const IGNORED_MATCH_IDS = new Set(['36038646', '36039151']);

function shouldSkipExisting(existing, matchId) {
  if (matchId && IGNORED_MATCH_IDS.has(String(matchId))) return true;
  if (!existing) return false;
  if (existing.status === 'verified') return true;

  if (
    existing.status === 'pending'
    && hasSuccessfulSnapshot(existing.snapshot)
    && !existing.lastCaptureError
  ) {
    return true;
  }
  return false;
}

async function captureEndedMatches({
  scraper = scraperModule,
  store = getDefaultStore(),
  predictMatchWinner = defaultPredictMatchWinner,
  now = () => new Date(),
} = {}) {
  const summary = { scanned: 0, captured: 0, skipped: 0, failed: 0 };

  let res;
  try {
    res = await scraper.getAllCricketMatches();
  } catch {
    return { scanned: 0, captured: 0, skipped: 0, failed: 1 };
  }

  const matches = res?.matches || res;
  if (!Array.isArray(matches) || res?.error) {
    return { scanned: 0, captured: 0, skipped: 0, failed: 1 };
  }

  const eligible = matches.filter(
    (match) => match.status === 'ended' && (match.totalMatched || 0) > 0,
  );
  summary.scanned = eligible.length;

  const data = await store.load();
  const byMatchId = new Map(data.records.map((record) => [String(record.matchId), record]));

  // Fetch CREX overview to try and auto-resolve actual winners
  let crexOverview = [];
  try {
    crexOverview = await getCrexOverview();
  } catch (err) {
    console.error('Failed to fetch CREX overview during match capture:', err.message);
  }

  for (const match of eligible) {
    const matchId = String(match.matchId || match.id);
    const existing = byMatchId.get(matchId);

    if (shouldSkipExisting(existing, matchId)) {
      summary.skipped += 1;
      continue;
    }

    let snapshot;
    try {
      snapshot = await scraper.getCricketSnapshot(matchId);
    } catch (err) {
      snapshot = { error: err.message };
    }

    const isoNow = now().toISOString();
    const matchName = match.matchName || match.name || null;

    if (!hasSuccessfulSnapshot(snapshot)) {
      const errorMsg = snapshot?.error || 'No cricket snapshot data';
      const [fallbackTeam1, fallbackTeam2] = parseTeamsFromMatchName(matchName);
      await store.upsertPendingCapture({
        matchId,
        marketId: match.marketId ?? null,
        matchName,
        competitionName: match.competitionName ?? null,
        team1: existing?.team1 ?? fallbackTeam1,
        team2: existing?.team2 ?? fallbackTeam2,
        startTime: match.startTime ?? null,
        endedAt: isoNow,
        capturedAt: isoNow,
        snapshot: null,
        predictedWinner: null,
        predictionTier: null,
        predictionConfidence: null,
        lastCaptureError: sanitizeError(errorMsg),
        confirmedAt: null,
        confirmedByEmail: null,
        confirmedById: null,
      });
      summary.failed += 1;
      continue;
    }

    snapshot.matchId = matchId;
    snapshot.competitionName = snapshot.competitionName || match.competitionName;
    const [team1, team2] = extractTeams(snapshot, match);
    const prediction = predictMatchWinner(snapshot);

    // Auto-resolve actual winner from CREX
    let actualWinner = null;
    if (crexOverview && Array.isArray(crexOverview) && crexOverview.length > 0) {
      const crexMatch = findCrexMatch(matchName, crexOverview);
      if (crexMatch) {
        let resultText = crexMatch.statusText;
        if (!resultText || !resultText.toLowerCase().includes('won by')) {
          try {
             const detail = await getCrexMatchDetail(crexMatch.id || crexMatch.crexMatchId, crexMatch.matchIndex);
             resultText = detail?.scorecard?.matchResult || resultText;
          } catch(e) {
             console.error('Failed to fetch crex match detail for actual winner', e.message);
          }
        }
        
        // Match standard names first
        actualWinner = extractWinnerFromText(resultText, team1, team2);
        
        // If not found, try mapping CREX shortnames to our teams
        if (!actualWinner && resultText) {
           const team1Short = crexMatch.team1Short;
           const team2Short = crexMatch.team2Short;
           const shortWinner = extractWinnerFromText(resultText, team1Short, team2Short);
           
           let crexWinnerName = null;
           if (shortWinner === team1Short) crexWinnerName = crexMatch.team1Name;
           else if (shortWinner === team2Short) crexWinnerName = crexMatch.team2Name;
           
           if (crexWinnerName) {
             actualWinner = extractWinnerFromText(crexWinnerName, team1, team2);
           }
        }
      }
    }

    const result = await store.upsertPendingCapture({
      matchId,
      marketId: snapshot.marketId ?? match.marketId ?? null,
      matchName,
      competitionName: match.competitionName ?? snapshot.competitionName ?? null,
      team1,
      team2,
      startTime: match.startTime ?? snapshot.startTime ?? null,
      endedAt: isoNow,
      capturedAt: isoNow,
      snapshot,
      predictedWinner: prediction?.winner ?? null,
      predictionTier: prediction?.tier ?? null,
      predictionConfidence: prediction?.confidence ?? null,
      actualWinner,
      lastCaptureError: null,
    });

    if (result.created || result.updated) {
      summary.captured += 1;
    } else {
      summary.skipped += 1;
    }
  }

  return summary;
}

module.exports = {
  captureEndedMatches,
  sanitizeError,
  hasSuccessfulSnapshot,
  shouldSkipExisting,
};
