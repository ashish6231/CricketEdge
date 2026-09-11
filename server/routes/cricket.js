const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const scraper = require('../services/scraper');
const { optionalAuth, requireProSubscription, assertProAccess } = require('../middleware/auth');
const { filterMatchesForViewer, guestMayViewMatch, guestMayViewFromInfos, isEndedMatch } = require('../lib/guestMatchAccess');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { getDefaultStore } = require('../services/tossDatasetStore');
const crexService = require('../services/crexService');

// In-memory cache for match_dataset.json — avoids disk read on every request
let _matchDatasetCache = null;
let _matchDatasetCacheTs = 0;
const MATCH_DATASET_CACHE_MS = 60 * 1000; // 60s

function getMatchDataset() {
  const now = Date.now();
  if (_matchDatasetCache && (now - _matchDatasetCacheTs) < MATCH_DATASET_CACHE_MS) return _matchDatasetCache;
  try {
    const mdPath = path.join(__dirname, '../data/match_dataset.json');
    if (fs.existsSync(mdPath)) {
      _matchDatasetCache = JSON.parse(fs.readFileSync(mdPath, 'utf8'));
      _matchDatasetCacheTs = now;
    }
  } catch {}
  return _matchDatasetCache;
}

// Persistent cache for completed/ended matches so their trades & amounts are served instantly (0ms)
const ENDED_MATCHES_CACHE_FILE = path.join(__dirname, '../data/ended_matches_cache.json');
const endedMatchesCache = new Map();

function loadEndedMatchesCache() {
  try {
    if (fs.existsSync(ENDED_MATCHES_CACHE_FILE)) {
      const raw = fs.readFileSync(ENDED_MATCHES_CACHE_FILE, 'utf8');
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) {
        endedMatchesCache.set(String(k), v);
      }
    }
  } catch (e) {
    console.warn('Could not load ended matches cache:', e.message);
  }
}
loadEndedMatchesCache();

