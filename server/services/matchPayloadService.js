/**
 * matchPayloadService.js
 * Centralized formatting service for match feeds and bundles.
 * Used identically by both HTTP REST routes and WebSocket real-time broadcasters.
 */

const fs = require('fs');
const path = require('path');
const dataCache = require('./dataCache');
const crexService = require('./crexService');
const { getDefaultStore: getDefaultTossStore } = require('./tossDatasetStore');
const { isEndedMatch, guestMayViewMatch, guestMayViewFromInfos } = require('../lib/guestMatchAccess');
const { hasProAccess } = require('../lib/subscriptionAccess');
const { getSiteModeSync } = require('../lib/siteSettings');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');

// In-memory cache for toss dataset (prevents reading 1.4MB JSON from disk on every call)
let _tossDatasetCache = null;
let _tossDatasetCacheTs = 0;
const TOSS_DATASET_CACHE_TTL = 30 * 1000; // 30s

async function getCachedTossDataset() {
  const now = Date.now();
  if (_tossDatasetCache && (now - _tossDatasetCacheTs < TOSS_DATASET_CACHE_TTL)) {
    return _tossDatasetCache;
  }
  try {
    const store = getDefaultTossStore();
    const ds = await store.load();
    _tossDatasetCache = ds;
    _tossDatasetCacheTs = now;
    return ds;
  } catch (err) {
    return _tossDatasetCache || { records: [] };
  }
}

// In-memory cache for match dataset
let _matchDatasetCache = null;
let _matchDatasetCacheTs = 0;
const MATCH_DATASET_CACHE_TTL = 60 * 1000;

function getCachedMatchDataset() {
  const now = Date.now();
  if (_matchDatasetCache && (now - _matchDatasetCacheTs < MATCH_DATASET_CACHE_TTL)) {
    return _matchDatasetCache;
  }
  try {
    const mdPath = path.join(__dirname, '../data/match_dataset.json');
    if (fs.existsSync(mdPath)) {
      _matchDatasetCache = JSON.parse(fs.readFileSync(mdPath, 'utf8'));
      _matchDatasetCacheTs = now;
    }
  } catch {}
  return _matchDatasetCache || { records: [] };
}

// Persistent cache for ended matches
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

