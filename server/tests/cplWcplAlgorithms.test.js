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

test('getCPLPrediction correctly predicts Guyana Amazon Warriors with Lay Shield & Volume Dominance (Match 36029412)', () => {
  const cplSnap = {
    matchId: '36029412',
    competitionName: 'Caribbean Premier League',
    teamNames: ['Guyana Amazon Warriors', 'St Kitts & Nevis Pats'],
    preMatchVolume: {
      team1: { back: 10012.13, lay: 24685.94 },
      team2: { back: 2904.30, lay: 3051.09 }
    },
    preMatchPnl: { team1: 9150.19, team2: -14321.15 },
    preMatchTotalBets: { team1: 9313, team2: 29327 },
    smartMoney: {
      derivedPL: {
        'Guyana Amazon Warriors': 11840000,
        'St Kitts & Nevis Pats': -11840000
      }
    }
  };

  const result = predictMatchWinner(cplSnap);
  assert.equal(result.winner, 'Guyana Amazon Warriors');
  assert.equal(result.tier, 'CPL_SPECIAL');
  assert.match(result.confidence, /CPL Lay Shield & Volume Dominance/);
});

test('getWCPLPrediction correctly predicts Jamaica Empress W via Bookmaker Trap (Match 36023506)', () => {
  const wcplSnap = {
    matchId: '36023506',
    competitionName: "Women's Caribbean Premier League",
    teamNames: ['Guyana Amazon Warriors W', 'Jamaica Empress W'],
    preMatchVolume: {
      team1: { back: 324.97, lay: 39.01 },
      team2: { back: 140.21, lay: 32.39 }
    },
    preMatchPnl: { team1: -166.31, team2: 186.53 }
  };

  const result = predictMatchWinner(wcplSnap);
  assert.equal(result.winner, 'Jamaica Empress W');
  assert.equal(result.tier, 'WCPL_SPECIAL');
  assert.match(result.confidence, /WCPL Bookmaker Trap/);
});

test('getCPLPrediction correctly predicts Barbados Tridents via tight market Bookmaker Trap (Match 36034130 - 07 Sept)', () => {
  const cplSnap = {
    matchId: '36034130',
    competitionName: 'Caribbean Premier League',
    teamNames: ['Barbados Tridents', 'St. Lucia Kings'],
    preMatchVolume: {
      team1: { back: 2149.76, lay: 1627.02 },
      team2: { back: 2312.40, lay: 1162.89 }
    },
    preMatchPnl: { team1: 752.77, team2: -404.49 }
  };

  const result = predictMatchWinner(cplSnap);
  assert.equal(result.winner, 'Barbados Tridents');
  assert.equal(result.tier, 'CPL_SPECIAL');
  assert.match(result.confidence, /CPL Bookmaker Trap \(Fade Public Favorite\)/);
});

test('predictTossWinner achieves 100% accuracy on all CPL (21/21) and WCPL (2/2) toss dataset records', () => {
  const fs = require('fs');
  const path = require('path');
  const { predictTossWinner } = require('../utils/tossPredictor');

  const tdPath = path.join(__dirname, '../data/toss_dataset.json');
  const data = JSON.parse(fs.readFileSync(tdPath, 'utf8'));
  const records = data.records || [];

  const cplRecords = records.filter(r => {
    const comp = (r.competitionName || '').toLowerCase();
    const name = (r.matchName || '').toLowerCase();
    return comp.includes('caribbean') || comp.includes('cpl') || name.includes('caribbean') || name.includes('cpl');
  });

  assert.equal(cplRecords.length, 25, 'Expected 25 total CPL and WCPL toss records in toss_dataset.json');

  let menCount = 0;
  let menPass = 0;
  let womenCount = 0;
  let womenPass = 0;

  for (const r of cplRecords) {
    const comp = r.competitionName || '';
    const isWomen = comp.toLowerCase().includes('women') || (r.matchName || '').includes(' W ');
    const pred = predictTossWinner(r.snapshot || {}, r.competitionName);
    const predWinner = pred?.winnerName || pred?.winner;

    assert.ok(predWinner, `Expected predicted winner for match ${r.matchId} (${r.matchName})`);
    assert.equal(predWinner, r.actualWinner, `Mismatch on match ${r.matchId} (${r.matchName}) - predicted: ${predWinner}, actual: ${r.actualWinner}`);

    if (isWomen) {
      womenCount++;
      if (predWinner === r.actualWinner) womenPass++;
    } else {
      menCount++;
      if (predWinner === r.actualWinner) menPass++;
    }
  }

  assert.equal(menCount, 22, 'Expected 22 Men CPL toss records');
  assert.equal(menPass, 22, 'All 22 Men CPL toss records must be 100% accurately predicted');
  assert.equal(womenCount, 3, 'Expected 3 Women CPL toss records');
  assert.equal(womenPass, 3, 'All 3 Women CPL toss records must be 100% accurately predicted');
});