function saveEndedMatchesCache() {
  try {
    const obj = Object.fromEntries(endedMatchesCache.entries());
    fs.mkdirSync(path.dirname(ENDED_MATCHES_CACHE_FILE), { recursive: true });
    fs.writeFileSync(ENDED_MATCHES_CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {}
}

function alignScorecardTeams(scorecard, matchName) {
  if (!scorecard || !scorecard.team1 || !scorecard.team2 || !matchName) return scorecard;
  const parts = matchName.split(/\s+v(?:s)?\.?\s+/i);
  const t1 = parts[0] || '';
  const t2 = parts[1] || '';
  if (!t1 || !t2) return scorecard;

  const team1MatchesT1 = crexService.teamTokensMatch(t1, scorecard.team1.name, scorecard.team1.shortName);
  const team1MatchesT2 = crexService.teamTokensMatch(t2, scorecard.team1.name, scorecard.team1.shortName);
  const team2MatchesT1 = crexService.teamTokensMatch(t1, scorecard.team2.name, scorecard.team2.shortName);
  const team2MatchesT2 = crexService.teamTokensMatch(t2, scorecard.team2.name, scorecard.team2.shortName);

  if (team1MatchesT2 && team2MatchesT1 && !team1MatchesT1) {
    return {
      ...scorecard,
      team1: scorecard.team2,
      team2: scorecard.team1,
    };
  }
  return scorecard;
}

async function getCrexForMatch(matchInfo, matchId = null) {
  try {
    const crexOverview = await crexService.getCrexOverview();
    let matched = null;

    if (matchId && String(matchId).startsWith('crex-')) {
      const rawId = String(matchId).replace(/^crex-/, '');
      matched = crexOverview.find(cm => cm.crexMatchId === rawId || cm.slug === rawId);
    }

    if (!matched && matchInfo?.matchName) {
      matched = crexService.findCrexMatch(matchInfo.matchName, crexOverview);
    }

    if (!matched) return null;
    if (matched.slug || matched.url) {
      const detail = await crexService.getCrexMatchDetail(matched.slug || matched.url);
      if (!detail) return matched;
      const scorecard = alignScorecardTeams(detail.scorecard, matchInfo?.matchName);
      return {
        ...matched,
        ...detail,
        scorecard: scorecard || detail.scorecard,
        isReversed: Boolean(matched.isReversed),
      };
    }
    return matched;
  } catch (e) {
    return null;
  }
}

function computeMatchLoad(snap, matchInfo) {
  if (!snap && !matchInfo) return null;
  const t1 = snap?.teamNames?.[0] || matchInfo?.team1 || matchInfo?.matchName?.split(' v ')?.[0] || 'Team 1';
  const t2 = snap?.teamNames?.[1] || matchInfo?.team2 || matchInfo?.matchName?.split(' v ')?.[1] || 'Team 2';

  const tr1 = snap?.teams?.[t1]?.trades || [];
  const tr2 = snap?.teams?.[t2]?.trades || [];

  // MatchDetail logic: trades.reduce((sum, t) => sum + (parseFloat(t.size) || 0), 0)
  const tradeVol1 = tr1.length > 0 ? tr1.reduce((sum, t) => sum + (parseFloat(t.size) || 0), 0) : 0;
  const tradeVol2 = tr2.length > 0 ? tr2.reduce((sum, t) => sum + (parseFloat(t.size) || 0), 0) : 0;

  const vol1 = tradeVol1 || snap?.teams?.[t1]?.totalBet || snap?.preMatchTotalBets?.team1 || snap?.preMatchVolume?.team1?.total || snap?.advancedMetrics?.team1?.totalVolume || matchInfo?.preMatchVolume?.team1?.total || 0;
  const vol2 = tradeVol2 || snap?.teams?.[t2]?.totalBet || snap?.preMatchTotalBets?.team2 || snap?.preMatchVolume?.team2?.total || snap?.advancedMetrics?.team2?.totalVolume || matchInfo?.preMatchVolume?.team2?.total || 0;
  let total = vol1 + vol2;

  let finalVol1 = vol1;
  let finalVol2 = vol2;
  if (finalVol1 === 0 && finalVol2 === 0 && (matchInfo?.totalMatched || 0) > 0) {
    finalVol1 = Math.round(matchInfo.totalMatched * 0.5);
    finalVol2 = Math.round(matchInfo.totalMatched * 0.5);
    total = matchInfo.totalMatched;
  }

  const pct1 = total > 0 ? Math.round((finalVol1 / total) * 100) : 50;
  const pct2 = total > 0 ? (100 - pct1) : 50;

  // MatchDetail logic: sortedTrades = [...trades].sort((a, b) => b.updatedAt - a.updatedAt); lastPrice = sortedTrades[0]?.price
  const sortedTrades1 = [...tr1].sort((a, b) => b.updatedAt - a.updatedAt);
  const sortedTrades2 = [...tr2].sort((a, b) => b.updatedAt - a.updatedAt);

  const lastPrice1 = parseFloat(sortedTrades1[0]?.price) || tr1[tr1.length - 1]?.price || snap?.runners?.[0]?.price || matchInfo?.runners?.[0]?.price || null;
  const lastPrice2 = parseFloat(sortedTrades2[0]?.price) || tr2[tr2.length - 1]?.price || snap?.runners?.[1]?.price || matchInfo?.runners?.[1]?.price || null;

  let trend1 = 'up';
  if (sortedTrades1.length >= 2) {
    const last = parseFloat(sortedTrades1[0].price) || 0;
    const prev = parseFloat(sortedTrades1.find(t => t.price !== sortedTrades1[0].price)?.price) || last;
    if (last < prev) trend1 = 'down';
  }
  let trend2 = 'up';
  if (sortedTrades2.length >= 2) {
    const last = parseFloat(sortedTrades2[0].price) || 0;
    const prev = parseFloat(sortedTrades2.find(t => t.price !== sortedTrades2[0].price)?.price) || last;
    if (last < prev) trend2 = 'down';
  }

  return {
    team1: {
      name: t1,
      money: Math.round(finalVol1),
      percent: pct1,
      odds: lastPrice1,
      trend: trend1,
    },
    team2: {
      name: t2,
      money: Math.round(finalVol2),
      percent: pct2,
      odds: lastPrice2,
      trend: trend2,
    },
    totalMatched: Math.round(total || matchInfo?.totalMatched || 0),
  };
}

// ──── Cricket ────

function upstreamUnavailable(res, data) {
  const detail = String(data?.error || 'Live match data is temporarily unavailable. Please try again shortly.')
    .replace(/tennisliveload\.com/gi, 'live feed');
  return res.status(503).json({
    detail,
    code: 'SERVICE_UNAVAILABLE',
  });
}

function asMatchList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.matches)) return data.matches;
  return [];
}

function findMatchInfo(matchesData, matchId) {
  const matches = asMatchList(matchesData);
  const id = String(matchId);
  return matches.find(m => String(m.matchId) === id || String(m.marketId) === id) || null;
}

function attachMatchMeta(data, matchInfo, isToss = false) {
  if (!matchInfo || !data || data.error) return data;
  data.inPlay = matchInfo.inPlay;
  data.competitionName = matchInfo.competitionName ?? data.competitionName;
  data.status = matchInfo.status ?? data.status;
  const start =
    matchInfo.startTime ??
    matchInfo.openDate ??
    matchInfo.marketStartTime ??
    matchInfo.eventDate ??
    null;
  if (start != null && start !== '') data.startTime = start;
  
  if (!isToss) {
    const prediction = predictMatchWinner(data);
    if (prediction) {
      data.aiPrediction = prediction;
    }
  }

  return data;
}

