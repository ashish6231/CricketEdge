const express = require('express');
const router = express.Router();
const scraper = require('../services/scraper');
const { verifyToken, requireProSubscription } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { hasProAccess } = require('../lib/subscriptionAccess');

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

router.get('/cricket/matches', verifyToken, async (req, res) => {
  const data = await scraper.getAllCricketMatches();
  if (data?.error) return res.status(502).json({ detail: data.error });
  const matches = Array.isArray(data) ? data : [];
  res.json({ total: matches.length, matches });
});

router.get('/cricket/match/:matchId', verifyToken, async (req, res) => {
  const matchId = req.params.matchId;
  const [matches, data] = await Promise.all([
    scraper.getAllCricketMatches(),
    scraper.getCricketSnapshot(matchId),
  ]);
  const matchInfo = (Array.isArray(matches) ? matches : []).find(m => m.matchId == matchId);
  const isEnded = matchInfo?.status === 'ended';
  if (!isEnded) {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'superadmin') {
      const prisma = require('../db/prisma');
      const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { role: true, subPlanSlug: true, subStatus: true, subExpiresAt: true } });
      if (!hasProAccess(user)) return res.status(403).json({ success: false, message: 'Pro subscription required', code: 'SUBSCRIPTION_REQUIRED' });
    }
  }
  if (data?.error) {
    if (String(data.error).includes('401'))
      return res.json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId });
    return res.status(502).json({ detail: data.error });
  }
  if (matchInfo && !data.error) {
    data.inPlay = matchInfo.inPlay;
    data.competitionName = matchInfo.competitionName;
    data.status = matchInfo.status;
  }
  res.json(data);
});

router.get('/toss/matches', verifyToken, async (req, res) => {
  const data = await scraper.getAllTossMatches();
  if (!data || data.error) return res.status(502).json({ error: data?.error || 'No toss matches data' });
  res.json({ matches: data });
});

router.get('/toss/match/:matchId', verifyToken, async (req, res) => {
  const data = await scraper.getTossSnapshot(req.params.matchId);
  if (!data || data.error) return res.status(502).json({ error: data?.error || 'No toss data' });
  res.json(data);
});

router.get('/session/matches', verifyToken, async (req, res) => {
  const data = await scraper.getAllSessionMatches();
  if (data?.error) return res.status(502).json({ error: data.error });
  const matches = Array.isArray(data) ? data : [];
  res.json({ total: matches.length, matches });
});

router.get('/session/trades/:matchId', verifyToken, async (req, res) => {
  const data = await scraper.getSessionTrades(req.params.matchId);
  if (!data || data.error) return res.status(502).json({ error: data?.error || 'No session data' });
  res.json(data);
});

router.get('/cricket/odds/:matchId', verifyToken, async (req, res) => {
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
router.get('/cricket/odds-bulk', verifyToken, async (req, res) => {
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

router.get('/cricket/full', verifyToken, async (req, res) => {
  const includeSnapshots = req.query.include_snapshots !== 'false';
  res.json(await scraper.getCricketFullData(includeSnapshots));
});

// ──── Tennis ────

router.get('/tennis/matches', verifyToken, async (req, res) => {
  const data = await scraper.getAllTennisMatches();
  if (data?.error) return res.status(502).json({ detail: data.error });
  res.json({ total: data.length, matches: data });
});

router.get('/tennis/match/:matchId', verifyToken, async (req, res) => {
  const matchId = req.params.matchId;
  const [matches, data] = await Promise.all([
    scraper.getAllTennisMatches(),
    scraper.getTennisSnapshot(matchId),
  ]);
  const matchInfo = (Array.isArray(matches) ? matches : []).find(m => m.matchId == matchId);
  const isEnded = matchInfo?.status === 'ended';
  if (!isEnded) {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'superadmin') {
      const prisma = require('../db/prisma');
      const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { role: true, subPlanSlug: true, subStatus: true, subExpiresAt: true } });
      if (!hasProAccess(user)) return res.status(403).json({ success: false, message: 'Pro subscription required', code: 'SUBSCRIPTION_REQUIRED' });
    }
  }
  if (data?.error === 'Login required for live matches')
    return res.json({ error: 'login_required', message: 'Tennis live data requires login.', matchId, matchName: data.matchName, teamNames: data.teamNames || [] });

  if (matchInfo && !data.error) {
    data.inPlay = matchInfo.inPlay;
    data.competitionName = matchInfo.competitionName;
    data.status = matchInfo.status;
  }
  res.json(data);
});

// ──── Live Odds ────

router.get('/live-odds/:matchId', verifyToken, async (req, res) => {
  res.json(await scraper.getLiveOdds(req.params.matchId));
});

module.exports = router;
