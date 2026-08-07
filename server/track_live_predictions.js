/**
 * Track live in-play cricket predictions — run periodically.
 * Usage: node track_live_predictions.js
 *        node track_live_predictions.js --verify   (only verify ended)
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'https://tennisliveload.com';
const TRACK_FILE = path.join(__dirname, 'live_predictions_track.json');

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const sortT = (t) => [...(t || [])].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
const firstN = (t, n) => sortT(t).slice(0, n);
const lastN = (t, n) => sortT(t).slice(-n);
const getPreMatchOdds = (trades, n = 5) => median(firstN(trades, n).map(t => t.price));
const getLastOdds = (trades, n = 5) => median(lastN(trades, n).map(t => t.price));

function predictStart(snap) {
  const t1 = snap.teamNames[0], t2 = snap.teamNames[1];
  const mb = snap.marketSignals?.moreBettedTeam;
  const ms = snap.marketSignals?.prediction?.prediction;
  if (mb) return { pick: mb === t1 ? t2 : t1, reason: 'Fade Public Money', msDisagree: !!(ms && ms !== 'No Prediction' && ms !== mb) };
  if (ms && ms !== 'No Prediction') return { pick: ms, reason: 'Market Signals AI', msDisagree: false };
  const tr1 = snap.teams?.[t1]?.trades || [], tr2 = snap.teams?.[t2]?.trades || [];
  const o1 = getPreMatchOdds(tr1), o2 = getPreMatchOdds(tr2);
  if (o1 && o2) return { pick: o1 <= o2 ? t1 : t2, reason: 'Pre-Match Odds', msDisagree: false };
  return { pick: null, reason: 'No data', msDisagree: false };
}

function predictLive(snap) {
  const t1 = snap.teamNames[0], t2 = snap.teamNames[1];
  const tr1 = snap.teams?.[t1]?.trades || [], tr2 = snap.teams?.[t2]?.trades || [];
  const pre1 = getPreMatchOdds(tr1), pre2 = getPreMatchOdds(tr2);
  const last1 = getLastOdds(tr1, 5), last2 = getLastOdds(tr2, 5);
  if (last1 && last2 && tr1.length >= 5 && tr2.length >= 5) {
    const gap = Math.abs(last1 - last2);
    if (gap >= 0.02) return { pick: last1 <= last2 ? t1 : t2, reason: 'Last 5 Odds', last1, last2, pre1, pre2 };
  }
  if (pre1 && last1 && pre2 && last2) {
    const d1 = last1 - pre1, d2 = last2 - pre2;
    if (Math.abs(d1 - d2) > 0.03) return { pick: d1 < d2 ? t1 : t2, reason: 'Odds Momentum', last1, last2, pre1, pre2 };
  }
  if (pre1 && pre2) return { pick: pre1 <= pre2 ? t1 : t2, reason: 'Pre-Match Odds', last1, last2, pre1, pre2 };
  return { pick: null, reason: 'No data', last1, last2, pre1, pre2 };
}

function inferWinner(snap) {
  const t1 = snap.teamNames[0], t2 = snap.teamNames[1];
  const tr1 = snap.teams?.[t1]?.trades || [], tr2 = snap.teams?.[t2]?.trades || [];
  const min1 = tr1.length ? Math.min(...tr1.map(t => t.price)) : 999;
  const min2 = tr2.length ? Math.min(...tr2.map(t => t.price)) : 999;
  if (min1 <= 1.12 && min1 < min2) return t1;
  if (min2 <= 1.12 && min2 < min1) return t2;
  return min1 <= min2 ? t1 : t2;
}

function loadTrack() {
  if (!fs.existsSync(TRACK_FILE)) return { predictions: [], verified: [], history: [] };
  return JSON.parse(fs.readFileSync(TRACK_FILE, 'utf8'));
}

function saveTrack(track) {
  track.lastRun = new Date().toISOString();
  fs.writeFileSync(TRACK_FILE, JSON.stringify(track, null, 2));
}

async function captureLive(track) {
  const { data: ml } = await axios.get(`${BASE}/api/cricket/matches`, { timeout: 15000 });
  const live = (Array.isArray(ml) ? ml : []).filter(m => m.status === 'in-play');
  console.log(`\n📡 ${live.length} live matches\n`);

  for (const m of live) {
    try {
      const { data: snap } = await axios.get(`${BASE}/api/cricket/snapshot`, { params: { matchId: m.matchId }, timeout: 25000 });
      const start = predictStart(snap);
      const liveP = predictLive(snap);
      const entry = {
        matchId: m.matchId,
        matchName: m.matchName,
        competition: m.competitionName,
        updatedAt: new Date().toISOString(),
        status: 'in-play',
        moreBetted: snap.marketSignals?.moreBettedTeam,
        msPred: snap.marketSignals?.prediction?.prediction,
        bookieFav: snap.marketSignals?.bookieFavouriteOutcome,
        startPick: start.pick,
        startReason: start.reason,
        startHighConf: start.msDisagree,
        livePick: liveP.pick,
        liveReason: liveP.reason,
        agree: start.pick === liveP.pick,
        odds: { pre1: liveP.pre1, pre2: liveP.pre2, last1: liveP.last1, last2: liveP.last2 },
        teamNames: snap.teamNames,
      };

      let existing = track.predictions.find(p => p.matchId === m.matchId);
      if (!existing) {
        existing = { ...entry, firstCapturedAt: entry.updatedAt };
        track.predictions.push(existing);
      } else {
        // Keep first capture, update live fields
        Object.assign(existing, entry);
      }

      const conf = start.msDisagree ? '🔥' : (snap.marketSignals?.prediction?.prediction === snap.marketSignals?.moreBettedTeam ? '⚠️ MS=public' : '');
      const agree = start.pick === liveP.pick ? '✓' : '⚡ CONFLICT';
      console.log(`🏏 ${m.matchName}`);
      console.log(`   Public: ${entry.moreBetted || '—'} | MS: ${entry.msPred || '—'}`);
      console.log(`   START: ${start.pick} (${start.reason}) ${conf}`);
      console.log(`   LIVE:  ${liveP.pick} (${liveP.reason}) ${agree}`);
      if (liveP.pre1) console.log(`   Odds: pre ${liveP.pre1?.toFixed(2)}/${liveP.pre2?.toFixed(2)} → last ${liveP.last1?.toFixed(2)}/${liveP.last2?.toFixed(2)}`);
      console.log('');
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.log(`❌ ${m.matchName}: ${e.message}`);
    }
  }
}

async function verifyEnded(track) {
  const { data: ml } = await axios.get(`${BASE}/api/cricket/matches`, { timeout: 15000 });
  const endedIds = new Set((Array.isArray(ml) ? ml : []).filter(m => m.status === 'ended').map(m => m.matchId));

  console.log('\n' + '='.repeat(70));
  console.log('VERIFICATION — ended matches from tracker');
  console.log('='.repeat(70));

  let startC = 0, startT = 0, liveC = 0, liveT = 0;

  for (const p of track.predictions) {
    if (!endedIds.has(p.matchId)) continue;
    if (track.verified.some(v => v.matchId === p.matchId)) continue;

    try {
      const { data: snap } = await axios.get(`${BASE}/api/cricket/snapshot`, { params: { matchId: p.matchId }, timeout: 25000 });
      const actual = inferWinner(snap);
      const startOk = p.startPick === actual;
      const liveOk = p.livePick === actual;
      if (p.startPick) { startT++; if (startOk) startC++; }
      if (p.livePick) { liveT++; if (liveOk) liveC++; }

      const result = { ...p, actual, startOk, liveOk, verifiedAt: new Date().toISOString() };
      track.verified.push(result);
      console.log(`${startOk ? '✅' : '❌'} START | ${liveOk ? '✅' : '❌'} LIVE | ${p.matchName}`);
      console.log(`   Start→ ${p.startPick} | Live→ ${p.livePick} | Actual→ ${actual}`);
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.log(`ERR verify ${p.matchName}: ${e.message}`);
    }
  }

  // Summary of all verified
  if (track.verified.length) {
    const sc = track.verified.filter(v => v.startOk).length;
    const st = track.verified.length;
    const lc = track.verified.filter(v => v.liveOk).length;
    console.log('\n📊 CUMULATIVE RESULTS');
    console.log(`   START algo: ${sc}/${st} = ${(sc / st * 100).toFixed(1)}%`);
    console.log(`   LIVE algo:  ${lc}/${st} = ${(lc / st * 100).toFixed(1)}%`);
    const highConf = track.verified.filter(v => v.startHighConf);
    if (highConf.length) {
      const hc = highConf.filter(v => v.startOk).length;
      console.log(`   START high-conf (MS≠public): ${hc}/${highConf.length} = ${(hc / highConf.length * 100).toFixed(1)}%`);
    }
  } else {
    console.log('\nNo ended matches to verify yet — all tracked matches still live.');
  }
}

(async () => {
  const verifyOnly = process.argv.includes('--verify');
  const track = loadTrack();

  if (!verifyOnly) await captureLive(track);
  await verifyEnded(track);
  saveTrack(track);

  console.log(`\n💾 Saved ${TRACK_FILE}`);
  console.log(`   Tracking: ${track.predictions.length} | Verified: ${track.verified.length}`);
})();