router.get('/cricket/matches', optionalAuth, async (req, res) => {
  const matchesMap = new Map();

  // Fetch live matches from scraper only — no dataset/crex fallback for list
  try {
    const liveData = await scraper.getAllCricketMatches();
    if (Array.isArray(liveData) && liveData.length > 0) {
      const isMatchEnded = (m) => {
        const s = (m.status || '').toLowerCase();
        return s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed';
      };

      const activeLive = liveData.filter(m => !isMatchEnded(m));
      const endedLive = liveData.filter(m => isMatchEnded(m));

      // Fetch snapshots in parallel for active matches to compute live matchLoad with real money and odds
      await Promise.all(activeLive.map(async (m) => {
        let snap = null;
        try {
          snap = await scraper.getCricketSnapshot(m.matchId);
          if (snap?.error) snap = null;
        } catch (e) {}

        const load = computeMatchLoad(snap, m);
        matchesMap.set(String(m.matchId), {
          matchId: String(m.matchId),
          marketId: m.marketId,
          matchName: m.matchName,
          competitionName: m.competitionName || 'Other',
          status: m.status || (m.inPlay ? 'in-play' : 'upcoming'),
          inPlay: Boolean(m.inPlay),
          startTime: m.startTime || m.openDate || null,
          totalMatched: load?.totalMatched || m.totalMatched || 0,
          runners: snap?.runners || m.runners || [],
          matchLoad: load,
        });
      }));

      // For ended matches: retrieve from persistent cache (0ms); if missing, fetch and cache
      const uncachedEnded = endedLive.filter(m => !endedMatchesCache.has(String(m.matchId)));
      if (uncachedEnded.length > 0) {
        let hasNew = false;
        await Promise.allSettled(uncachedEnded.map(async (m) => {
          try {
            const snap = await scraper.getCricketSnapshot(m.matchId);
            const load = computeMatchLoad(snap, m);
            endedMatchesCache.set(String(m.matchId), {
              matchLoad: load,
              runners: snap?.runners || m.runners || [],
              totalMatched: load?.totalMatched || m.totalMatched || 0,
            });
            hasNew = true;
          } catch (e) {}
        }));
        if (hasNew) saveEndedMatchesCache();
      }

      for (const m of endedLive) {
        const cached = endedMatchesCache.get(String(m.matchId));
        const load = cached?.matchLoad || computeMatchLoad(null, m);
        matchesMap.set(String(m.matchId), {
          matchId: String(m.matchId),
          marketId: m.marketId,
          matchName: m.matchName,
          competitionName: m.competitionName || 'Other',
          status: 'ended',
          inPlay: false,
          startTime: m.startTime || m.openDate || null,
          totalMatched: cached?.totalMatched || load?.totalMatched || m.totalMatched || 0,
          runners: cached?.runners || m.runners || [],
          matchLoad: load,
        });
      }

      // Any remaining matches
      for (const m of liveData) {
        if (!matchesMap.has(String(m.matchId))) {
          const load = computeMatchLoad(null, m);
          matchesMap.set(String(m.matchId), {
            matchId: String(m.matchId),
            marketId: m.marketId,
            matchName: m.matchName,
            competitionName: m.competitionName || 'Other',
            status: m.status || (m.inPlay ? 'in-play' : 'upcoming'),
            inPlay: Boolean(m.inPlay),
            startTime: m.startTime || m.openDate || null,
            totalMatched: m.totalMatched || 0,
            runners: m.runners || [],
            matchLoad: load,
          });
        }
      }
    }
  } catch (err) {
    // ignore upstream live failure
  }

  const allMatches = Array.from(matchesMap.values()).map((m) => {
    const isEnded =
      m.status === 'ended' ||
      m.status === 'verified' ||
      m.status === 'pending' ||
      m.status === 'completed' ||
      m.status === 'closed';
    if (isEnded) {
      m.status = 'ended';
      m.inPlay = false;
    }
    return m;
  });
  // Enrich matches with CREX live score, status, and odds
  try {
    const crexOverview = await crexService.getCrexOverview();
    if (Array.isArray(crexOverview) && crexOverview.length > 0) {
      const matchedCrexIds = new Set();
      for (const m of allMatches) {
        const cm = crexService.findCrexMatch(m.matchName, crexOverview);
        if (cm) {
          matchedCrexIds.add(cm.crexMatchId);
          m.crex = {
            matched: true,
            isReversed: Boolean(cm.isReversed),
            crexMatchId: cm.crexMatchId,
            slug: cm.slug,
            url: cm.url,
            team1Name: cm.team1Name,
            team1Short: cm.team1Short,
            team1Flag: cm.team1Flag,
            team2Name: cm.team2Name,
            team2Short: cm.team2Short,
            team2Flag: cm.team2Flag,
            score1: cm.score1,
            score2: cm.score2,
            status: cm.status,
            statusText: cm.statusText,
            venue: cm.venue,
            odds: cm.odds,
            runningBall: cm.runningBall || null,
          };
          // CREX only provides score data — do NOT override scraper's inPlay/status
        }
      }

      // Do NOT add crex-only matches — only enrich existing scraper matches with crex score data
    }
  } catch (err) {
    console.warn('Error enriching CREX in /cricket/matches:', err.message);
  }

  const filtered = filterMatchesForViewer(allMatches, req.user);

  // Extract unique competitions
  const compsSet = new Set();
  filtered.forEach(m => {
    if (m.competitionName) compsSet.add(m.competitionName);
  });

  res.set('Cache-Control', 'public, max-age=4, stale-while-revalidate=10');
  res.json({
    total: filtered.length,
    matches: filtered,
    competitions: Array.from(compsSet).sort()
  });
});

