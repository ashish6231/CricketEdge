const { checkPreMatchDataQuality } = require('../utils/preMatchDataQuality.mjs');
const { checkMatchRecordQuality } = require('./matchRecordQuality');
const { getDefaultStore } = require('./matchDatasetStore');
const dataCache = require('./dataCache');
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
  const parts = matchName.split(/\s+v(?:s)?\.?\s+/i);
  if (parts.length >= 2) return [parts[0].trim(), parts[1].trim()];
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
  const independentlyResolved = existing.resultVerification?.verification === 'verified'
    || existing.resultVerification?.status === 'verified'
    || (existing.confirmedByEmail && existing.confirmedByEmail !== 'crex-auto');
  if (['verified', 'abandoned'].includes(existing.status) && checkMatchRecordQuality(existing).valid
    && independentlyResolved) return true;

  if (
    existing.status === 'pending'
    && checkMatchRecordQuality(existing).valid
    && !existing.lastCaptureError
  ) {
    return true;
  }
  return false;
}

async function captureEndedMatches({
  scraper = dataCache,
  store = getDefaultStore(),
  predictMatchWinner = defaultPredictMatchWinner,
  now = () => new Date(),
  fetchCrexOverview = getCrexOverview,
  findCrexFixture = findCrexMatch,
  fetchCrexDetail = getCrexMatchDetail,
} = {}) {
  const summary = { scanned: 0, captured: 0, skipped: 0, failed: 0 };

  let res;
  try {
    res = scraper.getCricketMatches ? scraper.getCricketMatches() : await scraper.getAllCricketMatches();
  } catch {
    return { scanned: 0, captured: 0, skipped: 0, failed: 1 };
  }

  const matches = res?.matches || res;
  if (!Array.isArray(matches) || res?.error) {
    return { scanned: 0, captured: 0, skipped: 0, failed: 1 };
  }

  const completedStatuses = new Set(['ended', 'completed', 'closed', 'verified']);
  const eligible = matches.filter(
    (match) => completedStatuses.has(String(match.status || '').toLowerCase())
      && (match.totalMatched || 0) > 0,
  );
  summary.scanned = eligible.length;

  const data = await store.load();
  const byMatchId = new Map(data.records.map((record) => [String(record.matchId), record]));

  // Fetch CREX overview to try and auto-resolve actual winners
  let crexOverview = [];
  try {
    crexOverview = await fetchCrexOverview();
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
      summary.failed += 1;
      continue;
    }

    snapshot.matchId = matchId;
    snapshot.competitionName = snapshot.competitionName || match.competitionName;
    const [team1, team2] = extractTeams(snapshot, match);
    snapshot = { ...snapshot, teamNames: [team1, team2] };
    if (!checkPreMatchDataQuality(snapshot).valid) {
      summary.skipped += 1;
      continue;
    }
    const prediction = predictMatchWinner(snapshot);

    // Auto-resolve actual winner from CREX
    let actualWinner = null;
    let resultText = null;
    let resultVerification = null;
    if (crexOverview && Array.isArray(crexOverview) && crexOverview.length > 0) {
      const crexMatch = findCrexFixture(matchName, crexOverview, {
        startTime: match.startTime || match.openDate || match.marketStartTime,
        status: match.status,
        inPlay: match.inPlay,
      });
      if (crexMatch) {
        resultText = crexMatch.statusText;
        if (!resultText || !resultText.toLowerCase().includes('won by')) {
          try {
             const detail = await fetchCrexDetail(crexMatch.slug || crexMatch.url);
             resultText = detail?.scorecard?.matchResult || resultText;
          } catch(e) {
             console.error('Failed to fetch crex match detail for actual winner', e.message);
          }
        }
        
        // Only the team before "won" is a result, not a participant mentioned
        // elsewhere in a fixture, live-status or abandoned-match description.
        const winnerText = typeof resultText === 'string' ? resultText.match(/^(.*?)\bwon\b/i)?.[1] : null;
        actualWinner = extractWinnerFromText(winnerText, team1, team2);
        
        // If not found, try mapping CREX shortnames to our teams
        if (!actualWinner && winnerText) {
           const team1Short = crexMatch.team1Short;
           const team2Short = crexMatch.team2Short;
           const shortWinner = extractWinnerFromText(winnerText, team1Short, team2Short);
           
           let crexWinnerName = null;
           if (shortWinner === team1Short) crexWinnerName = crexMatch.team1Name;
           else if (shortWinner === team2Short) crexWinnerName = crexMatch.team2Name;
           
           if (crexWinnerName) {
             actualWinner = extractWinnerFromText(crexWinnerName, team1, team2);
           }
        }
        if (actualWinner) {
          const sourceUrl = crexMatch.url
            ? new URL(crexMatch.url, 'https://crex.com').href : null;
          resultVerification = {
            verification: 'verified', status: 'verified', outcome: 'winner',
            publishedWinner: actualWinner, resultText, source: 'CREX', sourceUrl,
            sourceMatchId: crexMatch.crexMatchId || null,
            sourceStartTime: match.startTime || crexMatch.startTime || null,
            checkedAt: isoNow,
            matchingRule: 'Both participants and kickoff context matched against the public CREX result.',
          };
        }
      }
    }

    const record = {
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
      predictionReason: prediction?.reason ?? null,
      predictorVersion: prediction?.predictorVersion ?? null,
      algorithmId: prediction?.algorithmId ?? null,
      algorithmLeague: prediction?.algorithmLeague ?? null,
      profileVersion: prediction?.profileVersion ?? null,
      algorithmStrategy: prediction?.algorithmStrategy ?? null,
      ruleFamily: prediction?.ruleFamily ?? null,
      inputTiming: 'provider-frozen-fields-captured-after-start',
      actualWinner,
      reportedWinner: actualWinner,
      resultText,
      resultVerification,
      lastCaptureError: null,
    };
    if (!checkMatchRecordQuality(record).valid) {
      summary.skipped += 1;
      continue;
    }
    const result = await store.upsertPendingCapture(record);

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
