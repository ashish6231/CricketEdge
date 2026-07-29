const express = require('express');
const router = express.Router();
const scraper = require('../services/scraper');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { predictMatch } = require('../services/bookiePrediction');

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
  const data = await scraper.getCricketSnapshot(req.params.matchId);
  if (data?.error) {
    if (String(data.error).includes('401'))
      return res.json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId: req.params.matchId });
    return res.status(502).json({ detail: data.error });
  }
  data.bookiePrediction = predictMatch(data);
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
  const data = await scraper.getTennisSnapshot(req.params.matchId);
  if (data?.error === 'Login required for live matches')
    return res.json({ error: 'login_required', message: 'Tennis live data requires login.', matchId: req.params.matchId, matchName: data.matchName, teamNames: data.teamNames || [] });
  data.bookiePrediction = predictMatch(data);
  res.json(data);
});

// ──── Session ────

router.get('/session/matches', verifyToken, async (req, res) => {
  const data = await scraper.getAllSessionMatches();
  if (data?.error) return res.status(502).json({ detail: data.error });
  res.json({ total: data.length, matches: data });
});

router.get('/session/trades/:matchId', verifyToken, async (req, res) => {
  const data = await scraper.getSessionTrades(req.params.matchId);
  if (data?.error === 'Login required for live matches')
    return res.json({ error: 'login_required', message: 'Session live data requires login.', matchId: req.params.matchId, matchName: data.matchName, teamNames: data.teamNames || [] });
  res.json(data);
});

// ──── Toss ────

router.get('/toss/matches', verifyToken, async (req, res) => {
  const data = await scraper.getAllTossMatches();
  if (data?.error) return res.status(502).json({ detail: data.error });
  res.json({ total: data.length, matches: data });
});

router.get('/toss/match/:matchId', verifyToken, async (req, res) => {
  const data = await scraper.getTossSnapshot(req.params.matchId);
  if (data?.error) {
    if (String(data.error).includes('401'))
      return res.json({ error: 'login_required', message: 'Toss live/upcoming data requires login.', matchId: req.params.matchId });
    return res.status(502).json({ detail: data.error });
  }
  data.bookiePrediction = predictMatch(data);
  res.json(data);
});

// ──── Live Odds ────

router.get('/live-odds/:matchId', verifyToken, async (req, res) => {
  res.json(await scraper.getLiveOdds(req.params.matchId));
});

module.exports = router;