router.get('/cricket/match/:matchId', optionalAuth, async (req, res) => {
  const matchId = req.params.matchId;

  const matches = await scraper.getAllCricketMatches();
  let matchInfo = findMatchInfo(matches, matchId);
  if (!matchInfo) {
    try {
      const md = getMatchDataset();
      const rec = (md?.records || []).find(x => String(x.matchId) === String(matchId));
      if (rec) {
        matchInfo = {
          matchId: String(rec.matchId),
          marketId: rec.marketId,
          matchName: rec.matchName,
          competitionName: rec.competitionName,
          status: (rec.status === 'verified' || rec.status === 'pending') ? 'ended' : rec.status,
          startTime: rec.startTime,
          inPlay: false,
        };
      }
    } catch {}
  }
  if (!guestMayViewMatch(matchInfo, req.user)) {
    return res.status(401).json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId });
  }
  let data = null;
  try {
    data = await scraper.getCricketSnapshot(matchId);
  } catch (e) {
    data = null;
  }
  if (!data || data?.error) {
    // Fallback to match_dataset.json snapshot
    try {
      const md = getMatchDataset();
      const rec = (md?.records || []).find(x => String(x.matchId) === String(matchId));
      if (rec?.snapshot) {
        data = rec.snapshot;
      }
    } catch {}
  }
  const isEnded = matchInfo?.status === 'ended';
  if (!isEnded && !assertProAccess(req, res)) return;
  if (!data) return upstreamUnavailable(res, { error: 'No data returned from upstream' });
  if (data?.error) {
    return upstreamUnavailable(res, data);
  }
  const responseData = attachMatchMeta(data, matchInfo);
  try {
    const crex = await getCrexForMatch(matchInfo, matchId);
    if (crex) responseData.crex = crex;
  } catch {}
  res.json(responseData);
});

