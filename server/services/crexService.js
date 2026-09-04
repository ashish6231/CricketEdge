/**
 * crexService.js - Real-Time CREX Cricket Integration Service
 * Scrapes live scores, ball-by-ball commentary, and live odds/sessions directly from crex.com
 * Uses in-memory caching (3-5s) to guarantee sub-millisecond responses on repeated queries.
 */

const https = require('https');

const CREX_BASE = 'https://crex.com';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let overviewCache = null;
let overviewCacheTime = 0;
const OVERVIEW_TTL = 4000; // 4 seconds

const detailCache = new Map();
const DETAIL_TTL = 2500; // 2.5 seconds

function fetchHttps(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': CREX_BASE,
        'Referer': CREX_BASE + '/',
      },
      timeout: 8000,
    }, (res) => {
      if (res.statusCode >= 400) {
        return resolve(null);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', (err) => {
      console.warn('CREX fetch error on ' + url + ':', err.message);
      resolve(null);
    });
  });
}

function parseState(html) {
  if (!html) return null;
  const stateMatch = html.match(/<script id="app-root-state"[^>]*>([\s\S]*?)<\/script>/);
  if (!stateMatch) return null;
  const unescaped = stateMatch[1]
    .replace(/&q;/g, '"')
    .replace(/&a;/g, '&')
    .replace(/&s;/g, "'")
    .replace(/&l;/g, '<')
    .replace(/&g;/g, '>');
  try {
    return JSON.parse(unescaped);
  } catch (e) {
    return null;
  }
}

function cleanText(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, '').trim();
}

