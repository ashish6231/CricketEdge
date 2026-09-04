const https = require('https');
const http = require('http');

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

function getHttp(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/women|womens|\bw\b/g, '')
    .replace(/cc|sc|rc|t20|premier|league|matches|match/g, '')
    .replace(/st\./g, 'st')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(str) {
  return normalize(str).split(' ').filter(w => w.length > 2);
}

function matchesTeam(name1, name2, short2) {
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  const s2 = normalize(short2);
  if (!n1 || (!n2 && !s2)) return false;
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  if (s2 && (n1 === s2 || n1.startsWith(s2) || n1.endsWith(s2))) return true;

  const w1 = words(name1);
  const w2 = words(name2);
  if (w1.length > 0 && w2.length > 0) {
    const common = w1.filter(w => w2.includes(w));
    if (common.length >= Math.min(w1.length, w2.length, 2)) return true;
    if (w1.length === 1 && w2.includes(w1[0])) return true;
    if (w2.length === 1 && w1.includes(w2[0])) return true;
  }
  return false;
}

(async () => {
  try {
    const html = await getHttps('https://crex.com/');
    const stateMatch = html.match(/<script id="app-root-state"[^>]*>([\s\S]*?)<\/script>/);
    if (!stateMatch) return console.log('No state match');
    const unescaped = stateMatch[1].replace(/&q;/g, '"').replace(/&a;/g, '&').replace(/&s;/g, "'").replace(/&l;/g, '<').replace(/&g;/g, '>');
    const state = JSON.parse(unescaped);

    const liveMatches = state['https://api.goscorer.com/api/v3/getLiveMatches'] || {};
    const mapData = state['https://oc.crickapi.com/mapping/getHomeMapDatahome'] || {};

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

    const matchLinks = {};
    const links = [...html.matchAll(/\/cricket-live-score\/([a-zA-Z0-9\-_]+)-([a-zA-Z0-9]+)/g)];
    for (const m of links) {
      const slug = m[1];
      const matchId = m[2];
      matchLinks[matchId] = { slug, url: m[0] };
    }

    const crexParsed = [];
    for (const [id, m] of Object.entries(liveMatches)) {
      const t1 = teamsMap[m.b] || { n: m.b, sn: m.b };
      const t2 = teamsMap[m.c] || { n: m.c, sn: m.c };
      const ser = seriesMap[m.e] || { n: m.e };
      const link = matchLinks[id];

      crexParsed.push({
        crexMatchId: id,
        slug: link?.slug || null,
        url: link?.url || null,
        team1Name: t1.n,
        team1Short: t1.sn,
        team2Name: t2.n,
        team2Short: t2.sn,
        score1: m.j,
        score2: m.k,
        status: m.d === 1 ? 'live' : (m.d === 2 ? 'completed' : 'upcoming'),
        seriesName: ser.n,
        result: m.res,
        oddsFlb: m.flb,
        format: m.fo,
        startTime: m.ti
      });
    }

    console.log('CREX matches parsed:', crexParsed.length);

    const local = await getHttp('http://localhost:5000/api/cricket/matches');
    const localMatches = local?.matches || [];
    console.log('Local matches to match:', localMatches.length);

    let matchedCount = 0;
    for (const lm of localMatches) {
      const parts = (lm.matchName || '').split(' v ');
      const lmT1 = parts[0] || '';
      const lmT2 = parts[1] || '';

      const found = crexParsed.find(cm => {
        const direct = matchesTeam(lmT1, cm.team1Name, cm.team1Short) && matchesTeam(lmT2, cm.team2Name, cm.team2Short);
        const reverse = matchesTeam(lmT1, cm.team2Name, cm.team2Short) && matchesTeam(lmT2, cm.team1Name, cm.team1Short);
        return direct || reverse;
      });

      if (found) {
        matchedCount++;
        console.log(`[OK] [${lm.matchId}] "${lm.matchName}" => "${found.team1Name} vs ${found.team2Name}" (${found.status}) | S1: ${found.score1 || '-'} S2: ${found.score2 || '-'}`);
      }
    }
    console.log(`Total matched: ${matchedCount} / ${localMatches.length}`);
  } catch (err) {
    console.error(err);
  }
})();