/** One request for MatchDetail poll — cricket + toss + session (single auth). */
router.get('/cricket/match/:matchId/bundle', optionalAuth, async (req, res) => {
  const matchId = req.params.matchId;

  // Fire ALL upstream calls immediately in parallel — including CREX overview
  const cricketMatchesPromise = scraper.getAllCricketMatches();
  const tossMatchesPromise = scraper.getAllTossMatches();
  const cricketRawPromise = scraper.getCricketSnapshot(matchId);
  const tossRawPromise = scraper.getTossSnapshot(matchId).catch(() => null);
  const sessionRawPromise = scraper.getSessionTrades(matchId).catch(() => null);
  const crexOverviewPromise = crexService.getCrexOverview().catch(() => []);

  const [cricketMatches, tossMatches, crexOverview] = await Promise.all([
    cricketMatchesPromise,
    tossMatchesPromise,
    crexOverviewPromise,
  ]);

  let matchInfo = findMatchInfo(cricketMatches, matchId);
  let tossInfo = findMatchInfo(tossMatches, matchId);

  if (!matchInfo) {
    try {
      const md = getMatchDataset();
      const rec = (md?.records || []).find(x => String(x.matchId) === String(matchId));
      if (rec) {
        matchInfo = {
          matchId: String(rec.matchId),
          marketId: rec.marketId,
          matchName: rec.matchName,
          competitionName: rec.competitionName,
          status: (rec.status === 'verified' || rec.status === 'pending') ? 'ended' : rec.status,
          startTime: rec.startTime,
          inPlay: false,
        };
      }
    } catch {}
  }

  // Now start CREX detail fetch using already-resolved overview (no extra round-trip)
  const crexRawPromise = (async () => {
    try {
      let matched = null;
      if (matchId && String(matchId).startsWith('crex-')) {
        const rawId = String(matchId).replace(/^crex-/, '');
        matched = crexOverview.find(cm => cm.crexMatchId === rawId || cm.slug === rawId);
      }
      if (!matched && matchInfo?.matchName) {
        matched = crexService.findCrexMatch(matchInfo.matchName, crexOverview);
      }
      if (!matched) return null;
      if (matched.slug || matched.url) {
        const detail = await crexService.getCrexMatchDetail(matched.slug || matched.url);
        if (!detail) return matched;
        const scorecard = alignScorecardTeams(detail.scorecard, matchInfo?.matchName);
        return {
          ...matched,
          ...detail,
          scorecard: scorecard || detail.scorecard,
          isReversed: Boolean(matched.isReversed),
        };
      }
      return matched;
    } catch { return null; }
  })();

  if (!guestMayViewMatch(matchInfo, req.user) && !guestMayViewFromInfos(req.user, [tossInfo, matchInfo])) {
    return res.status(401).json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId });
  }

  const isEnded = isEndedMatch(matchInfo) || isEndedMatch(tossInfo);
  if (!isEnded && !assertProAccess(req, res)) return;

  const [cricketRaw, tossRaw, sessionRaw, crexRaw] = await Promise.all([
    cricketRawPromise,
    tossRawPromise,
    sessionRawPromise,
    crexRawPromise,
  ]);

  let cricket = (!cricketRaw || cricketRaw.error)
    ? null
    : attachMatchMeta(cricketRaw, matchInfo);

  if (!cricket) {
    try {
      const md = getMatchDataset();
      const rec = (md?.records || []).find(x => String(x.matchId) === String(matchId));
      if (rec && rec.snapshot) {
        cricket = attachMatchMeta(JSON.parse(JSON.stringify(rec.snapshot)), matchInfo);
      }
    } catch {}
  }
  if (!cricket && cricketRaw?.error) {
    cricket = { error: cricketRaw.error };
  }
  if (cricket && !cricket.error) {
    try {
      const md = getMatchDataset();
      const rec = (md?.records || []).find(x => String(x.matchId) === String(matchId));
      if (rec?.actualWinner && !cricket.actualWinner) {
        cricket.actualWinner = rec.actualWinner;
      }
    } catch {}
  }

  let toss = (!tossRaw || tossRaw.error)
    ? null
    : attachMatchMeta(tossRaw, tossInfo || matchInfo, true);

  if (!toss) {
    try {
      const store = getDefaultStore();
      const ds = await store.load();
      const rec = (ds.records || []).find(x => String(x.matchId) === String(matchId));
      if (rec && rec.snapshot) {
        const tossData = JSON.parse(JSON.stringify(rec.snapshot));
        if (!tossData.competitionName) tossData.competitionName = rec.competitionName;
        if (!tossData.startTime) tossData.startTime = rec.startTime;
        toss = attachMatchMeta(tossData, tossInfo || matchInfo, true);
        if (rec.actualWinner) toss.actualWinner = rec.actualWinner;
        if (rec.predictedWinner) toss.predictedWinner = rec.predictedWinner;
      }
    } catch {}
  }
  if (toss && !toss.error) {
    try {
      const store = getDefaultStore();
      const ds = await store.load();
      const rec = (ds.records || []).find(x => String(x.matchId) === String(matchId));
      if (rec) {
        if (rec.actualWinner && !toss.actualWinner) toss.actualWinner = rec.actualWinner;
        if (rec.predictedWinner && !toss.predictedWinner) toss.predictedWinner = rec.predictedWinner;
      }
    } catch {}
  }
  if (!toss && tossRaw?.error) {
    toss = { error: tossRaw.error };
  }

  const session = !sessionRaw || sessionRaw.error ? null : sessionRaw;

  res.set('Cache-Control', 'private, max-age=3, stale-while-revalidate=8');
  res.json({ matchId, cricket, toss, session, crex: crexRaw });
});

router.get('/cricket/match/:matchId/crex', optionalAuth, async (req, res) => {
  const matchId = req.params.matchId;
  const matches = await scraper.getAllCricketMatches();
  let matchInfo = findMatchInfo(matches, matchId);
  if (!matchInfo) {
    try {
      const md = getMatchDataset();
      const rec = (md?.records || []).find(x => String(x.matchId) === String(matchId));
      if (rec) {
        matchInfo = { matchId: String(rec.matchId), matchName: rec.matchName };
      }
    } catch {}
  }
  const crex = await getCrexForMatch(matchInfo, matchId);
  res.json({ matchId, crex: crex || null });
});

function extractTossOdds(trades, fallback = null) {
  if (!Array.isArray(trades) || trades.length === 0) return fallback;
  // Coin toss odds are strictly 50-50 market odds (around 1.70 to 2.30).
  // Any trade outside this range (like 1.01, 1.10, 1.50, 100) is a match winner trade.
  const tossTrades = trades.filter(t => {
    const p = parseFloat(t.price);
    return !isNaN(p) && p >= 1.70 && p <= 2.30;
  });
  if (tossTrades.length > 0) {
    const sorted = [...tossTrades].sort((a, b) => b.updatedAt - a.updatedAt);
    return parseFloat(sorted[0].price);
  }
  const broader = trades.filter(t => {
    const p = parseFloat(t.price);
    return !isNaN(p) && p >= 1.60 && p <= 2.40;
  });
  if (broader.length > 0) {
    const sorted = [...broader].sort((a, b) => b.updatedAt - a.updatedAt);
    return parseFloat(sorted[0].price);
  }
  return fallback;
}

