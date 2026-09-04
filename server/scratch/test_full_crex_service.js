const https = require('https');

function fetchHttps(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
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

async function test() {
  console.log('1. Fetching https://crex.com/ ...');
  const t0 = Date.now();
  const homeHtml = await fetchHttps('https://crex.com/');
  console.log('Fetched home in', Date.now() - t0, 'ms');
  const homeState = parseState(homeHtml);

  console.log('2. Fetching https://crex.com/schedule ...');
  const t1 = Date.now();
  const scheduleHtml = await fetchHttps('https://crex.com/schedule');
  console.log('Fetched schedule in', Date.now() - t1, 'ms');
  const schedState = parseState(scheduleHtml);

  const liveMatches = homeState?.['https://api.goscorer.com/api/v3/getLiveMatches'] || {};
  const mapData = homeState?.['https://oc.crickapi.com/mapping/getHomeMapDatahome'] || {};
  const fixtures = schedState?.['https://stats.crickapi.com/fixture/getFixture'] || [];

  console.log('Live matches keys:', Object.keys(liveMatches).length);
  console.log('Schedule fixtures:', fixtures.length);

  // Pick an active match URL from fixtures or home
  const targetFixture = fixtures.find(f => f.status === 1) || fixtures[0];
  console.log('Testing detail for fixture:', targetFixture.team1, 'vs', targetFixture.team2, 'link:', targetFixture.link);

  if (targetFixture?.link) {
    const t2 = Date.now();
    const detailHtml = await fetchHttps('https://crex.com' + targetFixture.link);
    console.log('Fetched detail in', Date.now() - t2, 'ms');
    const detailState = parseState(detailHtml);

    const sv3 = detailState?.['https://api.goscorer.com/api/v3/getSV3'];
    const ballFeeds = detailState?.['https://content.crickapi.com/commentary/v2/getBallFeeds'] ||
                      detailState?.['https://content.crickapi.com/commentary/v1/getBallFeeds'] || [];

    console.log('\n--- SV3 Scorecard & Odds ---');
    console.log({
      status: sv3?.status,
      team1: sv3?.team1_f_n || sv3?.team1,
      score1: sv3?.score1,
      over1: sv3?.over1,
      team2: sv3?.team2_f_n || sv3?.team2,
      score2: sv3?.score2,
      over2: sv3?.over2,
      target: sv3?.target,
      crr: sv3?.crr,
      rrr: sv3?.rrr,
      rate: sv3?.rate || sv3?.L,
      rate2: sv3?.rate2,
      rateTeam: sv3?.rt,
      session_table: sv3?.session_table1?.length || 0,
      batsman1: sv3?.pname1,
      batsman2: sv3?.pname2,
      bowler: sv3?.bname,
      lastovers: sv3?.lastovers?.length || 0
    });

    console.log('\n--- BallFeeds count:', ballFeeds.length, '---');
    if (ballFeeds.length > 0) {
      console.log('Top ballFeed:', ballFeeds[0]);
    }
  }
}

test().catch(console.error);
