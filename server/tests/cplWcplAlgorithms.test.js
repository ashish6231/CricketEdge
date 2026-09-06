const test = require('node:test');
const assert = require('node:assert/strict');
const { isWomenMatch, getLeagueAlgorithmPrediction, getWCPLPrediction, getCPLPrediction } = require('../utils/leagueAlgorithms');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');

test('isWomenMatch correctly identifies women matches by W suffix and comp name', () => {
  assert.equal(isWomenMatch('Caribbean Premier League', 'Barbados Tridents W', 'Trinbago Knight Riders W'), true);
  assert.equal(isWomenMatch('Caribbean Premier League', 'Barbados Tridents', 'Trinbago Knight Riders W'), true);
  assert.equal(isWomenMatch("Women's Caribbean Premier League", 'Barbados Tridents', 'Trinbago Knight Riders'), true);
  assert.equal(isWomenMatch('Caribbean Premier League', 'Barbados Tridents', 'Trinbago Knight Riders'), false);
  assert.equal(isWomenMatch('European T20 Premier League', 'Belfast Wolves', 'Edinburgh Castle Rockers'), false);
});

test('getLeagueAlgorithmPrediction routes Women CPL to WCPL_SPECIAL and Men CPL to CPL_SPECIAL', () => {
  // WCPL Match: Barbados Tridents W vs Trinbago Knight Riders W (Match 36023098)
  const wcplSnap = {
    matchId: '36023098',
    competitionName: "Women's Caribbean Premier League",
    teamNames: ['Barbados Tridents W', 'Trinbago Knight Riders W'],
    preMatchVolume: {
      team1: { back: 882.72, lay: 2370.99 },
      team2: { back: 873.53, lay: 83.95 }
    },
    preMatchPnl: { team1: 2052.98, team2: -2299.23 }
  };

  const wcplResult = predictMatchWinner(wcplSnap);
  assert.equal(wcplResult.winner, 'Trinbago Knight Riders W');
  assert.equal(wcplResult.tier, 'WCPL_SPECIAL');
  assert.match(wcplResult.confidence, /WCPL Lay Resistance Dump/);

  // Men CPL Match: Barbados Tridents vs Trinbago Knight Riders (Match 36023549)
  const cplSnap = {
    matchId: '36023549',
    competitionName: 'Caribbean Premier League',
    teamNames: ['Barbados Tridents', 'Trinbago Knight Riders'],
    preMatchVolume: {
      team1: { back: 6622.58, lay: 4463.54 },
      team2: { back: 29370.52, lay: 44316.24 }
    },
    preMatchPnl: { team1: -18213.71, team2: 12373.43 }
  };

  const cplResult = predictMatchWinner(cplSnap);
  assert.equal(cplResult.winner, 'Trinbago Knight Riders');
  assert.equal(cplResult.tier, 'CPL_SPECIAL');
});