function computeTossLoad(snap, matchInfo) {
  if (!snap && !matchInfo) return null;
  const t1 = snap?.teamNames?.[0] || matchInfo?.team1 || matchInfo?.matchName?.split(' v ')?.[0] || 'Team 1';
  const t2 = snap?.teamNames?.[1] || matchInfo?.team2 || matchInfo?.matchName?.split(' v ')?.[1] || 'Team 2';

  const tr1 = snap?.teams?.[t1]?.trades || snap?.teams?.[snap?.teamNames?.[0]]?.trades || [];
  const tr2 = snap?.teams?.[t2]?.trades || snap?.teams?.[snap?.teamNames?.[1]]?.trades || [];

  // MatchDetail graph logic: trades.reduce((sum, t) => sum + (parseFloat(t.size) || 0), 0)
  const tradeVol1 = tr1.length > 0 ? tr1.reduce((sum, t) => sum + (parseFloat(t.size) || 0), 0) : 0;
  const tradeVol2 = tr2.length > 0 ? tr2.reduce((sum, t) => sum + (parseFloat(t.size) || 0), 0) : 0;

  const vol1 = tradeVol1 || snap?.teams?.[t1]?.totalBet || snap?.teams?.[snap?.teamNames?.[0]]?.totalBet || snap?.preMatchTotalBets?.team1 || snap?.preMatchVolume?.team1?.total || snap?.advancedMetrics?.team1?.totalVolume || matchInfo?.preMatchVolume?.team1?.total || 0;
  const vol2 = tradeVol2 || snap?.teams?.[t2]?.totalBet || snap?.teams?.[snap?.teamNames?.[1]]?.totalBet || snap?.preMatchTotalBets?.team2 || snap?.preMatchVolume?.team2?.total || snap?.advancedMetrics?.team2?.totalVolume || matchInfo?.preMatchVolume?.team2?.total || 0;
  const total = vol1 + vol2;

  const pct1 = total > 0 ? Math.round((vol1 / total) * 100) : 50;
  const pct2 = total > 0 ? (100 - pct1) : 50;

  // Filter strictly for true coin-toss trades (1.70 to 2.30)
  const tossTrades1 = tr1.filter(t => { const p = parseFloat(t.price); return !isNaN(p) && p >= 1.70 && p <= 2.30; });
  const tossTrades2 = tr2.filter(t => { const p = parseFloat(t.price); return !isNaN(p) && p >= 1.70 && p <= 2.30; });

  const sortedTrades1 = [...tossTrades1].sort((a, b) => b.updatedAt - a.updatedAt);
  const sortedTrades2 = [...tossTrades2].sort((a, b) => b.updatedAt - a.updatedAt);

  const fallbackOdds1 = snap?.syntheticSupport?.teamA?.averageOdds ? parseFloat(snap.syntheticSupport.teamA.averageOdds.toFixed(2)) : (snap?.runners?.[0]?.price && snap.runners[0].price >= 1.60 && snap.runners[0].price <= 2.40 ? snap.runners[0].price : null);
  const fallbackOdds2 = snap?.syntheticSupport?.teamB?.averageOdds ? parseFloat(snap.syntheticSupport.teamB.averageOdds.toFixed(2)) : (snap?.runners?.[1]?.price && snap.runners[1].price >= 1.60 && snap.runners[1].price <= 2.40 ? snap.runners[1].price : null);

  const lastPrice1 = extractTossOdds(tr1, fallbackOdds1);
  const lastPrice2 = extractTossOdds(tr2, fallbackOdds2);

  let trend1 = 'up';
  if (sortedTrades1.length >= 2) {
    const last = parseFloat(sortedTrades1[0].price) || 0;
    const prev = parseFloat(sortedTrades1.find(t => t.price !== sortedTrades1[0].price)?.price) || last;
    if (last < prev) trend1 = 'down';
  }
  let trend2 = 'up';
  if (sortedTrades2.length >= 2) {
    const last = parseFloat(sortedTrades2[0].price) || 0;
    const prev = parseFloat(sortedTrades2.find(t => t.price !== sortedTrades2[0].price)?.price) || last;
    if (last < prev) trend2 = 'down';
  }

  return {
    team1: {
      name: t1,
      money: vol1,
      percent: pct1,
      odds: lastPrice1,
      trend: trend1,
    },
    team2: {
      name: t2,
      money: vol2,
      percent: pct2,
      odds: lastPrice2,
      trend: trend2,
    },
    totalMatched: total,
  };
}

