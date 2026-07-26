const axios = require('axios');

// ─── CONFIG ───
const BETTING_API = 'https://api.betfair.com/exchange/betting/json-rpc/v1';
const LOGIN_URL = 'https://identitysso.betfair.com/api/login';

// Cricket Event Type ID = 4 (Betfair mein confirmed)
const CRICKET_EVENT_TYPE_ID = 4;

// ─── SESSION STATE ───
let sessionToken = null;
let appKey = null;
let tokenExpiry = null;

// Stored credentials for auto-relogin
let _storedUsername = null;
let _storedPassword = null;

// ─── SESSION MANAGEMENT ───
function setCredentials(key, token) {
  appKey = key;
  sessionToken = token;
  tokenExpiry = Date.now() + (4 * 60 * 60 * 1000); // 4 hours default
}

function isSessionValid() {
  return appKey && sessionToken && Date.now() < tokenExpiry;
}

async function login(username, password, key) {
  try {
    const res = await axios.post(
      LOGIN_URL,
      new URLSearchParams({ username, password }),
      {
        headers: {
          'X-Application': key,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 8000
      }
    );
    const data = res.data;
    if (data.status !== 'SUCCESS' && data.loginStatus !== 'SUCCESS') {
      throw new Error(data.error || data.loginStatus || 'Betfair login failed');
    }
    appKey = key;
    sessionToken = data.token || data.sessionToken;
    tokenExpiry = Date.now() + ((data.productExpiresInSeconds || 14400) * 1000);
    _storedUsername = username;
    _storedPassword = password;
    console.log('✅ Betfair session created, expires in', Math.round((tokenExpiry - Date.now()) / 1000 / 60), 'mins');
    return { success: true, token: sessionToken };
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('❌ Betfair login error:', detail);
    throw err;
  }
}

// ─── AUTO-RELOGIN ───
async function ensureSession() {
  if (isSessionValid()) return true;

  // Try auto-relogin if we have stored credentials
  if (_storedUsername && _storedPassword && appKey) {
    console.log('🔄 Betfair session expired, auto-relogging...');
    try {
      await login(_storedUsername, _storedPassword, appKey);
      return true;
    } catch (err) {
      console.error('❌ Auto-relogin failed:', err.message);
      return false;
    }
  }

  return false;
}

// ─── API CALL HELPER (with auto-relogin) ───
async function callBetfair(method, params = {}) {
  // Ensure session is valid (auto-relogin if needed)
  const sessionOk = await ensureSession();
  if (!sessionOk) {
    throw new Error('Betfair session not valid and auto-relogin failed. Check credentials.');
  }

  try {
    const res = await axios.post(
      BETTING_API,
      { jsonrpc: '2.0', method, params, id: 1 },
      {
        headers: {
          'X-Application': appKey,
          'X-Authentication': sessionToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    // Betfair returns errors inside result sometimes
    if (res.data.error) {
      const errMsg = res.data.error.message || JSON.stringify(res.data.error);

      // Session expired mid-call → auto-relogin once and retry
      if (errMsg.includes('INVALID_SESSION_INFORMATION') || errMsg.includes('NO_SESSION') || errMsg.includes('SESSION')) {
        console.log('🔄 Betfair session invalid mid-call, attempting relogin...');
        const relogged = await ensureSession();
        if (!relogged) throw new Error('Session expired and auto-relogin failed');

        // Retry the same call once
        const retryRes = await axios.post(
          BETTING_API,
          { jsonrpc: '2.0', method, params, id: 1 },
          {
            headers: {
              'X-Application': appKey,
              'X-Authentication': sessionToken,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 10000
          }
        );
        if (retryRes.data.error) throw new Error(`Betfair API Error: ${retryRes.data.error.message}`);
        return retryRes.data.result;
      }

      throw new Error(`Betfair API Error: ${errMsg}`);
    }

    return res.data.result;
  } catch (err) {
    // Network errors or other axios errors
    if (err.response?.data?.error) {
      const errMsg = err.response.data.error.message || JSON.stringify(err.response.data.error);
      if (errMsg.includes('INVALID_SESSION_INFORMATION') || errMsg.includes('NO_SESSION')) {
        console.log('🔄 Session error on request, attempting relogin...');
        const relogged = await ensureSession();
        if (!relogged) throw new Error('Session expired and auto-relogin failed');

        // Retry once
        const retryRes = await axios.post(
          BETTING_API,
          { jsonrpc: '2.0', method, params, id: 1 },
          {
            headers: {
              'X-Application': appKey,
              'X-Authentication': sessionToken,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 10000
          }
        );
        if (retryRes.data.error) throw new Error(`Betfair API Error: ${retryRes.data.error.message}`);
        return retryRes.data.result;
      }
    }
    throw err;
  }
}

// ─── API METHODS ───

// 1. Verify event types (Cricket = 4)
async function listEventTypes() {
  return callBetfair('SportsAPING/v1.0/listEventTypes', {
    filter: {}
  });
}

// 2. Get Cricket events (matches)
async function listEvents(inPlayOnly = false) {
  const now = new Date();
  const future = new Date(now.getTime() + 24 * 60 * 60 * 1000); // next 24 hours
  return callBetfair('SportsAPING/v1.0/listEvents', {
    filter: {
      eventTypeIds: [String(CRICKET_EVENT_TYPE_ID)],
      ...(inPlayOnly
        ? { inPlayOnly: true }
        : { marketStartTime: { from: now.toISOString(), to: future.toISOString() } }
      )
    }
  });
}

// 3. Get MATCH_ODDS markets for an event
async function listMarketCatalogue(eventIds, maxResults = 10) {
  return callBetfair('SportsAPING/v1.0/listMarketCatalogue', {
    filter: {
      eventIds: eventIds.map(String),
      marketTypeCodes: ['MATCH_ODDS']
    },
    maxResults,
    marketProjection: [
      'RUNNER_DESCRIPTION',
      'RUNNER_METADATA',
      'MARKET_START_TIME',
      'MARKET_DESCRIPTION',
      'COMPETITION',
      'EVENT',
      'EVENT_TYPE'
    ]
  });
}

// 3b. Get TOSS markets for events
async function listTossMarketCatalogue(eventIds, maxResults = 200) {
  return callBetfair('SportsAPING/v1.0/listMarketCatalogue', {
    filter: {
      eventIds: eventIds.map(String),
      marketTypeCodes: ['TOSS']
    },
    maxResults,
    marketProjection: [
      'RUNNER_DESCRIPTION',
      'RUNNER_METADATA',
      'MARKET_START_TIME',
      'MARKET_DESCRIPTION',
      'COMPETITION',
      'EVENT',
      'EVENT_TYPE'
    ]
  });
}

// 4. Get live prices & volume
async function listMarketBook(marketIds) {
  const ids = Array.isArray(marketIds) ? marketIds : [marketIds];
  return callBetfair('SportsAPING/v1.0/listMarketBook', {
    marketIds: ids.map(String),
    priceProjection: {
      priceData: ['EX_BEST_OFFERS'],
      virtualise: true
    }
  });
}

// DEBUG: raw response logger — ek baar call karo, console mein poora response dekho
async function debugRawResponse() {
  try {
    const events = await listEvents(true);
    if (!events?.length) { console.log('DEBUG: No live events'); return; }
    const eventIds = events.slice(0, 1).map(e => e.event.id);

    const cat = await callBetfair('SportsAPING/v1.0/listMarketCatalogue', {
      filter: { eventIds, marketTypeCodes: ['MATCH_ODDS'] },
      maxResults: 1,
      marketProjection: ['RUNNER_DESCRIPTION','RUNNER_METADATA','MARKET_START_TIME','MARKET_DESCRIPTION','COMPETITION','EVENT','EVENT_TYPE']
    });
    console.log('\n===== RAW listMarketCatalogue =====');
    console.log(JSON.stringify(cat?.[0], null, 2));

    if (!cat?.length) return;
    const book = await callBetfair('SportsAPING/v1.0/listMarketBook', {
      marketIds: [cat[0].marketId],
      priceProjection: {
        priceData: ['EX_BEST_OFFERS', 'EX_TRADED'],
        exBestOffersOverrides: { bestPricesDepth: 10, rollupModel: 'STAKE', rollupLimit: 0 },
        virtualise: true, rolloverStakes: true
      },
      orderProjection: 'EXECUTABLE',
      matchProjection: 'ROLLED_UP_BY_PRICE'
    });
    console.log('\n===== RAW listMarketBook =====');
    console.log(JSON.stringify(book?.[0], null, 2));

    const funds = await getAccountFunds();
    console.log('\n===== RAW getAccountFunds =====');
    console.log(JSON.stringify(funds, null, 2));

    const eventsRaw = await listEvents(true);
    console.log('\n===== RAW listEvents (first) =====');
    console.log(JSON.stringify(eventsRaw?.[0], null, 2));
  } catch (err) {
    console.error('DEBUG error:', err.message);
  }
}

// 5. Get account funds
async function getAccountFunds() {
  return callBetfair('AccountAPING/v1.0/getAccountFunds');
}

// ─── DATA TRANSFORMER ───
// Betfair format → CricketEdge internal format
function transformMarketBook(marketBook, catalogue = null) {
  const mb = Array.isArray(marketBook) ? marketBook[0] : marketBook;
  if (!mb) return null;

  const cat = catalogue || {};
  const event = cat.event || {};
  const competition = cat.competition || {};

  // Determine match type from event name
  const eventName = event.name || cat.name || 'Unknown Match';
  let matchType = 'T20';
  if (eventName.toLowerCase().includes('test')) matchType = 'TEST';
  else if (eventName.toLowerCase().includes('odi') || eventName.toLowerCase().includes('one day')) matchType = 'ODI';
  else if (eventName.toLowerCase().includes('t10')) matchType = 'T10';

  // Transform runners
  const totalMarketMatched = mb.totalMatched || mb.totalAvailable || 0;
  // First pass: get raw ladder data per runner
  const rawRunners = (mb.runners || []).map(r => {
    const runnerDesc = (cat.runners || []).find(rd => rd.selectionId === r.selectionId);
    const runnerName = runnerDesc?.runnerName || `Selection ${r.selectionId}`;
    const ltp = r.lastPriceTraded || 0;
    const backLadder = (r.ex?.availableToBack || []).filter(l => l.price <= 100);
    const layLadder  = (r.ex?.availableToLay  || []).filter(l => l.price <= 100);
    const tradedVols = (r.ex?.tradedVolume || []).filter(l => l.price <= 100);
    const availBack = backLadder.reduce((s, l) => s + (l.size || 0), 0);
    const availLay  = layLadder.reduce((s, l) => s + (l.size || 0), 0);
    const tradedSum = tradedVols.reduce((s, t) => s + t.size, 0);
    return { r, runnerName, ltp, backLadder, layLadder, tradedVols, availBack, availLay, tradedSum };
  });

  const runners = rawRunners.map(({ r, runnerName, ltp, backLadder, layLadder, tradedVols, availBack, availLay, tradedSum }) => {
    const matchedVolume = r.totalMatched || tradedSum || 0;
    return {
      selectionId: r.selectionId,
      runnerName,
      handicap: r.handicap || 0,
      status: r.status || 'ACTIVE',
      lastPriceTraded: ltp,
      totalMatched: Math.round(matchedVolume),
      ex: {
        availableToBack: backLadder.map(l => ({ price: l.price, size: Math.round(l.size || 0) })),
        availableToLay:  layLadder.map(l =>  ({ price: l.price, size: Math.round(l.size || 0) })),
        tradedVolume:    tradedVols.map(l => ({ price: l.price, size: Math.round(l.size || 0) }))
      },
      // NOTE: ye matched back/lay split NAHI hai — matched hamesha equal hota hai dono side.
      // Ye current unmatched liquidity hai, sab price levels ka sum.
      volume: {
        back:  Math.round(availBack),    // sum of size across all availableToBack levels
        lay:   Math.round(availLay),     // sum of size across all availableToLay levels
        total: Math.round(matchedVolume) // actual matched total (0 agar delayed key hai)
      },
      moneyFlow: { last5min: 0, last15min: 0, last1hour: 0 },
      priceHistory: []
    };
  });

  // Calculate overround
  const overround = runners.reduce((sum, r) => {
    const price = r.lastPriceTraded || r.ex?.availableToBack?.[0]?.price || 1;
    return sum + (price > 1 ? 1 / price : 0);
  }, 0);

  return {
    // Betfair exact fields
    marketId: mb.marketId,
    matchId: mb.marketId.replace(/\./g, '_'),
    eventName,
    tournament: competition.name || 'International',
    matchType,
    status: mb.status === 'CLOSED' ? 'COMPLETED' :
            mb.status === 'SUSPENDED' ? 'DELAYED' :
            mb.status === 'OPEN' ? (
              (mb.runners || []).some(r => r.status === 'WINNER') ? 'COMPLETED' :
              mb.inplay ? 'LIVE' : 'UPCOMING'
            ) : 'UPCOMING',
    inplay: mb.inplay || false,
    isMarketDataDelayed: mb.isMarketDataDelayed || false,
    betDelay: mb.betDelay || 0,
    bspReconciled: mb.bspReconciled || false,
    complete: mb.complete || true,
    numberOfWinners: mb.numberOfWinners || 1,
    numberOfRunners: mb.numberOfRunners || runners.length,
    numberOfActiveRunners: mb.numberOfActiveRunners || runners.filter(r => r.status === 'ACTIVE').length,
    totalMatched: mb.totalMatched || mb.totalAvailable || 0,
    openDate: cat.marketStartTime || new Date().toISOString(),
    overround: Number(overround.toFixed(3)),
    runners,
    score: {
      team1: 'Yet to bat',
      team2: 'Yet to bat',
      overs: '0.0',
      runRate: 0,
      requiredRunRate: 0
    },
    lastUpdated: new Date().toISOString(),
    // Metadata
    metadata: {
      source: 'betfair',
      betfairEventId: String(event.id || ''),
      betfairMarketId: mb.marketId
    }
  };
}

// ─── BATCH FETCH: Get all live cricket matches with prices ───
async function fetchLiveCricketMatches() {
  const events = await listEvents(true);
  if (!events || events.length === 0) return [];

  const eventIds = events.map(e => e.event.id);
  const catalogues = await listMarketCatalogue(eventIds, 50);
  if (!catalogues || catalogues.length === 0) return [];

  const marketIds = catalogues.map(c => c.marketId);
  const marketBooks = await listMarketBook(marketIds);
  if (!marketBooks || marketBooks.length === 0) return [];

  const matches = [];
  for (const mb of marketBooks) {
    const cat = catalogues.find(c => c.marketId === mb.marketId);
    const transformed = transformMarketBook(mb, cat);
    if (!transformed) continue;
    const r0 = transformed.runners[0];
    const backPrice = r0?.ex?.availableToBack?.[0]?.price;
    const layPrice = r0?.ex?.availableToLay?.[0]?.price;
    if (backPrice && layPrice && (layPrice - backPrice) / backPrice > 0.5) continue;
    if ((transformed.totalMatched || 0) < 100) continue;
matches.push(transformed);
  }
  return matches;
}

// ─── BATCH FETCH: Get all toss markets ───
async function fetchTossMarkets() {
  // Fetch inplay + upcoming events
  const [inplayEvents, upcomingEvents] = await Promise.all([
    listEvents(true).catch(() => []),
    listEvents(false).catch(() => [])
  ]);

  // Merge unique events
  const allEvents = [...inplayEvents];
  for (const e of upcomingEvents) {
    if (!allEvents.find(x => x.event.id === e.event.id)) allEvents.push(e);
  }
  if (!allEvents.length) return [];

  const eventIds = allEvents.map(e => e.event.id);
  const catalogues = await listTossMarketCatalogue(eventIds, 200);
  if (!catalogues || catalogues.length === 0) return [];

  const marketIds = catalogues.map(c => c.marketId);
  const marketBooks = await listMarketBook(marketIds);
  if (!marketBooks || marketBooks.length === 0) return [];

  const tossMarkets = [];
  for (const mb of marketBooks) {
    const cat = catalogues.find(c => c.marketId === mb.marketId);
    const transformed = transformMarketBook(mb, cat);
    if (transformed) {
      transformed.marketCategory = 'TOSS';
      // CLOSED market = toss already happened
      if (mb.status === 'CLOSED') transformed.status = 'COMPLETED';
      tossMarkets.push(transformed);
    }
  }
  return tossMarkets;
}

// ─── EXPORTS ───
module.exports = {
  // Session
  login,
  setCredentials,
  isSessionValid,
  ensureSession,

  // Raw API
  listEventTypes,
  listEvents,
  listMarketCatalogue,
  listTossMarketCatalogue,
  listMarketBook,
  getAccountFunds,

  // High-level
  fetchLiveCricketMatches,
  fetchTossMarkets,
  transformMarketBook,
  debugRawResponse,

  // Constants
  CRICKET_EVENT_TYPE_ID
};
