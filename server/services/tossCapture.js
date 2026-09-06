const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { getDefaultStore } = require('./tossDatasetStore');
const scraperModule = require('./scraper');
const { getCrexOverview, findCrexMatch, getCrexMatchDetail } = require('./crexService');

let cachedPredictorVersion = 'toss-v8-layvol-ratio-gate';
let cachedPredictorModule = null;

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
  return parseTeamsFromMatchName(match.matchName);
}

function extractWinnerFromText(text, team1, team2) {
  if (!text) return null;
  const lowerText = text.toLowerCase();
  if (team1 && lowerText.includes(team1.toLowerCase())) return team1;
  if (team2 && lowerText.includes(team2.toLowerCase())) return team2;
  return null;
}

function predictorCandidates() {
  return [
    // Bundled with server (Docker / production: WORKDIR=/app)
    path.join(__dirname, '../utils/tossPredictor.js'),
    // Local monorepo checkout (server + frontend siblings)
    path.join(__dirname, '../../frontend/src/utils/tossPredictor.js'),
  ];
}

async function loadPredictorModule() {
  if (cachedPredictorModule) return cachedPredictorModule;

  const errors = [];
  for (const file of predictorCandidates()) {
    if (!fs.existsSync(file)) {
      errors.push(`missing: ${file}`);
      continue;
    }
    try {
      const mod = await import(pathToFileURL(file).href);
      if (mod.PREDICTOR_VERSION) cachedPredictorVersion = mod.PREDICTOR_VERSION;
      cachedPredictorModule = mod;
      return mod;
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
    }
  }
  throw new Error(`tossPredictor not found (${errors.join('; ')})`);
}

async function defaultPredictTossWinner(snapshot) {
  const mod = await loadPredictorModule();
  return mod.predictTossWinner(snapshot);
}

function shouldSkipExisting(existing) {
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

async function captureEndedTosses({
  scraper = scraperModule,
  store = getDefaultStore(),
  predictTossWinner,
  now = () => new Date(),
} = {}) {
  const predict = predictTossWinner || defaultPredictTossWinner;
  const summary = { scanned: 0, captured: 0, skipped: 0, failed: 0 };

  let matches;
  try {
    matches = await scraper.getAllTossMatches();
  } catch {
    return { scanned: 0, captured: 0, skipped: 0, failed: 1 };
  }

  if (!Array.isArray(matches) || matches.error) {
    return { scanned: 0, captured: 0, skipped: 0, failed: 1 };
  }

  const eligible = matches.filter(
    (match) => match.status === 'ended' && (match.totalMatched || 0) > 0,
  );
  summary.scanned = eligible.length;

  const data = await store.load();
  const byMatchId = new Map(data.records.map((record) => [String(record.matchId), record]));

  let crexOverview = [];
  try {
    crexOverview = await getCrexOverview();
  } catch (err) {
    console.error('Failed to fetch CREX overview during toss capture:', err.message);
  }

  for (const match of eligible) {
    const existing = byMatchId.get(String(match.matchId));

    if (shouldSkipExisting(existing)) {
      summary.skipped += 1;
      continue;
    }

    let snapshot;
    try {
      snapshot = await scraper.getTossSnapshot(match.matchId);
    } catch (err) {
      snapshot = { error: err.message };
    }

    const isoNow = now().toISOString();
    const matchName = match.matchName ?? null;

    if (!hasSuccessfulSnapshot(snapshot)) {
      const errorMsg = snapshot?.error || 'No toss snapshot data';
      const [fallbackTeam1, fallbackTeam2] = parseTeamsFromMatchName(matchName);
      await store.upsertPendingCapture({
        matchId: String(match.matchId),
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
        predictionReason: null,
        predictionRisk: {},
        matchedRules: [],
        predictorVersion: cachedPredictorVersion,
        lastCaptureError: sanitizeError(errorMsg),
        confirmedAt: null,
        confirmedByEmail: null,
        confirmedById: null,
      });
      summary.failed += 1;
      continue;
    }

    const [team1, team2] = extractTeams(snapshot, match);
    const prediction = await predict(snapshot);

    let actualWinner = null;
    if (crexOverview && Array.isArray(crexOverview) && crexOverview.length > 0) {
      const crexMatch = findCrexMatch(matchName, crexOverview);
      if (crexMatch) {
        try {
          const detail = await getCrexMatchDetail(crexMatch.id || crexMatch.crexMatchId, crexMatch.matchIndex);
          const tossText = detail?.scorecard?.statusEquation;
          
          if (tossText && tossText.toLowerCase().includes('won the toss')) {
            actualWinner = extractWinnerFromText(tossText, team1, team2);
            if (!actualWinner) {
               const shortWinner = extractWinnerFromText(tossText, crexMatch.team1Short, crexMatch.team2Short);
               let crexWinnerName = null;
               if (shortWinner === crexMatch.team1Short) crexWinnerName = crexMatch.team1Name;
               else if (shortWinner === crexMatch.team2Short) crexWinnerName = crexMatch.team2Name;
               
               if (crexWinnerName) {
                 actualWinner = extractWinnerFromText(crexWinnerName, team1, team2);
               }
            }
          }
        } catch (e) {
          console.error('Failed to fetch crex match detail for toss actual winner', e.message);
        }
      }
    }

    const result = await store.upsertPendingCapture({
      matchId: String(match.matchId),
      marketId: snapshot.marketId ?? match.marketId ?? null,
      matchName,
      competitionName: match.competitionName ?? null,
      team1,
      team2,
      startTime: match.startTime ?? null,
      endedAt: isoNow,
      capturedAt: isoNow,
      snapshot,
      predictedWinner: prediction?.winnerName ?? null,
      predictionReason: prediction?.reason ?? null,
      predictionRisk: prediction?.risk ?? {},
      matchedRules: prediction?.matchedRules ?? [],
      predictorVersion: prediction?.predictorVersion || cachedPredictorVersion,
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
  get PREDICTOR_VERSION() {
    return cachedPredictorVersion;
  },
  captureEndedTosses,
  loadPredictorModule,
  sanitizeError,
  hasSuccessfulSnapshot,
  shouldSkipExisting,
};