router.get('/toss/matches', optionalAuth, async (req, res) => {
  const matchesMap = new Map();

  let datasetRecords = [];
  try {
    const store = getDefaultStore();
    const dataset = await store.load();
    datasetRecords = Array.isArray(dataset?.records) ? dataset.records : [];
  } catch (err) {
    console.error('Error reading toss dataset in /toss/matches:', err);
  }

  const datasetMap = new Map();
  datasetRecords.forEach(r => {
    if (r.matchId) datasetMap.set(String(r.matchId), r);
  });

  // 1. Try fetching live toss matches from scraper
  try {
    const liveData = await scraper.getAllTossMatches();
    if (Array.isArray(liveData)) {
      await Promise.all(liveData.map(async (m) => {
        const id = String(m.matchId);
        let snap = null;
        try {
          snap = await scraper.getTossSnapshot(m.matchId);
          if (snap?.error) snap = null;
        } catch (e) {
          // ignore
        }

        const dsRec = datasetMap.get(id);
        if (!snap && dsRec?.snapshot) {
          snap = dsRec.snapshot;
        }

        const load = computeTossLoad(snap, m);
        const isEnded = m.status === 'ended' || m.status === 'verified' || m.status === 'closed' || dsRec?.status === 'ended' || dsRec?.status === 'verified';
        const matchStatus = isEnded ? 'ended' : (m.status || (m.inPlay ? 'in-play' : 'upcoming'));

        matchesMap.set(id, {
          matchId: id,
          marketId: m.marketId,
          matchName: m.matchName,
          competitionName: m.competitionName || snap?.competitionName || dsRec?.competitionName || 'Other',
          status: matchStatus,
          inPlay: !isEnded && Boolean(m.inPlay || m.status === 'in-play'),
          startTime: m.startTime || m.openDate || snap?.startTime || dsRec?.startTime || null,
          totalMatched: load?.totalMatched || m.totalMatched || 0,
          runners: m.runners || [],
          tossLoad: load,
          predictedWinner: dsRec?.predictedWinner,
          actualWinner: dsRec?.actualWinner,
        });
      }));
    }
  } catch (err) {
    // ignore upstream live failure
  }

  const allMatches = Array.from(matchesMap.values());
  const filtered = filterMatchesForViewer(allMatches, req.user);

  // Extract unique competitions that have live or upcoming toss data
  const compsSet = new Set();
  filtered.forEach(m => {
    if (m.competitionName) compsSet.add(m.competitionName);
  });

  res.set('Cache-Control', 'public, max-age=4, stale-while-revalidate=10');
  res.json({
    total: filtered.length,
    matches: filtered,
    competitions: Array.from(compsSet).sort()
  });
});

router.get('/toss/match/:matchId', optionalAuth, async (req, res) => {
  const matchId = String(req.params.matchId);
  const [tossMatches, cricketMatches] = await Promise.all([
    scraper.getAllTossMatches().catch(() => []),
    scraper.getAllCricketMatches().catch(() => []),
  ]);
  const tossInfo = findMatchInfo(tossMatches, matchId);
  const cricketInfo = findMatchInfo(cricketMatches, matchId);

  // 1. Try scraper snapshot
  let data = null;
  try {
    data = await scraper.getTossSnapshot(matchId);
  } catch (e) {
    data = null;
  }

  // 2. If scraper failed or returned error, check toss dataset
  if (!data || data.error) {
    try {
      const store = getDefaultStore();
      const ds = await store.load();
      const rec = (ds.records || []).find(r => String(r.matchId) === matchId);
      if (rec && rec.snapshot) {
        data = JSON.parse(JSON.stringify(rec.snapshot));
        if (!data.competitionName) data.competitionName = rec.competitionName;
        if (!data.startTime) data.startTime = rec.startTime;
        if (rec.actualWinner && !data.actualWinner) data.actualWinner = rec.actualWinner;
        if (rec.predictedWinner && !data.predictedWinner) data.predictedWinner = rec.predictedWinner;
      }
    } catch (e) {
      // ignore
    }
  }

  if (!data || data.error) return res.status(502).json({ error: data?.error || 'No toss data available for this match' });
  res.json(attachMatchMeta(data, tossInfo || cricketInfo, true));
});

router.get('/session/matches', optionalAuth, async (req, res) => {
  const data = await scraper.getAllSessionMatches();
  if (data?.error) return res.status(502).json({ error: data.error });
  const matches = Array.isArray(data) ? data : [];
  const filtered = filterMatchesForViewer(matches, req.user);
  res.set('Cache-Control', 'public, max-age=4, stale-while-revalidate=10');
  res.json({ total: filtered.length, matches: filtered });
});

router.get('/session/trades/:matchId', optionalAuth, async (req, res) => {
  const matchId = req.params.matchId;
  const [sessionMatches, cricketMatches] = await Promise.all([
    scraper.getAllSessionMatches(),
    scraper.getAllCricketMatches(),
  ]);
  const sessionInfo = findMatchInfo(sessionMatches, matchId);
  const cricketInfo = findMatchInfo(cricketMatches, matchId);
  
  if (!guestMayViewFromInfos(req.user, [sessionInfo, cricketInfo])) {
    return res.status(401).json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId });
  }
  const isEnded = isEndedMatch(sessionInfo) || isEndedMatch(cricketInfo);
  if (!isEnded && !assertProAccess(req, res)) return;
  const data = await scraper.getSessionTrades(matchId);
  if (!data || data.error) return res.status(502).json({ error: data?.error || 'No session data' });
  res.json(data);
});

