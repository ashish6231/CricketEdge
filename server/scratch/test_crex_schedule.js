const https = require('https');

function getHttps(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  try {
    const html = await getHttps('https://crex.com/schedule');
    const stateMatch = html.match(/<script id="app-root-state"[^>]*>([\s\S]*?)<\/script>/);
    if (!stateMatch) return console.log('No state match');
    const unescaped = stateMatch[1].replace(/&q;/g, '"').replace(/&a;/g, '&').replace(/&s;/g, "'").replace(/&l;/g, '<').replace(/&g;/g, '>');
    const state = JSON.parse(unescaped);

    const fixtures = state['https://stats.crickapi.com/fixture/getFixture'] || [];
    const mapData = state['https://oc.crickapi.com/mapping/getHomeMapDatadatewise'] || {};

    const teamsMap = {};
    if (mapData.t) {
      for (const item of Object.values(mapData.t)) {
        if (item.f_key) teamsMap[item.f_key] = item;
      }
    }

    console.log('Fixtures count:', fixtures.length);
    if (fixtures.length > 0) {
      console.log('Sample fixture:', fixtures[0]);
      if (fixtures[0].b) {
        console.log('Team 1:', teamsMap[fixtures[0].b]);
        console.log('Team 2:', teamsMap[fixtures[0].c]);
      }
    }

    // Check all fixture teams
    fixtures.forEach((f, idx) => {
      const t1 = teamsMap[f.b]?.n || f.b;
      const t2 = teamsMap[f.c]?.n || f.c;
      console.log(`${idx + 1}. ${t1} vs ${t2} | status=${f.d} time=${new Date(f.ti).toISOString()}`);
    });
  } catch (err) {
    console.error(err);
  }
})();