/** Normalize team name tokens for fuzzy matching */
function normalizeName(str) {
  return (str || '')
    .toLowerCase()
    .replace(/women|womens|\bw\b/g, '')
    .replace(/cc|sc|rc|club|cricket|premier|league|t20|odi|matches|match|super|warriors|titans|royals|falcons|kings/g, '')
    .replace(/st\./g, 'st')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(str) {
  return normalizeName(str).split(' ').filter(w => w.length > 2);
}

function teamTokensMatch(nameA, nameB, shortB) {
  const na = normalizeName(nameA);
  const nb = normalizeName(nameB);
  const sb = (shortB || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!na || (!nb && !sb)) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  // Short abbreviation check (e.g. SKNP, SLK, TKR, HAM, DUR, ENG)
  if (sb && sb.length >= 2) {
    const naClean = nameA.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (naClean.includes(sb) || sb.includes(naClean)) return true;
    const initialChars = nameA.split(/\s+/).map(w => w[0]?.toLowerCase()).join('');
    if (initialChars && (initialChars === sb || initialChars.includes(sb))) return true;
  }

  // Common word tokens check
  const wa = words(nameA);
  const wb = words(nameB);
  if (wa.length > 0 && wb.length > 0) {
    const common = wa.filter(w => wb.includes(w));
    if (common.length >= Math.min(wa.length, wb.length, 1)) return true;
  }
  return false;
}

/**
 * Fetches all live & scheduled matches from crex.com and crex.com/schedule
 */
async function getCrexOverview(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && overviewCache && (now - overviewCacheTime < OVERVIEW_TTL)) {
    return overviewCache;
  }

  try {
    const [homeHtml, schedHtml] = await Promise.all([
      fetchHttps('https://crex.com/'),
      fetchHttps('https://crex.com/schedule'),
    ]);

    const homeState = parseState(homeHtml);
    const schedState = parseState(schedHtml);

    const matchesList = [];
    const seenSlugs = new Set();

    // 1. Process fixtures from schedule (has pre-resolved team names, scores, odds)
    const fixtures = schedState?.['https://stats.crickapi.com/fixture/getFixture'] || [];
    for (const f of fixtures) {
      const slug = f.link ? f.link.replace('/cricket-live-score/', '') : null;
      if (slug) seenSlugs.add(slug);

      let oddsObj = null;
      try {
        if (f.odds && typeof f.odds === 'string') oddsObj = JSON.parse(f.odds);
        else if (f.odds) oddsObj = f.odds;
      } catch {}

      const isLive = f.status === 1 || f.statusText?.toLowerCase() === 'live';
      const isCompleted = f.status === 2 || f.statusText?.toLowerCase() === 'completed';

      let calcRate = (oddsObj?.rate !== null && oddsObj?.rate !== undefined) ? oddsObj.rate : null;
      let calcRate2 = (oddsObj?.rate2 !== null && oddsObj?.rate2 !== undefined) ? oddsObj.rate2 : null;
      if (calcRate === null && f.global_num) {
        if (f.global_num.b !== null && f.global_num.b !== undefined) {
          const bVal = Number(f.global_num.b);
          calcRate = bVal < 2 && bVal > 1 ? Math.round((bVal - 1) * 100) : (bVal === 0 ? 0 : bVal);
        }
        if (f.global_num.l !== null && f.global_num.l !== undefined) {
          const lVal = Number(f.global_num.l);
          calcRate2 = lVal < 2 && lVal > 1 ? Math.round((lVal - 1) * 100) : lVal;
        }
      }

      matchesList.push({
        crexMatchId: f.matchFkey || f.mf || String(f.id || ''),
        slug: slug,
        url: f.link || (slug ? `/cricket-live-score/${slug}` : null),
        seriesName: f.n || f.seriesShortName || '',
        team1Name: f.team1 || '',
        team1Short: f.t1SName || '',
        team1Flag: f.flag1 || '',
        team2Name: f.team2 || '',
        team2Short: f.t2SName || '',
        team2Flag: f.flag2 || '',
        score1: f.team1Score1 ? `${f.team1Score1} (${f.team1Over1 || '0.0'})` : (f.s1 ? `${f.s1} (${f.o1 || ''})` : null),
        score2: f.team2Score1 ? `${f.team2Score1} (${f.team2Over1 || '0.0'})` : (f.s2 ? `${f.s2} (${f.o2 || ''})` : null),
        status: isLive ? 'live' : (isCompleted ? 'completed' : 'upcoming'),
        statusText: f.statusText || (isLive ? 'Live' : ''),
        venue: f.venue || '',
        format: f.fo || f.formats || '',
        startTime: f.t || null,
        odds: {
          rate: calcRate,
          rate2: calcRate2 != null ? calcRate2 : calcRate,
          rateTeam: f.global_num?.fr || f.team1 || null,
          back: f.global_num?.b ?? null,
          lay: f.global_num?.l ?? null,
        },
      });
    }

    // 2. Process home state live matches
    const liveMatches = homeState?.['https://api.goscorer.com/api/v3/getLiveMatches'] || {};
    const mapData = homeState?.['https://oc.crickapi.com/mapping/getHomeMapDatahome'] || {};

    const teamsMap = {};
    if (mapData.t) {
      for (const item of Object.values(mapData.t)) {
        if (item.f_key) teamsMap[item.f_key] = item;
      }
    }
    const seriesMap = {};
    if (mapData.s) {
      for (const item of Object.values(mapData.s)) {
        if (item.f_key) seriesMap[item.f_key] = item;
      }
    }

    const homeLinks = {};
    if (homeHtml) {
      const links = [...homeHtml.matchAll(/\/cricket-live-score\/([a-zA-Z0-9\-_]+)-([a-zA-Z0-9]+)/g)];
      for (const m of links) {
        homeLinks[m[2]] = { slug: m[1] + '-' + m[2], url: m[0] };
      }
    }

    for (const [mId, m] of Object.entries(liveMatches)) {
      const link = homeLinks[mId];
      const slug = link?.slug;
      if (slug && seenSlugs.has(slug)) continue; // already added from schedule

      const t1 = teamsMap[m.b] || { n: m.b, sn: m.b };
      const t2 = teamsMap[m.c] || { n: m.c, sn: m.c };
      const ser = seriesMap[m.e] || { n: m.e };

      const isLive = m.d === 1;
      const isCompleted = m.d === 2;

      // Extract rate from flb e.g. "^SN|4.1|1.35" or "^15R|1.01|0"
      let favoriteRate = null;
      let favoriteRate2 = null;
      let favoriteTeam = null;
      let backVal = null;
      let layVal = null;

      if (m.flb && typeof m.flb === 'string') {
        const parts = m.flb.split('|');
        const favKey = parts[0]?.replace('^', '')?.trim()?.toLowerCase();
        if (favKey) {
          const t1Key = String(m.b || '').toLowerCase();
          const t2Key = String(m.c || '').toLowerCase();
          const s1 = String(t1.sn || '').toLowerCase();
          const s2 = String(t2.sn || '').toLowerCase();
          if (t1Key === favKey || s1 === favKey) favoriteTeam = t1.n;
          else if (t2Key === favKey || s2 === favKey) favoriteTeam = t2.n;
        }
        if (parts[2] && parseFloat(parts[2]) > 0) {
          backVal = parseFloat(parts[2]);
          favoriteRate = backVal < 2 && backVal > 1 ? Math.round((backVal - 1) * 100) : (backVal === 0 ? 0 : backVal);
        } else if (parts[1] && parseFloat(parts[1]) > 0) {
          backVal = parseFloat(parts[1]);
          favoriteRate = backVal < 2 && backVal > 1 ? Math.round((backVal - 1) * 100) : (backVal === 0 ? 0 : backVal);
        }
        if (parts[1] && parseFloat(parts[1]) > 0) {
          layVal = parseFloat(parts[1]);
          favoriteRate2 = layVal < 2 && layVal > 1 ? Math.round((layVal - 1) * 100) : layVal;
        }
      }

      matchesList.push({
        crexMatchId: mId,
        slug: slug || null,
        url: link?.url || (slug ? `/cricket-live-score/${slug}` : null),
        seriesName: ser.n || '',
        team1Name: t1.n || '',
        team1Short: t1.sn || '',
        team2Name: t2.n || '',
        team2Short: t2.sn || '',
        score1: m.j ? (m.j.includes('(') ? m.j + ')' : m.j) : null,
        score2: m.k ? (m.k.includes('(') ? m.k + ')' : m.k) : null,
        status: isLive ? 'live' : (isCompleted ? 'completed' : 'upcoming'),
        statusText: m.res || (isLive ? 'Live' : ''),
        format: m.fo || '',
        startTime: m.ti || null,
        odds: {
          rate: favoriteRate,
          rate2: favoriteRate2 != null ? favoriteRate2 : favoriteRate,
          rateTeam: favoriteTeam || t1.n || null,
          back: backVal,
          lay: layVal,
        },
      });
    }

    overviewCache = matchesList;
    overviewCacheTime = now;
    return matchesList;
  } catch (err) {
    console.error('Error in getCrexOverview:', err);
    return overviewCache || [];
  }
}

