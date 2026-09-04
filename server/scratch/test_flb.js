const https = require('https');
function fetchHttps(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}
(async () => {
  try {
    const html = await fetchHttps('https://crex.com/');
    const stateMatch = html.match(/<script id="app-root-state"[^>]*>([\s\S]*?)<\/script>/);
    if (!stateMatch) return console.log('No state match');
    const unescaped = stateMatch[1].replace(/&q;/g, '"').replace(/&a;/g, '&').replace(/&s;/g, "'").replace(/&l;/g, '<').replace(/&g;/g, '>');
    const state = JSON.parse(unescaped);
    const liveMatches = state['https://api.goscorer.com/api/v3/getLiveMatches'] || {};
    for (const [id, m] of Object.entries(liveMatches)) {
       console.log(`[${id}] flb: ${m.flb} | res: ${m.res} | comment1: ${m.comment1} | c: ${m.c} | b: ${m.b}`);
    }
  } catch (e) { console.error(e); }
})();
