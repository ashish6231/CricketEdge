const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseState,
  getStateValue,
  findCrexMatch,
} = require('../services/crexService');
const { overviewFingerprint } = require('../services/scraper-crex');

test('CREX state parser accepts encoded state and versioned endpoint keys', () => {
  const html = [
    '<html><script id="app-root-state" type="application/json">',
    '{&q;https://api.goscorer.com/api/v3/getSV3?matchId=abc&q;:',
    '{&q;team1_f_n&q;:&q;India&q;,&q;score1&q;:&q;123-4&q;}}',
    '</script></html>',
  ].join('');

  const state = parseState(html);
  const sv3 = getStateValue(
    state,
    'https://api.goscorer.com/api/v3/getSV3',
    '/api/v3/getSV3',
  );

  assert.equal(sv3.team1_f_n, 'India');
  assert.equal(sv3.score1, '123-4');
});

test('CREX matching keeps women and mens fixtures separate', () => {
  const matches = [
    {
      crexMatchId: 'mens',
      team1Name: 'West Indies',
      team1Short: 'WI',
      team2Name: 'Zimbabwe',
      team2Short: 'ZIM',
      status: 'live',
    },
    {
      crexMatchId: 'womens',
      team1Name: 'West Indies Women',
      team1Short: 'WI-W',
      team2Name: 'Zimbabwe Women',
      team2Short: 'ZIM-W',
      status: 'live',
    },
  ];

  const result = findCrexMatch('West Indies Women v Zimbabwe Women', matches, { inPlay: true });
  assert.equal(result.crexMatchId, 'womens');
});

test('live overview dedupe ignores synthetic clock drift but keeps score changes', () => {
  const first = [{
    crexMatchId: '14MS',
    slug: 'ajt-vs-emb-14MS',
    status: 'live',
    statusText: 'Live',
    score1: '69-0',
    score2: '103-8',
    startTime: 1000,
    odds: { rate: 58, rate2: 63, rateTeam: 'Ajman' },
  }];
  const clockOnly = structuredClone(first);
  clockOnly[0].startTime = 9000;
  assert.equal(overviewFingerprint(first), overviewFingerprint(clockOnly));

  const scoreChanged = structuredClone(clockOnly);
  scoreChanged[0].score1 = '70-0';
  assert.notEqual(overviewFingerprint(first), overviewFingerprint(scoreChanged));
});