/**
 * Match a local match with CREX matches
 */
function findCrexMatch(matchName, crexMatches = []) {
  if (!matchName || !Array.isArray(crexMatches) || crexMatches.length === 0) return null;

  const parts = matchName.split(/\s+v(?:s)?\.?\s+/i);
  const t1 = parts[0] || '';
  const t2 = parts[1] || '';
  if (!t1 || !t2) return null;

  for (const cm of crexMatches) {
    const direct = teamTokensMatch(t1, cm.team1Name, cm.team1Short) && teamTokensMatch(t2, cm.team2Name, cm.team2Short);
    const reverse = teamTokensMatch(t1, cm.team2Name, cm.team2Short) && teamTokensMatch(t2, cm.team1Name, cm.team1Short);

    if (direct || reverse) {
      return cm;
    }
  }

  return null;
}

/**
 * Fetches full detailed match data (scorecard, current batters/bowler, session tables, ball-by-ball commentary)
 */
async function getCrexMatchDetail(slugOrUrl) {
  if (!slugOrUrl) return null;

  const cleanSlug = slugOrUrl.startsWith('/') ? slugOrUrl : (slugOrUrl.startsWith('http') ? new URL(slugOrUrl).pathname : `/cricket-live-score/${slugOrUrl}`);
  const cacheKey = cleanSlug;
  const now = Date.now();

  if (detailCache.has(cacheKey)) {
    const entry = detailCache.get(cacheKey);
    if (now - entry.time < DETAIL_TTL) {
      return entry.data;
    }
  }

  try {
    const url = `${CREX_BASE}${cleanSlug}`;
    const html = await fetchHttps(url);
    if (!html) return detailCache.get(cacheKey)?.data || null;

    const state = parseState(html);
    if (!state) return null;

    const sv3 = state['https://api.goscorer.com/api/v3/getSV3'] || {};
    const metaKey = Object.keys(state).find(k => k.startsWith('match-'));
    const meta = metaKey ? state[metaKey] : null;

    // Commentary ball feeds
    const rawFeeds = state['https://content.crickapi.com/commentary/v1/getBallFeeds'] ||
                     state['https://content.crickapi.com/commentary/v2/getBallFeeds'] || [];

    // Format ball feeds
    const formattedFeeds = [];
    if (Array.isArray(rawFeeds)) {
      for (const f of rawFeeds) {
        if (f.type === 'b') {
          const isWicket = f.b === 'W' || f.b === 'w' || (typeof f.c1 === 'string' && f.c1.toLowerCase().includes('out'));
          const isFour = f.b === '4';
          const isSix = f.b === '6';
          formattedFeeds.push({
            id: f.id || `${f.o}-${f.b}`,
            over: f.o || (f.on !== undefined ? `${f.on}.${f.delivery || 1}` : ''),
            runs: f.b || '0',
            score: f.s || '',
            bowlerBatter: f.c1 || '',
            commentary: cleanText(f.c2 || f.c || ''),
            type: isWicket ? 'wicket' : (isFour || isSix ? 'boundary' : 'ball'),
            isWicket,
            isFour,
            isSix,
            inning: f.inning || 1,
          });
        } else if (f.type === 'w') {
          formattedFeeds.push({
            id: f.id || Math.random().toString(),
            over: f.o || '',
            runs: 'W',
            score: f.s || '',
            bowlerBatter: f.c1 || 'WICKET',
            commentary: cleanText(f.c2 || f.c || 'Wicket falls!'),
            type: 'wicket',
            isWicket: true,
            inning: f.inning || 1,
          });
        } else if (f.type === 't') {
          formattedFeeds.push({
            id: f.id || Math.random().toString(),
            over: f.on !== undefined && f.on >= 0 ? `${f.on}.0` : '',
            runs: '',
            score: '',
            bowlerBatter: '',
            commentary: cleanText(f.c || ''),
            type: 'text',
            inning: f.inning || 1,
          });
        }
      }
    }

    // Format lastovers for the ball strip
    const lastovers = [];
    if (Array.isArray(sv3.lastovers)) {
      for (const lo of sv3.lastovers) {
        lastovers.push({
          over: lo.over || '',
          balls: Array.isArray(lo.overinfo) ? lo.overinfo : [],
          totalRuns: lo.total || 0,
        });
      }
    }

    // Format batters
    const batters = [];
    if (sv3.pname1) {
      batters.push({
        name: sv3.player_full_name1 || sv3.pname1,
        runs: sv3.run1 || '0',
        balls: (sv3.ball1 || '').replace(/[()]/g, '') || '0',
        fours: sv3.four1 || '0',
        sixes: sv3.six1 || '0',
        sr: sv3.sr1 || '0.00',
        onStrike: sv3.os1 === 1,
      });
    }
    if (sv3.pname2) {
      batters.push({
        name: sv3.player_full_name2 || sv3.pname2,
        runs: sv3.run2 || '0',
        balls: (sv3.ball2 || '').replace(/[()]/g, '') || '0',
        fours: sv3.four2 || '0',
        sixes: sv3.six2 || '0',
        sr: sv3.sr2 || '0.00',
        onStrike: sv3.os2 === 1,
      });
    }

    // Format bowler
    const bowler = sv3.bname ? {
      name: sv3.bowler_full_name || sv3.bname,
      wicketsRuns: sv3.bwr || '0-0',
      overs: sv3.bover || '0.0',
      economy: sv3.beco || '0.00',
    } : null;

    // Helper to resolve favorite team from sv3.F e.g. '^2Z'
    function resolveFavTeam(favKey) {
      if (!favKey) return null;
      const cleanKey = String(favKey).replace('^', '').trim().toLowerCase();
      if (!cleanKey) return null;

      const t1Name = sv3.team1_f_n || sv3.team1 || meta?.team1?.n || '';
      const t2Name = sv3.team2_f_n || sv3.team2 || meta?.team2?.n || '';

      const f1 = String(sv3.team1flag || meta?.team1?.fkey || '').toLowerCase();
      const f2 = String(sv3.team2flag || meta?.team2?.fkey || '').toLowerCase();
      const s1 = String(sv3.team1short || meta?.team1?.sn || '').toLowerCase();
      const s2 = String(sv3.team2short || meta?.team2?.sn || '').toLowerCase();

      if (f1.includes('/' + cleanKey + '.') || f1.includes(cleanKey) || s1 === cleanKey) return t1Name;
      if (f2.includes('/' + cleanKey + '.') || f2.includes(cleanKey) || s2 === cleanKey) return t2Name;
      return null;
    }

    // Session tables
    const sessionTable = [];
    const rawSessions = sv3.session_table1 || sv3.session_table2 || [];
    if (Array.isArray(rawSessions) && rawSessions.length > 0) {
      for (const row of rawSessions) {
        if (Array.isArray(row) && row.length >= 2) {
          sessionTable.push({
            over: row[0],
            settled: row[1] || '—',
            min: row[2] || row[3] || '—',
            max: row[4] || row[3] || '—',
            current: row[2] && row[3] ? `${row[2]}-${row[3]}` : (row[1] || '—'),
          });
        }
      }
    } else if (typeof sv3.S === 'string' && sv3.S) {
      const items = sv3.S.split(',');
      for (const item of items) {
        const parts = item.split('.');
        if (parts.length >= 3) {
          sessionTable.push({
            over: parts[0],
            settled: parts[3] || parts[1] || '—',
            min: parts[2] || parts[1] || '—',
            max: parts[4] || parts[2] || '—',
            current: parts[1] && parts[2] ? `${parts[1]}-${parts[2]}` : (parts[3] || '—'),
          });
        }
      }
    }

    // Real Match Rates & Odds: sv3.R contains base+spread or base-spread (e.g. '35+64', '1+1', '0+0', '89+10')
    let matchRate1 = null;
    let matchRate2 = null;
    let backOdds = null;
    let layOdds = null;

    if (sv3.rate != null && sv3.rate !== '') {
      matchRate1 = sv3.rate;
      matchRate2 = sv3.rate2 != null && sv3.rate2 !== '' ? sv3.rate2 : sv3.rate;
    } else if (sv3.R && typeof sv3.R === 'string') {
      if (sv3.R.includes('+')) {
        const parts = sv3.R.split('+');
        const n1 = parseInt(parts[0], 10);
        const diff = parseInt(parts[1], 10);
        if (!isNaN(n1)) {
          matchRate1 = n1;
          matchRate2 = !isNaN(diff) ? (n1 + diff) : n1;
        } else {
          matchRate1 = parts[0];
          matchRate2 = parts[1];
        }
      } else if (sv3.R.includes('-')) {
        const parts = sv3.R.split('-');
        const n1 = parseInt(parts[0], 10);
        const n2 = parseInt(parts[1], 10);
        matchRate1 = !isNaN(n1) ? n1 : parts[0];
        matchRate2 = !isNaN(n2) ? n2 : parts[1];
      } else {
        const n = parseInt(sv3.R, 10);
        matchRate1 = !isNaN(n) ? n : sv3.R;
        matchRate2 = matchRate1;
      }
    }

    // Resolve favorite team from sv3.F
    const rateTeam = resolveFavTeam(sv3.F) || sv3.rt || sv3.rtShort || (meta?.team1?.n || sv3.team1_f_n || sv3.team1 || null);

    if (typeof matchRate1 === 'number' && matchRate1 > 0) {
      backOdds = (1 + matchRate1 / 100).toFixed(2);
    }
    if (typeof matchRate2 === 'number' && matchRate2 > 0) {
      layOdds = (1 + matchRate2 / 100).toFixed(2);
    }

    function isDeliveryOutcome(str) {
      if (!str || typeof str !== 'string') return false;
      const s = str.trim().toLowerCase();
      if (!s) return false;
      if (s === 'ball' || s === 'over') return true;
      if (/^([0-7]|\d+\s*runs?|four|six|single|double|triple|dot|dot\s*ball)$/i.test(s)) return true;
      if (/^(w|wicket|out|caught|caught\s*out|bowled|lbw|run\s*out|stumped|hit\s*wicket|retired\s*hurt|retired\s*out|caught\s*&\s*bowled|caught\s*and\s*bowled)$/i.test(s)) return true;
      if (/^(\d*\s*wide?s?|\d*\s*wd|\d*\s*no\s*ball?s?|\d*\s*nb|\d*\s*leg\s*byes?|\d*\s*lb|\d*\s*byes?|\d*\s*b|leg\s*bye\s*\w+|bye\s*\w+)$/i.test(s)) return true;
      return false;
    }

    // Running ball determination (e.g. 'Ball', 'Caught Out', 'Over', '4', '6', '1', '0')
    let runningBallRuns = null;
    let ballOutcomeText = null;
    const bStr = (sv3.B || '').trim();
    const aStr = (sv3.A || '').trim();

    // Check if bStr is a match completion or outcome statement rather than a live delivery outcome
    const isMatchResultStr = /(won by|won the|match drawn|match tied|no result|innings break|concluded|match over|rain delay|stumps)/i.test(bStr) || bStr.length > 25;
    const isCompletedMatch = sv3.status === 2 || isMatchResultStr || /(won by|won the|match drawn|match tied|no result)/i.test(sv3.comment1 || sv3.res || '');
    const matchStatus = isCompletedMatch ? 'completed' : (sv3.status === 1 ? 'live' : (sv3.status === 3 ? 'abandoned' : 'upcoming'));

    // Active over balls extraction: prioritize aStr, fallback to lastovers
    let currentOverBalls = [];
    if (aStr && aStr.includes('.')) {
      currentOverBalls = aStr.split('.');
    } else if (aStr && !/^over$/i.test(aStr)) {
      currentOverBalls = [aStr];
    } else if (lastovers.length > 0) {
      const curOver = lastovers[lastovers.length - 1];
      if (Array.isArray(curOver?.balls) && curOver.balls.length > 0) {
        currentOverBalls = curOver.balls;
      }
    }

    // Prioritize genuine delivery outcomes in bStr; if bStr is a toss or comment, extract ball from aStr or lastovers
    if (isDeliveryOutcome(bStr)) {
      ballOutcomeText = bStr;
      if (/^ball/i.test(bStr)) {
        runningBallRuns = 'Ball';
      } else if (/^over$/i.test(bStr)) {
        runningBallRuns = 'Over';
      } else {
        runningBallRuns = bStr;
      }
    } else if (aStr) {
      if (aStr.toLowerCase() === 'over') {
        runningBallRuns = 'Over';
        ballOutcomeText = 'Over';
      } else if (aStr.includes('.')) {
        const parts = aStr.split('.');
        const lastPart = parts[parts.length - 1] || null;
        runningBallRuns = lastPart;
        ballOutcomeText = lastPart === 'W' || lastPart === 'w' ? 'Wicket' : lastPart;
      } else {
        runningBallRuns = aStr;
        ballOutcomeText = aStr === 'W' || aStr === 'w' ? 'Wicket' : aStr;
      }
    } else if (lastovers.length > 0) {
      const curOver = lastovers[lastovers.length - 1];
      if (curOver?.balls?.length > 0) {
        const lastBall = curOver.balls[curOver.balls.length - 1];
        runningBallRuns = lastBall;
        ballOutcomeText = lastBall === 'W' || lastBall === 'w' ? 'Wicket' : lastBall;
      }
    }

    // If still not determined, fallback to latest ball in currentOverBalls
    if (!ballOutcomeText && currentOverBalls.length > 0) {
      const last = currentOverBalls[currentOverBalls.length - 1];
      runningBallRuns = last;
      ballOutcomeText = last === 'W' || last === 'w' ? 'Wicket' : last;
    }

    const isRunning = !isMatchResultStr && (/^ball/i.test(bStr) || /^ball/i.test(aStr));

    const runningBall = {
      runs: runningBallRuns || (isRunning ? 'Ball' : (isCompletedMatch ? 'Match Ended' : '0')),
      status: isMatchResultStr ? 'Match Ended' : (ballOutcomeText || (isRunning ? 'Ball' : '0')),
      outcomeText: isMatchResultStr ? (ballOutcomeText || 'Wicket') : (ballOutcomeText || runningBallRuns || (isRunning ? 'Ball' : '0')),
      isRunning,
      isCompleted: isCompletedMatch,
      matchResult: isMatchResultStr ? bStr : null,
      code: sv3.cb || '',
      over: sv3.bover || sv3.over1 || '',
      currentOverBalls,
    };

    // Status / Equation: capture toss comments or match status equations
    let statusEquation = cleanText(
      (!isDeliveryOutcome(sv3.comment1) && sv3.comment1) ||
      (!isDeliveryOutcome(sv3.B) && sv3.B) ||
      sv3.res ||
      ''
    );
    if (/^bowl:/i.test(statusEquation) || (sv3.bname && statusEquation.includes(sv3.bname))) {
      statusEquation = '';
    }

    let finalStatusText = isCompletedMatch ? (bStr || cleanText(sv3.comment1 || sv3.res || '') || 'Completed') : (matchStatus === 'live' ? 'Live' : 'Upcoming');
    if (/^bowl:/i.test(finalStatusText) || (sv3.bname && finalStatusText.includes(sv3.bname))) {
      finalStatusText = 'Live';
    }

    const resultData = {
      status: matchStatus,
      statusText: finalStatusText,
      runningBall,
      scorecard: {
        status: matchStatus,
        matchResult: isCompletedMatch ? (bStr || cleanText(sv3.comment1 || sv3.res || '')) : null,
        statusEquation,
        runningBall,
        currentOverBalls,
        target: sv3.target || null,
        crr: sv3.crr || null,
        rrr: sv3.rrr && sv3.rrr !== '--' ? sv3.rrr : null,
        team1: {
          name: sv3.team1_f_n || sv3.team1 || meta?.team1?.n || 'Team 1',
          shortName: sv3.team1short || sv3.team1 || meta?.team1?.sn || '',
          score: sv3.score1 ? `${sv3.score1} ${sv3.over1 || ''}`.trim() : null,
          runs: sv3.score1?.split('-')?.[0] || null,
          wickets: sv3.score1?.split('-')?.[1] || null,
          overs: sv3.over1 || null,
          flag: sv3.team1flag || '',
        },
        team2: {
          name: sv3.team2_f_n || sv3.team2 || meta?.team2?.n || 'Team 2',
          shortName: sv3.team2short || sv3.team2 || meta?.team2?.sn || '',
          score: sv3.score2 ? `${sv3.score2} ${sv3.over2 || ''}`.trim() : null,
          runs: sv3.score2?.split('-')?.[0] || null,
          wickets: sv3.score2?.split('-')?.[1] || null,
          overs: sv3.over2 || null,
          flag: sv3.team2flag || '',
        },
        batters,
        bowler,
        partnership: sv3.partnerruns ? {
          runs: sv3.partnerruns,
          balls: sv3.partnerballs || '0',
        } : null,
        lastovers,
        lastWicket: sv3.lwname1 ? `${sv3.lwname1} ${sv3.lwrun1 || 0} (${sv3.lwball1 || 0})` : null,
      },
      odds: {
        rate: matchRate1,
        rate2: matchRate2 != null ? matchRate2 : matchRate1,
        rateTeam,
        back: backOdds,
        lay: layOdds,
        session_overs: sv3.session_overs || null,
        session_min: sv3.s_mi || null,
        session_max: sv3.s_mx || null,
        lambi: sv3.L ? sv3.L.split('.')[1] : (sv3.lambi && sv3.lambi !== '--' ? sv3.lambi : null),
        lambi2: sv3.L ? sv3.L.split('.')[0] : (sv3.lambi2 && sv3.lambi2 !== '--' ? sv3.lambi2 : null),
        sessionTable,
      },
      ballFeeds: formattedFeeds,
    };

    detailCache.set(cacheKey, { time: now, data: resultData });
    return resultData;
  } catch (err) {
    console.error('Error in getCrexMatchDetail:', err);
    return detailCache.get(cacheKey)?.data || null;
  }
}

module.exports = {
  getCrexOverview,
  findCrexMatch,
  getCrexMatchDetail,
};