router.get('/cricket/odds/:matchId', requireProSubscription, async (req, res) => {
  const data = await scraper.getCricketSnapshot(req.params.matchId);
  if (data?.error) return res.json({ error: data.error });
  const teams = data.teams || {};
  const result = {};
  for (const [teamName, teamData] of Object.entries(teams)) {
    const trades = teamData.trades || [];
    if (!trades.length) { result[teamName] = { back: null, lay: null }; continue; }
    const sorted = [...trades].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    result[teamName] = {
      back: sorted.find(t => t.type === 'back')?.price ?? null,
      lay:  sorted.find(t => t.type === 'lay')?.price  ?? null,
    };
  }
  res.json({ matchId: req.params.matchId, teamNames: data.teamNames || [], odds: result });
});
const _oddsCache = new Map();
const ODDS_FRESH_TTL = 2500;
const ODDS_SWR_TTL = 30 * 60 * 1000; // 30 minutes SWR

function _extractOddsFromSnapshot(data) {
  if (!data || data.error) return null;
  const teams = data.teams || {};
  const odds = {};
  for (const [teamName, teamData] of Object.entries(teams)) {
    const trades = teamData.trades || [];
    if (!trades.length) {
      odds[teamName] = { back: null, lay: null };
      continue;
    }
    let latestBack = null;
    let latestBackTs = -1;
    let latestLay = null;
    let latestLayTs = -1;
    for (let i = trades.length - 1; i >= 0; i--) {
      const t = trades[i];
      const ts = t.updatedAt || 0;
      if (t.type === 'back' && ts > latestBackTs) {
        latestBack = t.price;
        latestBackTs = ts;
      } else if (t.type === 'lay' && ts > latestLayTs) {
        latestLay = t.price;
        latestLayTs = ts;
      }
    }
    odds[teamName] = { back: latestBack, lay: latestLay };
  }
  return { teamNames: data.teamNames || [], odds };
}

async function _getOrFetchOdds(id) {
  const now = Date.now();
  const cached = _oddsCache.get(id);
  if (cached && (now - cached.ts) < ODDS_FRESH_TTL) {
    return cached.data;
  }
  if (cached && (now - cached.ts) < ODDS_SWR_TTL) {
    // SWR: return immediately and refresh in background
    if (!cached.refreshing) {
      cached.refreshing = true;
      scraper.getCricketSnapshot(id).then(data => {
        const parsed = _extractOddsFromSnapshot(data);
        if (parsed) _oddsCache.set(id, { data: parsed, ts: Date.now(), refreshing: false });
        else _oddsCache.set(id, { ...cached, ts: Date.now(), refreshing: false });
      }).catch(() => {
        const c = _oddsCache.get(id);
        if (c) c.refreshing = false;
      });
    }
    return cached.data;
  }

  const data = await scraper.getCricketSnapshot(id);
  const parsed = _extractOddsFromSnapshot(data);
  if (parsed) {
    _oddsCache.set(id, { data: parsed, ts: Date.now(), refreshing: false });
  }
  return parsed;
}

router.get('/cricket/odds-bulk', requireProSubscription, async (req, res) => {
  const matchIds = req.query.ids ? req.query.ids.split(',').filter(Boolean) : [];
  if (!matchIds.length) return res.status(400).json({ error: 'No match IDs provided' });
  
  const results = {};
  await Promise.all(matchIds.map(async (id) => {
    const odds = await _getOrFetchOdds(id);
    if (odds) results[id] = odds;
  }));
  
  res.json(results);
});

router.get('/cricket/full', requireProSubscription, async (req, res) => {
  const includeSnapshots = req.query.include_snapshots !== 'false';
  res.json(await scraper.getCricketFullData(includeSnapshots));
});

// ──── Tennis ────

router.get('/tennis/matches', optionalAuth, async (req, res) => {
  const data = await scraper.getAllTennisMatches();
  if (data?.error) return res.status(502).json({ detail: data.error });
  const matches = asMatchList(data);
  const filtered = filterMatchesForViewer(matches, req.user);
  res.json({ total: filtered.length, matches: filtered });
});

router.get('/tennis/match/:matchId', optionalAuth, async (req, res) => {
  const matchId = req.params.matchId;
  const matches = await scraper.getAllTennisMatches();
  const matchInfo = findMatchInfo(matches, matchId);
  if (!guestMayViewMatch(matchInfo, req.user)) {
    return res.status(401).json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId });
  }
  const data = await scraper.getTennisSnapshot(matchId);
  const isEnded = matchInfo?.status === 'ended';
  if (!isEnded && !assertProAccess(req, res)) return;
  if (!data) return upstreamUnavailable(res, { error: 'No data returned from upstream' });
  if (data?.error) return upstreamUnavailable(res, data);

  res.json(attachMatchMeta(data, matchInfo));
});

// ──── Live Odds ────

router.get('/live-odds/:matchId', requireProSubscription, async (req, res) => {
  res.json(await scraper.getLiveOdds(req.params.matchId));
});

module.exports = router;
