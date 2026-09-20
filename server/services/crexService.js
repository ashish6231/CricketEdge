/**
 * crexService.js - Real-Time CREX Cricket Integration Service
 * Scrapes live scores, ball-by-ball commentary, and live odds/sessions directly from crex.com
 * Uses in-memory caching (3-5s) to guarantee sub-millisecond responses on repeated queries.
 */

const https = require('https');
const zlib = require('zlib');

const CREX_BASE = 'https://crex.com';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 8000,
});

let overviewCache = null;
let overviewCacheTime = 0;
const OVERVIEW_TTL = 1000; // 1 second — live score needs to be fresh

let schedStateCache = null;
let schedCacheTime = 0;
const SCHEDULE_TTL = 60000; // 60 seconds (fixtures don't change every second)

const detailCache = new Map();
const DETAIL_TTL = 1000; // 1 second — live score needs to be fresh

const _inFlightDetail = new Map();
const matchTossCache = new Map();

function fetchHttps(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      agent: httpsAgent,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Origin': CREX_BASE,
        'Referer': CREX_BASE + '/',
      },
      timeout: 5000,
    }, (res) => {
      if (res.statusCode >= 400) return resolve(null);
      let stream = res;
      const enc = res.headers['content-encoding'];
      if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());

      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function parseState(html) {
  if (!html) return null;
  const marker = '<script id="app-root-state"';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const tagEnd = html.indexOf('>', start + marker.length);
  if (tagEnd === -1) return null;
  const close = html.indexOf('</script>', tagEnd);
  if (close === -1) return null;
  const raw = html.slice(tagEnd + 1, close)
    .replace(/&q;/g, '"')
    .replace(/&a;/g, '&')
    .replace(/&s;/g, "'")
    .replace(/&l;/g, '<')
    .replace(/&g;/g, '>');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function cleanText(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, '').trim();
}

/** Extract toss statement (e.g. "ZIM opt to Bat", "RNO opt to Bowl", "won the toss and elected to bat") */
function extractTossString(str) {
  if (!str || typeof str !== 'string') return null;
  const cleaned = cleanText(str);
  if (!cleaned) return null;
  const m = cleaned.match(/([a-zA-Z0-9\s\-]{2,35}?\s+(?:opt(?:ed)?|chose|elected)\s+to\s+(?:bat|bowl|field)|[a-zA-Z0-9\s\-]{2,35}?\s+won\s+(?:the\s+)?toss[^\.\,\n\<]{0,50})/i);
  return m ? m[0].trim() : null;
}

