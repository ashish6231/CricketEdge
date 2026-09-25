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

  const tr1 = snap?.teams?.[t1]?.trades || [];
  const tr2 = snap?.teams?.[t2]?.trades || [];

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
        snapshot: snap || null,
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
        snapshot: snap,
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
async function getMatchBundlePayload(matchId, user, sport = 'cricket') {
  if (!matchId) return null;

  const mid = String(matchId);

  if (sport === 'tennis') {
    const tennisMatches = dataCache.getTennisMatches();
    const tInfo = findMatchInfo(tennisMatches, mid);
    if (!guestMayViewMatch(tInfo, user)) {
      return { error: 'login_required', message: 'Live/upcoming match data requires login.', matchId: mid };
    }
    const isEnded = isEndedMatch(tInfo);
    const isFree = getSiteModeSync() === 'free';
    if (!isEnded && !isFree && !hasProAccess(user)) {
      return { error: 'subscription_required', message: 'Pro subscription required', code: 'SUBSCRIPTION_REQUIRED', matchId: mid };
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
  if (!guestMayViewMatch(matchInfo, user) && !guestMayViewFromInfos(user, [tossInfo, matchInfo])) {
    return { error: 'login_required', message: 'Live/upcoming match data requires login.', matchId: mid };
  }

  const isEnded = isEndedMatch(matchInfo) || isEndedMatch(tossInfo);
  const isFree = getSiteModeSync() === 'free';
  if (!isEnded && !isFree && !hasProAccess(user)) {
    return { error: 'subscription_required', message: 'Pro subscription required', code: 'SUBSCRIPTION_REQUIRED', matchId: mid };
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
  const crex = cachedCrex || null;

  return {
    matchId: mid,
    cricket,
    toss,
    session,
    crex,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getCricketMatchesPayload,
  getTossMatchesPayload,
  getTennisMatchesPayload,
  getSessionMatchesPayload,
  getMatchBundlePayload,
  computeMatchLoad,
  computeTossLoad,
  alignScorecardTeams,
  getCachedTossDataset,
  getCachedMatchDataset,
  findMatchInfo,
  attachMatchMeta,
};
