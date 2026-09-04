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
    const html = await fetchHttps('https://crex.com/cricket-live-score/1o6/1'); // Fetching a known route or we can fetch homepage first
    const stateMatch = html.match(/<script id="app-root-state"[^>]*>([\s\S]*?)<\/script>/);
    if (!stateMatch) return console.log('No state match');
    const unescaped = stateMatch[1].replace(/&q;/g, '"').replace(/&a;/g, '&').replace(/&s;/g, "'").replace(/&l;/g, '<').replace(/&g;/g, '>');
    const state = JSON.parse(unescaped);
    const sv3 = state['https://api.goscorer.com/api/v3/getSV3'] || {};
    const liveMatches = state['https://api.goscorer.com/api/v3/getLiveMatches'] || {};
    console.log("Found", Object.keys(liveMatches).length, "live matches");
    if(Object.keys(liveMatches).length > 0) {
      const matchId = Object.keys(liveMatches)[0];
      const matchUrl = `https://crex.com/cricket-live-score/${matchId}/1`; // try to fetch sv3 for the first match
      const mHtml = await fetchHttps(matchUrl);
      const mStateMatch = mHtml.match(/<script id="app-root-state"[^>]*>([\s\S]*?)<\/script>/);
      if (mStateMatch) {
         const mState = JSON.parse(mStateMatch[1].replace(/&q;/g, '"').replace(/&a;/g, '&').replace(/&s;/g, "'").replace(/&l;/g, '<').replace(/&g;/g, '>'));
         const mSv3 = mState['https://api.goscorer.com/api/v3/getSV3'] || {};
         console.log("SV3 Dump:", mSv3);
      }
    }
  } catch (e) { console.error(e); }
})();