/** Normalize team name tokens for fuzzy matching */
function normalizeName(str) {
  const cleaned = (str || '')
    .toLowerCase()
    .replace(/\b(women|womens|w)\b/g, '')
    .replace(/\b(cc|sc|rc|club|cricket|premier|league|t20|odi|matches|match|super|warriors|titans|royals|falcons|kings)\b/g, '')
    .replace(/st\./g, 'st')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : (str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
}

function words(str) {
  return normalizeName(str).split(' ').filter(w => w.length > 2);
}

function getTeamCategory(name, short) {
  const n = (name || '').trim();
  const s = (short || '').trim();
  const combined = `${n} ${s}`.toLowerCase();
  const isWomen = /\b(women|womens|woman|ladies)\b/i.test(combined) ||
                  /\b[a-z0-9]{2,5}[-_]?w\b/i.test(s) ||
                  /\b[a-z0-9]+w[-_][a-z0-9]+\b/i.test(s) ||
                  /\b[a-z0-9]+\s+w\b/i.test(n);
  const isU19 = /\b(u[-_]?19|under[-_ ]?19)\b/i.test(combined);
  const isU23 = /\b(u[-_]?23|under[-_ ]?23)\b/i.test(combined);
  const isATeam = /\b(team\s*a)\b/i.test(combined) ||
                  /\b[a-z0-9]{2,5}[-_]a\b/i.test(s) ||
                  /\b[a-z0-9]+a[-_][a-z0-9]+\b/i.test(s) ||
                  /\b[a-z0-9]+\s+a(\s+|$)/i.test(n);
  return { isWomen, isU19, isU23, isATeam };
}

function categoriesCompatible(catA, catB) {
  if (catA.isWomen !== catB.isWomen) return false;
  if (catA.isU19 !== catB.isU19) return false;
  if (catA.isU23 !== catB.isU23) return false;
  if (catA.isATeam !== catB.isATeam) return false;
  return true;
}

function teamTokensMatch(nameA, nameB, shortB) {
  const catA = getTeamCategory(nameA, '');
  const catB = getTeamCategory(nameB, shortB);
  if (!categoriesCompatible(catA, catB)) return false;

  const na = normalizeName(nameA);
  const nb = normalizeName(nameB);
  const sb = (shortB || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!na || (!nb && !sb)) return false;
  if (na === nb) return true;

  // Substring match only if meaningful length (>= 3 chars)
  if (na.length >= 3 && nb.length >= 3) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }

  // Short abbreviation check (e.g. SKNP, SLK, TKR, HAM, DUR, ENG)
  if (sb && sb.length >= 2) {
    const naClean = nameA.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (naClean === sb) return true;
    const initialChars = nameA.split(/[\s-]+/).map(w => w[0]?.toLowerCase()).join('');
    if (initialChars && (initialChars === sb || initialChars.startsWith(sb))) return true;
  }

  // Common word tokens check
  const wa = words(nameA);
  const wb = words(nameB);
  if (wa.length > 0 && wb.length > 0) {
    const common = wa.filter(w => wb.includes(w));
    if (common.length >= Math.min(wa.length, wb.length) && common.some(w => w.length >= 4)) return true;
    if (common.length >= 2) return true;
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
    const needSched = !schedStateCache || (now - schedCacheTime >= SCHEDULE_TTL);
    let homeHtml = null;
    let schedHtml = null;

    if (needSched) {
      const res = await Promise.all([
        fetchHttps('https://crex.com/'),
        fetchHttps('https://crex.com/schedule'),
      ]);
      homeHtml = res[0];
      schedHtml = res[1];
    } else {
      homeHtml = await fetchHttps('https://crex.com/');
    }

    const homeState = parseState(homeHtml);
    if (schedHtml) {
      const parsedSched = parseState(schedHtml);
      if (parsedSched) {
        schedStateCache = parsedSched;
        schedCacheTime = now;
      }
    }
    const schedState = schedStateCache;

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
        startTime: (() => {
          if (typeof m.ti === 'number' && !isNaN(m.ti)) return m.ti < 10000000000 ? m.ti * 1000 : m.ti;
          if (typeof m.ti === 'string') {
            const trimmed = m.ti.trim();
            if (/^\d{10,13}$/.test(trimmed)) {
              const num = Number(trimmed);
              return num < 10000000000 ? num * 1000 : num;
            }
            const parsed = Date.parse(trimmed);
            if (!isNaN(parsed)) return parsed;
            if (/m\s*:\s*\d+s/i.test(trimmed) || isLive || isCompleted) return Date.now();
          }
          return m.ti || null;
        })(),
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
 * Parse any date/time representation into an epoch millisecond timestamp
 */
function parseMatchTimestamp(timeVal) {
  if (timeVal == null || timeVal === '') return null;
  if (typeof timeVal === 'number' && !isNaN(timeVal)) {
    return timeVal < 10000000000 ? timeVal * 1000 : timeVal;
  }
  if (typeof timeVal === 'string') {
    const trimmed = timeVal.trim();
    if (/^\d{10,13}$/.test(trimmed)) {
      const num = Number(trimmed);
      return num < 10000000000 ? num * 1000 : num;
    }
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) return parsed;
    // In CREX live matches, countdown string like "0-10m : 0-29s" means it is happening today (now)
    if (/m\s*:\s*\d+s/i.test(trimmed) || /live/i.test(trimmed)) {
      return Date.now();
    }
  }
  if (timeVal instanceof Date && !isNaN(timeVal.getTime())) {
    return timeVal.getTime();
  }
  return null;
}

/**
 * Check if two timestamps fall on the same calendar day in UTC or IST (+5:30)
 */
function isSameCalendarDay(ts1, ts2) {
  if (!ts1 || !ts2) return false;
  // Check UTC date
  const d1UTC = new Date(ts1).toISOString().slice(0, 10);
  const d2UTC = new Date(ts2).toISOString().slice(0, 10);
  if (d1UTC === d2UTC) return true;

  // Check IST date (UTC + 5:30)
  const d1IST = new Date(ts1 + 19800000).toISOString().slice(0, 10);
  const d2IST = new Date(ts2 + 19800000).toISOString().slice(0, 10);
  if (d1IST === d2IST) return true;

  // Within 18 hours difference
  return Math.abs(ts1 - ts2) <= 18 * 3600 * 1000;
}

/**
 * Match a local match with CREX matches on the basis of Team Names AND Match Date/Time
 * options can be:
 *   - Object: { startTime, openDate, marketStartTime, matchDate, status, inPlay }
 *   - Or a direct timestamp/date value
 */
function findCrexMatch(matchName, crexMatches = [], options = null) {
  if (!matchName || !Array.isArray(crexMatches) || crexMatches.length === 0) return null;

  const parts = matchName.split(/\s+v(?:s)?\.?\s+/i);
  const t1 = parts[0] || '';
  const t2 = parts[1] || '';
  if (!t1 || !t2) return null;

  // Parse target options
  let targetStartTime = null;
  let targetStatus = null;
  let targetInPlay = false;

  if (options && typeof options === 'object' && !(options instanceof Date)) {
    targetStartTime = options.startTime || options.openDate || options.marketStartTime || options.matchDate || null;
    targetStatus = options.status || null;
    targetInPlay = Boolean(options.inPlay);
  } else if (options != null) {
    targetStartTime = options;
  }

  const parsedTargetTime = parseMatchTimestamp(targetStartTime);

  // 1. Gather all candidates matching both team tokens
  const candidates = [];
  for (const cm of crexMatches) {
    const direct = teamTokensMatch(t1, cm.team1Name, cm.team1Short) && teamTokensMatch(t2, cm.team2Name, cm.team2Short);
    const reverse = teamTokensMatch(t1, cm.team2Name, cm.team2Short) && teamTokensMatch(t2, cm.team1Name, cm.team1Short);

    if (direct) {
      candidates.push({
        rawMatch: cm,
        isReversed: false,
        formatted: {
          ...cm,
          isReversed: false,
        },
      });
    } else if (reverse) {
      candidates.push({
        rawMatch: cm,
        isReversed: true,
        formatted: {
          ...cm,
          isReversed: true,
          team1Name: cm.team2Name,
          team1Short: cm.team2Short,
          team1Flag: cm.team2Flag,
          team2Name: cm.team1Name,
          team2Short: cm.team1Short,
          team2Flag: cm.team1Flag,
          score1: cm.score2,
          score2: cm.score1,
          _rawCrex: {
            team1Name: cm.team1Name,
            team1Short: cm.team1Short,
            team1Flag: cm.team1Flag,
            team2Name: cm.team2Name,
            team2Short: cm.team2Short,
            team2Flag: cm.team2Flag,
            score1: cm.score1,
            score2: cm.score2,
          },
        },
      });
    }
  }

  if (candidates.length === 0) return null;

  // 2. If target start time is known:
  if (parsedTargetTime != null) {
    // Filter out candidates that are clearly on a DIFFERENT match date (> 30 hours apart and not same calendar day)
    const MAX_TIME_DIFF_MS = 30 * 3600 * 1000; // 30 hours

    const scored = [];
    for (const cand of candidates) {
      const candTime = parseMatchTimestamp(cand.rawMatch.startTime);
      let diffMs = Infinity;
      let sameDay = false;

      if (candTime != null) {
        diffMs = Math.abs(candTime - parsedTargetTime);
        sameDay = isSameCalendarDay(candTime, parsedTargetTime);
      }

      // If diff is greater than 30 hours and NOT on the same calendar day, this candidate is from another date!
      // (e.g. 2 Sep match when target is 4 Sep match, which is 48h apart)
      if (candTime != null && diffMs > MAX_TIME_DIFF_MS && !sameDay) {
        continue; // Discard candidate from different date
      }

      // Compute ranking score (lower is better)
      let score = diffMs !== Infinity ? diffMs / (60 * 1000) : 10000; // minutes difference
      if (sameDay) {
        score -= 50000; // High bonus for same calendar day
      }

      // Status alignment bonuses
      const candStatus = (cand.rawMatch.status || '').toLowerCase();
      const isTargetLive = targetInPlay || (targetStatus && targetStatus.toLowerCase() === 'live');
      const isTargetCompleted = targetStatus && (targetStatus.toLowerCase() === 'ended' || targetStatus.toLowerCase() === 'completed' || targetStatus.toLowerCase() === 'verified');

      if (isTargetLive) {
        if (candStatus === 'live') score -= 20000;
        else if (candStatus === 'completed') score += 50000;
      } else if (isTargetCompleted) {
        if (candStatus === 'completed') score -= 20000;
        else if (candStatus === 'live') score += 50000;
      }

      scored.push({ cand, score });
    }

    if (scored.length > 0) {
      scored.sort((a, b) => a.score - b.score);
      return scored[0].cand.formatted;
    }

    // If all candidates were discarded because they belong to completely different dates
    // (e.g. 2 Sep match exists, but target is 4 Sep match which hasn't been listed yet in Crex),
    // return null so we don't display the wrong match!
    return null;
  }

  // 3. If target start time is NOT provided (fallback mode):
  if (candidates.length === 1) {
    return candidates[0].formatted;
  }

  // Multiple candidates and no target start time: score by status & recency to now
  const now = Date.now();
  const scored = candidates.map(cand => {
    let score = 0;
    const candTime = parseMatchTimestamp(cand.rawMatch.startTime);
    if (candTime != null) {
      score += Math.abs(candTime - now) / (60 * 1000);
    }
    const candStatus = (cand.rawMatch.status || '').toLowerCase();
    const isTargetLive = targetInPlay || (targetStatus && targetStatus.toLowerCase() === 'live');
    if (isTargetLive && candStatus === 'live') score -= 100000;
    return { cand, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0].cand.formatted;
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

  if (_inFlightDetail.has(cacheKey)) {
    return _inFlightDetail.get(cacheKey);
  }

  const promise = (async () => {
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

    // ── Persistent Toss Extraction ──
    const t1Norm = normalizeName(sv3.team1_f_n || sv3.team1 || meta?.team1?.n || '');
    const t2Norm = normalizeName(sv3.team2_f_n || sv3.team2 || meta?.team2?.n || '');
    const matchKey1 = (t1Norm && t2Norm) ? `${t1Norm}_vs_${t2Norm}` : null;
    const matchKey2 = (t1Norm && t2Norm) ? `${t2Norm}_vs_${t1Norm}` : null;

    let extractedToss = extractTossString(statusEquation) ||
      extractTossString(sv3.comment1) ||
      extractTossString(sv3.B) ||
      extractTossString(sv3.res) ||
      extractTossString(sv3.comment2) ||
      extractTossString(html);

    if (extractedToss) {
      matchTossCache.set(cacheKey, extractedToss);
      matchTossCache.set(cleanSlug, extractedToss);
      if (matchKey1) matchTossCache.set(matchKey1, extractedToss);
      if (matchKey2) matchTossCache.set(matchKey2, extractedToss);
    }

    const finalTossText = extractedToss ||
      matchTossCache.get(cacheKey) ||
      matchTossCache.get(cleanSlug) ||
      (matchKey1 ? matchTossCache.get(matchKey1) : null) ||
      (matchKey2 ? matchTossCache.get(matchKey2) : null) ||
      null;

    let finalStatusText = isCompletedMatch ? (bStr || cleanText(sv3.comment1 || sv3.res || '') || 'Completed') : (matchStatus === 'live' ? 'Live' : 'Upcoming');
    if (/^bowl:/i.test(finalStatusText) || (sv3.bname && finalStatusText.includes(sv3.bname))) {
      finalStatusText = 'Live';
    }

    const resultData = {
      status: matchStatus,
      statusText: finalStatusText,
      runningBall,
      tossText: finalTossText,
      scorecard: {
        status: matchStatus,
        matchResult: isCompletedMatch ? (bStr || cleanText(sv3.comment1 || sv3.res || '')) : null,
        statusEquation,
        tossText: finalTossText,
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
  } finally {
    _inFlightDetail.delete(cacheKey);
  }
  })();

  _inFlightDetail.set(cacheKey, promise);
  return promise;
}

module.exports = {
  getCrexOverview,
  findCrexMatch,
  getCrexMatchDetail,
  teamTokensMatch,
  extractTossString,
};
