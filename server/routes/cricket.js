const express = require('express');
const router = express.Router();
const scraper = require('../services/scraper');
const { optionalAuth, requireProSubscription, assertProAccess } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { filterMatchesForViewer, guestMayViewMatch, guestMayViewFromInfos, isEndedMatch } = require('../lib/guestMatchAccess');

// ──── Auth (admin only — scraper login control) ────

router.post('/auth/login', requireAdmin, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ detail: 'Email and password are required' });

  const result = await scraper.login(email, password);
  if (result.error) {
    const status = result.status_code === 429 ? 429 : 401;
    return res.status(status).json({ detail: result.error });
  }
  res.json({ status: 'logged_in', email, message: '✅ Login successful! Ab live matches ka data ab accessible hoga.' });
});

router.get('/auth/status', requireAdmin, (req, res) => {
  res.json(scraper.getAuthState());
});

router.post('/auth/logout', requireAdmin, (req, res) => {
  scraper.logout();
  res.json({ status: 'logged_out', message: 'Logged out successfully' });
});

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

function attachMatchMeta(data, matchInfo) {
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
  return data;
}

router.get('/cricket/matches', optionalAuth, async (req, res) => {
  const data = await scraper.getAllCricketMatches();
  if (data?.error) return upstreamUnavailable(res, data);
  const matches = asMatchList(data);
  const filtered = filterMatchesForViewer(matches, req.user);
  res.json({ total: filtered.length, matches: filtered });
});

router.get('/cricket/match/:matchId', optionalAuth, async (req, res) => {
  const matchId = req.params.matchId;
  const matches = await scraper.getAllCricketMatches();
  const matchInfo = findMatchInfo(matches, matchId);
  if (!guestMayViewMatch(matchInfo, req.user)) {
    return res.status(401).json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId });
  }
  const data = await scraper.getCricketSnapshot(matchId);
  const isEnded = matchInfo?.status === 'ended';
  if (!isEnded && !assertProAccess(req, res)) return;
  if (data?.error) {
    if (String(data.error).includes('401'))
      return res.json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId });
    return upstreamUnavailable(res, data);
  }
  res.json(attachMatchMeta(data, matchInfo));
});

/** One request for MatchDetail poll — cricket + toss + session (single auth). */
router.get('/cricket/match/:matchId/bundle', optionalAuth, async (req, res) => {
  const matchId = req.params.matchId;
  const [cricketMatches, tossMatches] = await Promise.all([
    scraper.getAllCricketMatches(),
    scraper.getAllTossMatches(),
  ]);
  const matchInfo = findMatchInfo(cricketMatches, matchId);
  const tossInfo = findMatchInfo(tossMatches, matchId);

  if (!guestMayViewMatch(matchInfo, req.user) && !guestMayViewFromInfos(req.user, [tossInfo, matchInfo])) {
    return res.status(401).json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId });
  }

  const isEnded = isEndedMatch(matchInfo) || isEndedMatch(tossInfo);
  if (!isEnded && !assertProAccess(req, res)) return;

  const [cricketRaw, tossRaw, sessionRaw] = await Promise.all([
    scraper.getCricketSnapshot(matchId),
    scraper.getTossSnapshot(matchId).catch(() => null),
    scraper.getSessionTrades(matchId).catch(() => null),
  ]);

  const cricket = cricketRaw?.error
    ? { error: cricketRaw.error }
    : attachMatchMeta(cricketRaw, matchInfo);

  const toss = !tossRaw || tossRaw.error
    ? null
    : attachMatchMeta(tossRaw, tossInfo || matchInfo);

  const session = !sessionRaw || sessionRaw.error ? null : sessionRaw;

  res.json({ matchId, cricket, toss, session });
});

router.get('/toss/matches', optionalAuth, async (req, res) => {
  const data = await scraper.getAllTossMatches();
  if (!data || data.error) return upstreamUnavailable(res, data || { error: 'No toss matches data' });
  const list = Array.isArray(data) ? data : [];
  const filtered = filterMatchesForViewer(list, req.user);
  res.json({ matches: filtered });
});

router.get('/toss/match/:matchId', optionalAuth, async (req, res) => {
  const matchId = req.params.matchId;
  const [tossMatches, cricketMatches] = await Promise.all([
    scraper.getAllTossMatches(),
    scraper.getAllCricketMatches(),
  ]);
  const tossInfo = findMatchInfo(tossMatches, matchId);
  const cricketInfo = findMatchInfo(cricketMatches, matchId);
  if (!guestMayViewFromInfos(req.user, [tossInfo, cricketInfo])) {
    return res.status(401).json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId });
  }
  const isEnded = isEndedMatch(tossInfo) || isEndedMatch(cricketInfo);
  if (!isEnded && !assertProAccess(req, res)) return;
  const data = await scraper.getTossSnapshot(matchId);
  if (!data || data.error) return res.status(502).json({ error: data?.error || 'No toss data' });
  res.json(attachMatchMeta(data, tossInfo || cricketInfo));
});

router.get('/session/matches', optionalAuth, async (req, res) => {
  const data = await scraper.getAllSessionMatches();
  if (data?.error) return res.status(502).json({ error: data.error });
  const matches = Array.isArray(data) ? data : [];
  const filtered = filterMatchesForViewer(matches, req.user);
  res.json({ total: filtered.length, matches: filtered });
});

router.get('/session/trades/:matchId', optionalAuth, async (req, res) => {
  const matchId = req.params.matchId;
  if (!assertProAccess(req, res)) return;
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
router.get('/cricket/odds-bulk', requireProSubscription, async (req, res) => {
  const matchIds = req.query.ids ? req.query.ids.split(',').filter(Boolean) : [];
  if (!matchIds.length) return res.status(400).json({ error: 'No match IDs provided' });
  
  const results = {};
  await Promise.all(matchIds.map(async (id) => {
    const data = await scraper.getCricketSnapshot(id);
    if (!data || data.error) return;
    
    const teams = data.teams || {};
    const odds = {};
    for (const [teamName, teamData] of Object.entries(teams)) {
      const trades = teamData.trades || [];
      if (!trades.length) { odds[teamName] = { back: null, lay: null }; continue; }
      const sorted = [...trades].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      odds[teamName] = {
        back: sorted.find(t => t.type === 'back')?.price ?? null,
        lay:  sorted.find(t => t.type === 'lay')?.price  ?? null,
      };
    }
    results[id] = { teamNames: data.teamNames || [], odds };
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
  if (data?.error === 'Login required for live matches')
    return res.json({ error: 'login_required', message: 'Tennis live data requires login.', matchId, matchName: data.matchName, teamNames: data.teamNames || [] });

  res.json(attachMatchMeta(data, matchInfo));
});

// ──── Live Odds ────

router.get('/live-odds/:matchId', requireProSubscription, async (req, res) => {
  res.json(await scraper.getLiveOdds(req.params.matchId));
});

module.exports = router;
