const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const scraper = require('../services/scraper');
const dataCache = require('../services/dataCache');
const { optionalAuth, requireProSubscription, assertProAccess, assertTelegramMembership } = require('../middleware/auth');
const { filterMatchesForViewer, guestMayViewMatch, guestMayViewFromInfos, isEndedMatch } = require('../lib/guestMatchAccess');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { getDefaultStore } = require('../services/tossDatasetStore');
const crexService = require('../services/crexService');
const matchPayloadService = require('../services/matchPayloadService');

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
      matched = crexService.findCrexMatch(matchInfo.matchName, crexOverview, {
        startTime: matchInfo.startTime || matchInfo.openDate || matchInfo.marketStartTime,
        status: matchInfo.status,
        inPlay: matchInfo.inPlay,
      });
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
        tossText: detail.tossText || detail.scorecard?.tossText || null,
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

router.get('/cricket/matches', optionalAuth, assertTelegramMembership, async (req, res) => {
  const payload = await matchPayloadService.getCricketMatchesPayload(req.user);
  res.set('Cache-Control', 'public, max-age=3, stale-while-revalidate=8');
  res.json(payload);
});

router.get('/cricket/match/:matchId', optionalAuth, assertTelegramMembership, async (req, res) => {
  const matchId = req.params.matchId;

  const matches = await dataCache.getCricketMatches();
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
    data = await dataCache.getCricketSnapshot(matchId);
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
router.get('/cricket/match/:matchId/bundle', optionalAuth, assertTelegramMembership, async (req, res) => {
  const matchId = req.params.matchId;
  const payload = await matchPayloadService.getMatchBundlePayload(matchId, req.user);
  if (!payload) {
    return res.status(404).json({ error: 'Match not found', matchId });
  }
  if (payload.error === 'login_required') {
    return res.status(401).json(payload);
  }
  if (payload.error === 'subscription_required') {
    return res.status(403).json(payload);
  }
  res.set('Cache-Control', 'private, max-age=3, stale-while-revalidate=8');
  res.json(payload);
});

router.get('/cricket/match/:matchId/crex', optionalAuth, async (req, res) => {
  const matchId = req.params.matchId;
  const cachedCrex = dataCache.getCrexDetail(matchId);
  if (cachedCrex) {
    return res.json({ matchId, crex: cachedCrex });
  }
  const matches = dataCache.getCricketMatches();
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

router.get('/toss/matches', optionalAuth, assertTelegramMembership, async (req, res) => {
  const payload = await matchPayloadService.getTossMatchesPayload();
  const filtered = filterMatchesForViewer(payload.matches, req.user);
  res.set('Cache-Control', 'public, max-age=4, stale-while-revalidate=10');
  res.json({
    total: filtered.length,
    matches: filtered,
    competitions: payload.competitions,
    updatedAt: payload.updatedAt,
  });
});

router.get('/toss/match/:matchId', optionalAuth, assertTelegramMembership, async (req, res) => {
  const matchId = String(req.params.matchId);
  const tossMatches = dataCache.getTossMatches();
  const cricketMatches = dataCache.getCricketMatches();
  const tossInfo = findMatchInfo(tossMatches, matchId);
  const cricketInfo = findMatchInfo(cricketMatches, matchId);

  // 1. Try scraper snapshot
  let data = null;
  try {
    data = await dataCache.getTossSnapshot(matchId);
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

  if (!data || data.error) {
    const status = (data?.upstreamStatus === 404 || data?.notFound || !data) ? 404 : 502;
    return res.status(status).json({ error: data?.error || 'No toss data available for this match', matchId });
  }

  const matchInfo = tossInfo || cricketInfo || { matchId, matchName: data.matchName || (data.teamNames ? data.teamNames.join(' v ') : null) };
  const meta = attachMatchMeta(data, matchInfo, true);
  try {
    const crex = await getCrexForMatch(matchInfo, matchId);
    if (crex) {
      meta.crex = crex;
      meta.tossText = crex.scorecard?.tossText || crex.tossText || (crex.scorecard?.statusEquation && /opt|chose|elected|toss/i.test(crex.scorecard.statusEquation) ? crex.scorecard.statusEquation : null);
    }
  } catch (e) {}

  res.json(meta);
});

router.get('/session/matches', optionalAuth, assertTelegramMembership, async (req, res) => {
  const data = await dataCache.getSessionMatches();
  if (data?.error) return res.status(502).json({ error: data.error });
  const matches = Array.isArray(data) ? data : [];
  const filtered = filterMatchesForViewer(matches, req.user);
  res.set('Cache-Control', 'public, max-age=4, stale-while-revalidate=10');
  res.json({ total: filtered.length, matches: filtered });
});

router.get('/session/trades/:matchId', optionalAuth, assertTelegramMembership, async (req, res) => {
  const matchId = req.params.matchId;
  const [sessionMatches, cricketMatches] = await Promise.all([
    dataCache.getSessionMatches(),
    dataCache.getCricketMatches(),
  ]);
  const sessionInfo = findMatchInfo(sessionMatches, matchId);
  const cricketInfo = findMatchInfo(cricketMatches, matchId);
  
  if (!guestMayViewFromInfos(req.user, [sessionInfo, cricketInfo])) {
    return res.status(401).json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId });
  }
  const isEnded = isEndedMatch(sessionInfo) || isEndedMatch(cricketInfo);
  if (!isEnded && !assertProAccess(req, res)) return;
  const data = await dataCache.getSessionTrades(matchId);
  if (!data || data.error) {
    const status = (data?.upstreamStatus === 404 || data?.notFound || !data) ? 404 : 502;
    return res.status(status).json({ error: data?.error || 'No session data', matchId });
  }
  res.json(data);
});

router.get('/cricket/odds/:matchId', requireProSubscription, async (req, res) => {
  const data = await dataCache.getCricketSnapshot(req.params.matchId);
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
      dataCache.getCricketSnapshot(id).then(data => {
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

  const data = await dataCache.getCricketSnapshot(id);
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

// ──── Full Data Dump (Debug / Admin) ────

router.get(['/cricket/all-data', '/cricket/full'], requireProSubscription, async (req, res) => {
  const includeSnapshots = req.query.snapshots !== 'false' && req.query.include_snapshots !== 'false';
  res.json(await dataCache.getCricketFullData(includeSnapshots));
});

// ──── Tennis ────

router.get('/tennis/matches', optionalAuth, assertTelegramMembership, async (req, res) => {
  const payload = await matchPayloadService.getTennisMatchesPayload();
  const filtered = filterMatchesForViewer(payload.matches, req.user);
  res.set('Cache-Control', 'public, max-age=4, stale-while-revalidate=10');
  res.json({
    total: filtered.length,
    matches: filtered,
    updatedAt: payload.updatedAt,
  });
});

router.get('/tennis/match/:matchId', optionalAuth, assertTelegramMembership, async (req, res) => {
  const matchId = req.params.matchId;
  const matches = await dataCache.getTennisMatches();
  const matchInfo = findMatchInfo(matches, matchId);
  if (!guestMayViewMatch(matchInfo, req.user)) {
    return res.status(401).json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId });
  }
  const data = await dataCache.getTennisSnapshot(matchId);
  const isEnded = isEndedMatch(matchInfo);
  if (!isEnded && !assertProAccess(req, res)) return;
  if (!data) return upstreamUnavailable(res, { error: 'No data returned from upstream' });
  if (data?.error) return upstreamUnavailable(res, data);

  res.json(attachMatchMeta(data, matchInfo));
});

// ──── Live Odds ────

router.get('/live-odds/:matchId', requireProSubscription, async (req, res) => {
  res.json(await dataCache.getLiveOdds(req.params.matchId));
});

module.exports = router;