function computeMatchLoad(snap, matchInfo) {
  if (!snap && !matchInfo) return null;
  const t1 = snap?.teamNames?.[0] || matchInfo?.team1 || matchInfo?.matchName?.split(' v ')?.[0] || 'Team 1';
  const t2 = snap?.teamNames?.[1] || matchInfo?.team2 || matchInfo?.matchName?.split(' v ')?.[1] || 'Team 2';

  const teamsObj = snap?.teams || {};
  const teamKeys = Object.keys(teamsObj);
  const teamObj1 = teamsObj[t1] || (teamKeys[0] ? teamsObj[teamKeys[0]] : null);
  const teamObj2 = teamsObj[t2] || (teamKeys[1] ? teamsObj[teamKeys[1]] : null);

  const tr1 = teamObj1?.trades || [];
  const tr2 = teamObj2?.trades || [];

  const tradeVol1 = tr1.length > 0 ? tr1.reduce((sum, t) => sum + (parseFloat(t.size) || 0), 0) : 0;
  const tradeVol2 = tr2.length > 0 ? tr2.reduce((sum, t) => sum + (parseFloat(t.size) || 0), 0) : 0;

  const vol1 = tradeVol1 ||
    teamObj1?.totalBet ||
    snap?.preMatchVolume?.team1?.total ||
    snap?.preMatchVolume?.team1?.back ||
    snap?.inPlayVolume?.team1?.total ||
    snap?.threeMinVolume?.team1?.total ||
    snap?.advancedMetricsV2?.team1?.totalBet ||
    snap?.advancedMetrics?.team1?.totalVolume ||
    snap?.trueMarketLoad?.team1?.totalSupport ||
    snap?.trueMarketLoad?.team1?.matchedVolume ||
    snap?.supportMetrics?.team1?.supportMoney ||
    matchInfo?.preMatchVolume?.team1?.total ||
    0;

  const vol2 = tradeVol2 ||
    teamObj2?.totalBet ||
    snap?.preMatchVolume?.team2?.total ||
    snap?.preMatchVolume?.team2?.back ||
    snap?.inPlayVolume?.team2?.total ||
    snap?.threeMinVolume?.team2?.total ||
    snap?.advancedMetricsV2?.team2?.totalBet ||
    snap?.advancedMetrics?.team2?.totalVolume ||
    snap?.trueMarketLoad?.team2?.totalSupport ||
    snap?.trueMarketLoad?.team2?.matchedVolume ||
    snap?.supportMetrics?.team2?.supportMoney ||
    matchInfo?.preMatchVolume?.team2?.total ||
    0;

  let total = vol1 + vol2;
  let finalVol1 = vol1;
  let finalVol2 = vol2;

  const sortedTrades1 = [...tr1].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const sortedTrades2 = [...tr2].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  // Extract latest BACK trade specifically (always prefer BACK odds)
  const backTrade1 = sortedTrades1.find(t => {
    const s = String(t.type || t.side || '').toLowerCase();
    return s === 'back' || s === 'b';
  });
  const backTrade2 = sortedTrades2.find(t => {
    const s = String(t.type || t.side || '').toLowerCase();
    return s === 'back' || s === 'b';
  });

  const getRunnerBack = (runnersList, teamName, idx) => {
    if (!Array.isArray(runnersList) || !runnersList.length) return null;
    if (teamName) {
      const tNorm = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matched = runnersList.find(r => {
        const rNorm = String(r.runnerName || r.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return rNorm && (tNorm.includes(rNorm) || rNorm.includes(tNorm));
      });
      if (matched) {
        return matched.back || matched.backPrice || matched.ex?.availableToBack?.[0]?.price || matched.price || null;
      }
    }
    const r = runnersList[idx];
    return r?.back || r?.backPrice || r?.ex?.availableToBack?.[0]?.price || r?.price || null;
  };

  const runnerBack1 = getRunnerBack(snap?.runners, t1, 0) || getRunnerBack(matchInfo?.runners, t1, 0);
  const runnerBack2 = getRunnerBack(snap?.runners, t2, 1) || getRunnerBack(matchInfo?.runners, t2, 1);

  const lastPrice1 = (backTrade1?.price && !isNaN(Number(backTrade1.price))) ? parseFloat(backTrade1.price) :
    (runnerBack1 && !isNaN(Number(runnerBack1))) ? parseFloat(runnerBack1) :
    (sortedTrades1[0]?.price && !isNaN(Number(sortedTrades1[0].price))) ? parseFloat(sortedTrades1[0].price) :
    (tr1[tr1.length - 1]?.price && !isNaN(Number(tr1[tr1.length - 1].price))) ? parseFloat(tr1[tr1.length - 1].price) :
    snap?.syntheticSupport?.teamA?.averageOdds ||
    null;

  const lastPrice2 = (backTrade2?.price && !isNaN(Number(backTrade2.price))) ? parseFloat(backTrade2.price) :
    (runnerBack2 && !isNaN(Number(runnerBack2))) ? parseFloat(runnerBack2) :
    (sortedTrades2[0]?.price && !isNaN(Number(sortedTrades2[0].price))) ? parseFloat(sortedTrades2[0].price) :
    (tr2[tr2.length - 1]?.price && !isNaN(Number(tr2[tr2.length - 1].price))) ? parseFloat(tr2[tr2.length - 1].price) :
    snap?.syntheticSupport?.teamB?.averageOdds ||
    null;

  // Support percentage from trueMarketLoad, volume ratio, or odds-implied probability
  let pct1 = null;
  let pct2 = null;
  const tml1 = snap?.trueMarketLoad?.team1?.supportPercentage;
  const tml2 = snap?.trueMarketLoad?.team2?.supportPercentage;
  if (typeof tml1 === 'number' && typeof tml2 === 'number' && (tml1 > 0 || tml2 > 0)) {
    pct1 = Math.round(tml1);
    pct2 = 100 - pct1;
  } else if (total > 0 && finalVol1 !== finalVol2) {
    pct1 = Math.round((finalVol1 / total) * 100);
    pct2 = 100 - pct1;
  }

  // Fallback to implied probability from odds if percentages are not set or 50/50
  if ((pct1 === null || (pct1 === 50 && pct2 === 50)) && lastPrice1 && lastPrice2 && lastPrice1 > 1 && lastPrice2 > 1 && lastPrice1 !== lastPrice2) {
    const inv1 = 1 / lastPrice1;
    const inv2 = 1 / lastPrice2;
    pct1 = Math.round((inv1 / (inv1 + inv2)) * 100);
    pct2 = 100 - pct1;
  }

  if (pct1 === null) pct1 = 50;
  if (pct2 === null) pct2 = 100 - pct1;

  // If vol1 & vol2 are 0 but totalMatched > 0, split by pct1/pct2
  if (finalVol1 === 0 && finalVol2 === 0 && (matchInfo?.totalMatched || 0) > 0) {
    finalVol1 = Math.round(matchInfo.totalMatched * (pct1 / 100));
    finalVol2 = matchInfo.totalMatched - finalVol1;
    total = matchInfo.totalMatched;
  }

  let trend1 = 'up';
  const backTrades1 = sortedTrades1.filter(t => {
    const s = String(t.type || t.side || '').toLowerCase();
    return s === 'back' || s === 'b';
  });
  const tradesForTrend1 = backTrades1.length >= 2 ? backTrades1 : sortedTrades1;
  if (tradesForTrend1.length >= 2) {
    const last = parseFloat(tradesForTrend1[0].price) || 0;
    const prev = parseFloat(tradesForTrend1.find(t => t.price !== tradesForTrend1[0].price)?.price) || last;
    if (last < prev) trend1 = 'down';
  }

  let trend2 = 'up';
  const backTrades2 = sortedTrades2.filter(t => {
    const s = String(t.type || t.side || '').toLowerCase();
    return s === 'back' || s === 'b';
  });
  const tradesForTrend2 = backTrades2.length >= 2 ? backTrades2 : sortedTrades2;
  if (tradesForTrend2.length >= 2) {
    const last = parseFloat(tradesForTrend2[0].price) || 0;
    const prev = parseFloat(tradesForTrend2.find(t => t.price !== tradesForTrend2[0].price)?.price) || last;
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

function computeTossLoad(snap, matchInfo) {
  if (!snap && !matchInfo) return null;
  const t1 = snap?.teamNames?.[0] || matchInfo?.team1 || matchInfo?.matchName?.split(' v ')?.[0] || 'Team 1';
  const t2 = snap?.teamNames?.[1] || matchInfo?.team2 || matchInfo?.matchName?.split(' v ')?.[1] || 'Team 2';

  const m1 = snap?.advancedMetricsV2?.team1 || snap?.supportMetrics?.team1 || null;
  const m2 = snap?.advancedMetricsV2?.team2 || snap?.supportMetrics?.team2 || null;

  const vol1 = m1?.totalBet || m1?.back || m1?.lay || 0;
  const vol2 = m2?.totalBet || m2?.back || m2?.lay || 0;
  const total = vol1 + vol2;

  const pct1 = total > 0 ? Math.round((vol1 / total) * 100) : 50;
  const pct2 = total > 0 ? (100 - pct1) : 50;

  return {
    team1: { name: t1, money: Math.round(vol1), percent: pct1 },
    team2: { name: t2, money: Math.round(vol2), percent: pct2 },
    totalMatched: Math.round(total),
  };
}

function findMatchInfo(matches, matchId) {
  if (!Array.isArray(matches) || !matchId) return null;
  return matches.find(m => String(m.matchId) === String(matchId)) || null;
}

function attachMatchMeta(snapshot, matchInfo, isToss = false) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const result = { ...snapshot };
  if (matchInfo) {
    if (!result.competitionName && matchInfo.competitionName) result.competitionName = matchInfo.competitionName;
    if (!result.startTime && matchInfo.startTime) result.startTime = matchInfo.startTime;
    if (!result.status && matchInfo.status) result.status = matchInfo.status;
    if (result.inPlay === undefined && matchInfo.inPlay !== undefined) result.inPlay = matchInfo.inPlay;
    if (!result.matchName && matchInfo.matchName) result.matchName = matchInfo.matchName;
  }
  if (!isToss) {
    try {
      const prediction = predictMatchWinner(result);
      if (prediction) result.aiPrediction = prediction;
      else delete result.aiPrediction;
    } catch {}
  }
  return result;
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

/**
 * Builds the complete cricket matches feed payload (for HTTP and WebSocket)
 */
async function getCricketMatchesPayload() {
  const matchesMap = new Map();
  const liveData = dataCache.getCricketMatches();

  if (Array.isArray(liveData) && liveData.length > 0) {
    const isMatchEnded = (m) => {
      const s = (m.status || '').toLowerCase();
      return s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed';
    };

    const activeLive = liveData.filter(m => !isMatchEnded(m));
    const endedLive = liveData.filter(m => isMatchEnded(m));

    // Active matches: get snapshot from in-memory cache instantly
    for (const m of activeLive) {
      let snap = null;
      try {
        snap = await dataCache.getCricketSnapshot(m.matchId);
        if (snap?.error) snap = null;
      } catch (e) {}

      if (!snap) {
        try {
          const md = getCachedMatchDataset();
          const rec = (md?.records || []).find(x => String(x.matchId) === String(m.matchId));
          if (rec?.snapshot) snap = rec.snapshot;
        } catch {}
      }

      if (!snap) {
        try {
          const tllWorker = require('./scraper-tennisliveload');
          if (typeof tllWorker.triggerImmediateMatchFetch === 'function') {
            tllWorker.triggerImmediateMatchFetch(m.matchId);
          }
        } catch {}
      }

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
    }

    // Ended matches
    const uncachedEnded = endedLive.filter(m => !endedMatchesCache.has(String(m.matchId)));
    if (uncachedEnded.length > 0) {
      let hasNew = false;
      for (const m of uncachedEnded) {
        try {
          const snap = await dataCache.getCricketSnapshot(m.matchId);
          const load = computeMatchLoad(snap, m);
          endedMatchesCache.set(String(m.matchId), {
            matchLoad: load,
            runners: snap?.runners || m.runners || [],
            totalMatched: load?.totalMatched || m.totalMatched || 0,
          });
          hasNew = true;
        } catch (e) {}
      }
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

  // Enrich with in-memory CREX live scores
  try {
    const crexOverview = dataCache.getCrexOverview();
    if (Array.isArray(crexOverview) && crexOverview.length > 0) {
      for (const m of allMatches) {
        const cm = crexService.findCrexMatch(m.matchName, crexOverview, {
          startTime: m.startTime || m.openDate || m.marketStartTime,
          status: m.status,
          inPlay: m.inPlay,
        });
        if (cm) {
          // Use live crex detail cache (has latest overs/score) over stale snapshot
          const liveDetail = dataCache.getCrexDetail(cm.crexMatchId || cm.slug || String(m.matchId));
          const sc = liveDetail?.scorecard || m.snapshot?.crex?.scorecard;
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
            score1: sc?.team1?.score || liveDetail?.score1 || cm.score1,
            score2: sc?.team2?.score || liveDetail?.score2 || cm.score2,
            status: liveDetail?.status || cm.status,
            statusText: sc?.statusEquation || sc?.matchResult || liveDetail?.statusText || cm.statusText,
            venue: cm.venue,
            odds: liveDetail?.odds || m.snapshot?.crex?.odds || cm.odds,
            runningBall: sc?.runningBall || liveDetail?.runningBall || cm.runningBall || null,
          };
        }
      }
    }
  } catch (err) {}

  const compsSet = new Set();
  allMatches.forEach(m => {
    if (m.competitionName) compsSet.add(m.competitionName);
  });

  return {
    total: allMatches.length,
    matches: allMatches,
    competitions: Array.from(compsSet).sort(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Builds the toss matches feed payload
 */
async function getTossMatchesPayload() {
  const matchesMap = new Map();
  const dataset = await getCachedTossDataset();
  const datasetRecords = Array.isArray(dataset?.records) ? dataset.records : [];
  const datasetMap = new Map();
  datasetRecords.forEach(r => {
    if (r.matchId) datasetMap.set(String(r.matchId), r);
  });

  const liveData = dataCache.getTossMatches();
  if (Array.isArray(liveData)) {
    for (const m of liveData) {
      const id = String(m.matchId);
      let snap = null;
      try {
        snap = await dataCache.getTossSnapshot(m.matchId);
        if (snap?.error) snap = null;
      } catch (e) {}

      const dsRec = datasetMap.get(id);
      if (!snap && dsRec?.snapshot) snap = dsRec.snapshot;

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
        matchLoad: load,
        tossLoad: load,
        predictedWinner: dsRec?.predictedWinner,
        actualWinner: dsRec?.actualWinner,
      });
    }
  }

  const matches = Array.from(matchesMap.values());

  const getTossTier = (m) => {
    const s = (m.status || '').toLowerCase();
    const isEnded = s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed';
    if (isEnded) return 3;
    const isLive = m.inPlay || s === 'in-play' || s === 'live';
    if (isLive) return 1;
    return 2;
  };

  matches.sort((a, b) => {
    const tierA = getTossTier(a);
    const tierB = getTossTier(b);
    if (tierA !== tierB) return tierA - tierB;
    if (tierA === 2) {
      return (a.startTime || 0) - (b.startTime || 0);
    }
    return (b.startTime || 0) - (a.startTime || 0);
  });

  const compsSet = new Set();
  matches.forEach(m => {
    if (m.competitionName) compsSet.add(m.competitionName);
  });

  return {
    total: matches.length,
    matches,
    competitions: Array.from(compsSet).sort(),
    updatedAt: new Date().toISOString(),
  };
}

async function getSessionMatchesPayload() {
  const data = dataCache.getSessionMatches();
  const matches = Array.isArray(data) ? data : [];
  return {
    total: matches.length,
    matches,
    updatedAt: new Date().toISOString(),
  };
}


/**
 * Builds the tennis matches feed payload
 */
async function getTennisMatchesPayload() {
  const data = dataCache.getTennisMatches();
  const matches = Array.isArray(data) ? data : [];
  return {
    total: matches.length,
    matches,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Builds the match bundle payload for a specific match (Instant 0ms from cache)
 */
async function getMatchBundlePayload(matchId, user, sport = 'cricket', options = {}) {
  if (!matchId) return null;

  const mid = String(matchId);
  const isBroadcaster = Boolean(user?.isBroadcaster || options?.skipAuthCheck);

  if (sport === 'tennis') {
    const tennisMatches = dataCache.getTennisMatches();
    const tInfo = findMatchInfo(tennisMatches, mid);
    if (!isBroadcaster) {
      if (!guestMayViewMatch(tInfo, user)) {
        return { error: 'login_required', message: 'Live/upcoming match data requires login.', matchId: mid };
      }
      const isEnded = isEndedMatch(tInfo);
      const isFree = getSiteModeSync() === 'free';
      if (!isEnded && !isFree && !hasProAccess(user)) {
        return { error: 'subscription_required', message: 'Pro subscription required', code: 'SUBSCRIPTION_REQUIRED', matchId: mid };
      }
    }
    const snap = await dataCache.getTennisSnapshot(mid);
    return {
      matchId: mid,
      sport: 'tennis',
      cricket: snap ? attachMatchMeta(snap, tInfo) : null,
      toss: null,
      session: null,
      crex: null,
      updatedAt: new Date().toISOString(),
    };
  }

  const cricketMatches = dataCache.getCricketMatches();
  const tossMatches = dataCache.getTossMatches();
  let matchInfo = findMatchInfo(cricketMatches, mid);
  let tossInfo = findMatchInfo(tossMatches, mid);

  if (!matchInfo) {
    try {
      const md = getCachedMatchDataset();
      const rec = (md?.records || []).find(x => String(x.matchId) === mid);
      if (rec) {
        matchInfo = {
          matchId: mid,
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

  // Access check
  if (!isBroadcaster) {
    if (!guestMayViewMatch(matchInfo, user) && !guestMayViewFromInfos(user, [tossInfo, matchInfo])) {
      return { error: 'login_required', message: 'Live/upcoming match data requires login.', matchId: mid };
    }

    const isEnded = isEndedMatch(matchInfo) || isEndedMatch(tossInfo);
    const isFree = getSiteModeSync() === 'free';
    if (!isEnded && !isFree && !hasProAccess(user)) {
      return { error: 'subscription_required', message: 'Pro subscription required', code: 'SUBSCRIPTION_REQUIRED', matchId: mid };
    }
  }

  // Read all snapshots synchronously from memory (0ms)
  const cricketRaw = await dataCache.getCricketSnapshot(mid);
  const tossRaw = await dataCache.getTossSnapshot(mid).catch(() => null);
  const sessionRaw = await dataCache.getSessionTrades(mid).catch(() => null);
  const cachedCrex = dataCache.getCrexDetail(mid);

  let cricket = (!cricketRaw || cricketRaw.error)
    ? null
    : attachMatchMeta(cricketRaw, matchInfo);

  if (!cricket) {
    if (matchInfo && matchInfo.status !== 'ended') {
      try {
        const tllWorker = require('./scraper-tennisliveload');
        if (typeof tllWorker.triggerImmediateMatchFetch === 'function') {
          tllWorker.triggerImmediateMatchFetch(mid);
        }
      } catch {}
    }
    try {
      const md = getCachedMatchDataset();
      const rec = (md?.records || []).find(x => String(x.matchId) === mid);
      if (rec && rec.snapshot) {
        cricket = attachMatchMeta(JSON.parse(JSON.stringify(rec.snapshot)), matchInfo);
        if (rec.actualWinner && !cricket.actualWinner) cricket.actualWinner = rec.actualWinner;
      }
    } catch {}
  }

  let toss = (!tossRaw || tossRaw.error)
    ? null
    : attachMatchMeta(tossRaw, tossInfo || matchInfo, true);

  if (!toss) {
    try {
      const ds = await getCachedTossDataset();
      const rec = (ds.records || []).find(x => String(x.matchId) === mid);
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

  const session = !sessionRaw || sessionRaw.error ? null : sessionRaw;
  let crex = cachedCrex || matchInfo?.crex || null;

  // Non-blocking: If detailed Crex scorecard is missing, fetch in background without delaying cricket odds/trades response
  if ((!crex || !crex.scorecard) && matchInfo) {
    triggerBackgroundCrexFetch(matchInfo, mid);
  }

  return {
    matchId: mid,
    cricket,
    toss,
    session,
    crex,
    updatedAt: new Date().toISOString(),
  };
}

const _pendingCrexBackgroundFetches = new Set();

function triggerBackgroundCrexFetch(matchInfo, matchId) {
  const mid = String(matchId);
  if (_pendingCrexBackgroundFetches.has(mid)) return;
  _pendingCrexBackgroundFetches.add(mid);

  setImmediate(async () => {
    try {
      const fullCrex = await getCrexForMatch(matchInfo, mid);
      if (fullCrex) {
        if (typeof dataCache.setCrexDetail === 'function') {
          dataCache.setCrexDetail(mid, fullCrex);
        }
        try {
          const socketService = require('./socketService');
          if (typeof socketService.broadcastCrexForMatch === 'function') {
            socketService.broadcastCrexForMatch(mid, fullCrex);
          }
        } catch {}
      }
    } catch (e) {
      // Quiet fail in background
    } finally {
      setTimeout(() => _pendingCrexBackgroundFetches.delete(mid), 3000);
    }
  });
}

async function getCrexForMatch(matchInfo, matchId = null) {
  try {
    let crexOverview = dataCache.getCrexOverview();
    if (!Array.isArray(crexOverview) || !crexOverview.length) {
      crexOverview = await crexService.getCrexOverview();
    }
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
      const cachedDetail = dataCache.getCrexDetail(matched.crexMatchId || matched.slug || matchId);
      const detail = cachedDetail || await crexService.getCrexMatchDetail(matched.slug || matched.url);
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

module.exports = {
  getCricketMatchesPayload,
  getTossMatchesPayload,
  getTennisMatchesPayload,
  getSessionMatchesPayload,
  getMatchBundlePayload,
  getCrexForMatch,
  computeMatchLoad,
  computeTossLoad,
  alignScorecardTeams,
  getCachedTossDataset,
  getCachedMatchDataset,
  findMatchInfo,
  attachMatchMeta,
};
