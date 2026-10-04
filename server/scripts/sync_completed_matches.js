#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const { captureEndedMatches } = require('../services/matchCapture');
const { getDefaultStore } = require('../services/matchDatasetStore');

const SESSION_FILE = path.join(__dirname, '../tennis_cookies.json');
const COMPLETED = new Set(['ended', 'completed', 'closed', 'verified']);

function loadCachedSession() {
  const saved = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  if (!saved.cookies || !saved.expiry || saved.expiry <= Date.now()) {
    throw new Error('Cached upstream session is missing or expired; refusing to log in');
  }
  return saved.cookies;
}

function istDay(value) {
  const numeric = Number(value);
  const date = new Date(Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

async function main() {
  const requestedDay = process.argv.find(value => value.startsWith('--date='))?.slice(7) || null;
  const requestedMatchId = process.argv.find(value => value.startsWith('--match-id='))?.slice(11) || null;
  const client = axios.create({
    baseURL: (process.env.TENNIS_BASE_URL || 'https://tennisliveload.com').replace(/\/$/, ''),
    timeout: 15000,
    headers: { Cookie: loadCachedSession(), Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    validateStatus: status => status >= 200 && status < 300,
  });
  const { data } = await client.get('/api/cricket/matches');
  const all = Array.isArray(data) ? data : data?.matches || [];
  if (requestedMatchId && !all.some(match => String(match.matchId || match.id) === requestedMatchId)) {
    const tossData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/toss_dataset.json'), 'utf8'));
    const recovered = tossData.records?.find(record => String(record.matchId) === requestedMatchId);
    if (!recovered?.endedAt || Number(recovered.startTime) > Date.now()) {
      throw new Error(`Completed match ${requestedMatchId} is absent from both the live feed and recoverable toss records`);
    }
    const volumes = recovered.snapshot?.preMatchVolume;
    const totalMatched = ['team1', 'team2'].reduce((sum, team) =>
      sum + Number(volumes?.[team]?.back || 0) + Number(volumes?.[team]?.lay || 0), 0);
    all.push({ matchId: recovered.matchId, marketId: recovered.marketId,
      matchName: recovered.matchName, competitionName: recovered.competitionName,
      startTime: recovered.startTime, status: 'ended', inPlay: false, totalMatched });
  }
  const matches = all.filter(match => (!requestedMatchId || String(match.matchId || match.id) === requestedMatchId)
    && COMPLETED.has(String(match.status || '').toLowerCase())
    && (!requestedDay || istDay(match.startTime || match.openDate || match.marketStartTime) === requestedDay));
  const store = getDefaultStore();
  const before = await store.load();
  const beforeIds = new Set(before.records.map(record => String(record.matchId)));
  const scraper = {
    getCricketMatches: () => matches,
    getCricketSnapshot: async matchId => (await client.get('/api/cricket/snapshot', { params: { matchId } })).data,
  };
  const summary = await captureEndedMatches({ scraper, store });
  const after = await store.load();
  const created = after.records.filter(record => !beforeIds.has(String(record.matchId)));
  const byLeague = Object.fromEntries([...new Set(created.map(record => record.competitionName))].sort().map(league => [
    league, created.filter(record => record.competitionName === league).length,
  ]));
  console.log(JSON.stringify({ requestedDay, requestedMatchId, feedCompleted: matches.length, ...summary,
    created: created.length, skippedOrAlreadySaved: summary.skipped,
    byLeague, records: created.map(record => ({ matchId: record.matchId, matchName: record.matchName,
      league: record.competitionName, algorithmId: record.algorithmId, predictedWinner: record.predictedWinner,
      actualWinner: record.actualWinner, status: record.status, kickoffDayIST: istDay(record.startTime) })),
  }, null, 2));
}

main().catch(error => {
  const status = error.response?.status;
  console.error(JSON.stringify({ error: status ? `Upstream HTTP ${status}` : error.message }));
  process.exitCode = 1;
});
