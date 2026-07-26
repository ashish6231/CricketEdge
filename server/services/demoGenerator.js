const { v4: uuidv4 } = require('uuid');

const TEAMS = [
  'India', 'Australia', 'England', 'Pakistan', 'South Africa',
  'New Zealand', 'Sri Lanka', 'West Indies', 'Bangladesh', 'Afghanistan'
];

const TOURNAMENTS = [
  'ICC World Cup 2026', 'IPL 2026', 'T20 Blast', 'Big Bash League',
  'PSL 2026', 'The Ashes', 'Asia Cup', 'County Championship'
];

const MATCH_TYPES = ['T20', 'ODI', 'Test'];

// Betfair uses these exact field names
function randomBetween(min, max, decimals = 2) {
  const val = Math.random() * (max - min) + min;
  return Number(val.toFixed(decimals));
}

// Generate Betfair-style price ladder (3 depths like real API)
function generatePriceLadder(basePrice, side = 'back') {
  const ladder = [];
  for (let i = 0; i < 3; i++) {
    const adjustment = side === 'back' ? -(i * 0.01) : (i * 0.01);
    const price = Math.max(1.01, Number((basePrice + adjustment).toFixed(2)));
    const size = Math.floor(randomBetween(500, 15000, 0));
    ladder.push({ price, size });
  }
  return ladder;
}

// Generate traded volume history (like Betfair's tradedVolume)
function generateTradedVolume(currentPrice) {
  const volumes = [];
  const basePrice = Math.max(1.01, currentPrice - 0.2);
  for (let i = 0; i < 10; i++) {
    const price = Number((basePrice + (i * 0.04)).toFixed(2));
    const size = Math.floor(randomBetween(10, 15000, 0));
    volumes.push({ price, size });
  }
  return volumes;
}

// Generate price history for charts
function generatePriceHistory(currentPrice, points = 30) {
  const history = [];
  let price = currentPrice;
  const now = Date.now();
  for (let i = points; i >= 0; i--) {
    price = Math.max(1.01, price + randomBetween(-0.08, 0.08, 3));
    history.push({ timestamp: now - (i * 60000), price: Number(price.toFixed(2)) });
  }
  return history;
}

function generateMatch() {
  const team1 = TEAMS[Math.floor(Math.random() * TEAMS.length)];
  let team2 = TEAMS[Math.floor(Math.random() * TEAMS.length)];
  while (team2 === team1) team2 = TEAMS[Math.floor(Math.random() * TEAMS.length)];

  const matchType = MATCH_TYPES[Math.floor(Math.random() * MATCH_TYPES.length)];
  const tournament = TOURNAMENTS[Math.floor(Math.random() * TOURNAMENTS.length)];

  const isLive = Math.random() > 0.3;
  const status = isLive ? 'LIVE' : (Math.random() > 0.5 ? 'UPCOMING' : 'COMPLETED');

  // Betfair marketId format: 1.xxxxxxxxxx
  const marketId = `1.${Math.floor(Math.random() * 900000000 + 100000000)}`;

  const baseOdds1 = randomBetween(1.5, 3.5, 2);
  const baseOdds2 = randomBetween(1.8, 4.0, 2);

  // Betfair uses totalMatched at market level
  const runner1Matched = Math.floor(randomBetween(50000, 2500000, 0));
  const runner2Matched = Math.floor(randomBetween(50000, 2500000, 0));
  const totalMatched = runner1Matched + runner2Matched;

  const runners = [
    {
      selectionId: Math.floor(Math.random() * 9000000 + 1000000),
      runnerName: team1,
      handicap: 0,
      status: 'ACTIVE',
      lastPriceTraded: baseOdds1,
      totalMatched: runner1Matched,
      // Betfair ex (exchange) data
      ex: {
        availableToBack: generatePriceLadder(baseOdds1, 'back'),
        availableToLay: generatePriceLadder(baseOdds1, 'lay'),
        tradedVolume: generateTradedVolume(baseOdds1)
      },
      // Extended data for our analysis
      volume: {
        back: Math.floor(runner1Matched * randomBetween(0.45, 0.65, 2)),
        lay: Math.floor(runner1Matched * randomBetween(0.35, 0.55, 2)),
        total: runner1Matched
      },
      moneyFlow: {
        last5min: Math.floor(randomBetween(-50000, 50000, 0)),
        last15min: Math.floor(randomBetween(-150000, 150000, 0)),
        last1hour: Math.floor(randomBetween(-500000, 500000, 0))
      },
      priceHistory: generatePriceHistory(baseOdds1)
    },
    {
      selectionId: Math.floor(Math.random() * 9000000 + 1000000),
      runnerName: team2,
      handicap: 0,
      status: 'ACTIVE',
      lastPriceTraded: baseOdds2,
      totalMatched: runner2Matched,
      ex: {
        availableToBack: generatePriceLadder(baseOdds2, 'back'),
        availableToLay: generatePriceLadder(baseOdds2, 'lay'),
        tradedVolume: generateTradedVolume(baseOdds2)
      },
      volume: {
        back: Math.floor(runner2Matched * randomBetween(0.45, 0.65, 2)),
        lay: Math.floor(runner2Matched * randomBetween(0.35, 0.55, 2)),
        total: runner2Matched
      },
      moneyFlow: {
        last5min: Math.floor(randomBetween(-50000, 50000, 0)),
        last15min: Math.floor(randomBetween(-150000, 150000, 0)),
        last1hour: Math.floor(randomBetween(-500000, 500000, 0))
      },
      priceHistory: generatePriceHistory(baseOdds2)
    }
  ];

  // Test matches have draw
  if (matchType === 'Test') {
    const drawOdds = randomBetween(3.0, 8.0, 2);
    const drawMatched = Math.floor(randomBetween(20000, 800000, 0));
    runners.push({
      selectionId: Math.floor(Math.random() * 9000000 + 1000000),
      runnerName: 'The Draw',
      handicap: 0,
      status: 'ACTIVE',
      lastPriceTraded: drawOdds,
      totalMatched: drawMatched,
      ex: {
        availableToBack: generatePriceLadder(drawOdds, 'back'),
        availableToLay: generatePriceLadder(drawOdds, 'lay'),
        tradedVolume: generateTradedVolume(drawOdds)
      },
      volume: {
        back: Math.floor(drawMatched * 0.55),
        lay: Math.floor(drawMatched * 0.45),
        total: drawMatched
      },
      moneyFlow: {
        last5min: Math.floor(randomBetween(-20000, 20000, 0)),
        last15min: Math.floor(randomBetween(-60000, 60000, 0)),
        last1hour: Math.floor(randomBetween(-200000, 200000, 0))
      },
      priceHistory: generatePriceHistory(drawOdds)
    });
  }

  const overround = runners.reduce((sum, r) => sum + (1 / r.lastPriceTraded), 0);

  return {
    // Betfair fields
    marketId,
    matchId: uuidv4(),
    eventName: `${team1} v ${team2}`,
    tournament,
    matchType,
    status,
    inplay: isLive,
    isMarketDataDelayed: false,
    betDelay: isLive ? 5 : 0,
    bspReconciled: false,
    complete: true,
    numberOfWinners: 1,
    numberOfRunners: runners.length,
    numberOfActiveRunners: runners.length,
    totalMatched: Math.floor(totalMatched),
    openDate: new Date(Date.now() - randomBetween(0, 3600000, 0)).toISOString(),
    overround: Number(overround.toFixed(3)),
    runners,
    score: {
      team1: status === 'UPCOMING' ? 'Yet to bat' : `${Math.floor(randomBetween(80, 320))}/${Math.floor(randomBetween(1, 10))}`,
      team2: status === 'UPCOMING' ? 'Yet to bat' : (status === 'COMPLETED' || Math.random() > 0.3) ? `${Math.floor(randomBetween(80, 320))}/${Math.floor(randomBetween(1, 10))}` : 'Yet to bat',
      overs: status === 'UPCOMING' ? '0.0' : `${Math.floor(randomBetween(10, 50))}.${Math.floor(randomBetween(0, 6))}`,
      runRate: status === 'UPCOMING' ? 0 : randomBetween(4, 12, 2),
      requiredRunRate: status === 'UPCOMING' ? 0 : (isLive ? randomBetween(0, 15, 2) : 0)
    },
    lastUpdated: new Date().toISOString()
  };
}

function generateTossMarket(matchTeam1, matchTeam2, matchMarketId) {
  // Toss market: same two teams, winner = team that wins toss
  // Betfair toss markets are pre-match, odds typically 1.8-2.2 (near 50/50)
  const tossMarketId = `1.${Math.floor(Math.random() * 900000000 + 100000000)}`;
  const baseOdds1 = randomBetween(1.80, 2.20, 2);
  const baseOdds2 = randomBetween(1.80, 2.20, 2);

  const runner1Matched = Math.floor(randomBetween(5000, 200000, 0));
  const runner2Matched = Math.floor(randomBetween(5000, 200000, 0));

  const runners = [
    {
      selectionId: Math.floor(Math.random() * 9000000 + 1000000),
      runnerName: matchTeam1,
      handicap: 0,
      status: 'ACTIVE',
      lastPriceTraded: baseOdds1,
      totalMatched: runner1Matched,
      ex: {
        availableToBack: generatePriceLadder(baseOdds1, 'back'),
        availableToLay: generatePriceLadder(baseOdds1, 'lay'),
        tradedVolume: generateTradedVolume(baseOdds1)
      },
      volume: {
        back: Math.floor(runner1Matched * randomBetween(0.45, 0.65, 2)),
        lay: Math.floor(runner1Matched * randomBetween(0.35, 0.55, 2))
      },
      moneyFlow: {
        last5min: Math.floor(randomBetween(-20000, 20000, 0)),
        last15min: Math.floor(randomBetween(-50000, 50000, 0)),
        last1hour: Math.floor(randomBetween(-100000, 100000, 0))
      },
      priceHistory: generatePriceHistory(baseOdds1)
    },
    {
      selectionId: Math.floor(Math.random() * 9000000 + 1000000),
      runnerName: matchTeam2,
      handicap: 0,
      status: 'ACTIVE',
      lastPriceTraded: baseOdds2,
      totalMatched: runner2Matched,
      ex: {
        availableToBack: generatePriceLadder(baseOdds2, 'back'),
        availableToLay: generatePriceLadder(baseOdds2, 'lay'),
        tradedVolume: generateTradedVolume(baseOdds2)
      },
      volume: {
        back: Math.floor(runner2Matched * randomBetween(0.45, 0.65, 2)),
        lay: Math.floor(runner2Matched * randomBetween(0.35, 0.55, 2))
      },
      moneyFlow: {
        last5min: Math.floor(randomBetween(-20000, 20000, 0)),
        last15min: Math.floor(randomBetween(-50000, 50000, 0)),
        last1hour: Math.floor(randomBetween(-100000, 100000, 0))
      },
      priceHistory: generatePriceHistory(baseOdds2)
    }
  ];

  const totalMatched = runner1Matched + runner2Matched;
  const overround = runners.reduce((sum, r) => sum + (1 / r.lastPriceTraded), 0);
  const isLive = Math.random() > 0.5;

  return {
    marketId: tossMarketId,
    matchId: tossMarketId.replace(/\./g, '_'),
    linkedMatchMarketId: matchMarketId,
    eventName: `${matchTeam1} v ${matchTeam2}`,
    marketCategory: 'TOSS',
    tournament: TOURNAMENTS[Math.floor(Math.random() * TOURNAMENTS.length)],
    matchType: MATCH_TYPES[Math.floor(Math.random() * MATCH_TYPES.length)],
    status: isLive ? 'LIVE' : 'UPCOMING',
    inplay: isLive,
    isMarketDataDelayed: false,
    betDelay: isLive ? 0 : 0,  // Toss markets usually 0 delay
    bspReconciled: false,
    complete: false,
    numberOfWinners: 1,
    numberOfRunners: 2,
    numberOfActiveRunners: 2,
    totalMatched,
    openDate: new Date(Date.now() + randomBetween(0, 7200000, 0)).toISOString(),
    overround: Number(overround.toFixed(3)),
    runners,
    lastUpdated: new Date().toISOString()
  };
}

function generateTossMarkets(matches) {
  return matches.map(m => {
    const teams = m.runners.filter(r => r.runnerName !== 'The Draw');
    if (teams.length < 2) return null;
    return generateTossMarket(teams[0].runnerName, teams[1].runnerName, m.marketId);
  }).filter(Boolean);
}

function generateMatches(count = 8) {
  const matches = [];
  for (let i = 0; i < count; i++) matches.push(generateMatch());
  return matches;
}

function updateMatchLive(match) {
  if (!match.inplay || match.status !== 'LIVE') return match;

  match.runners.forEach(runner => {
    const move = randomBetween(-0.08, 0.08, 3);
    runner.lastPriceTraded = Math.max(1.01, Number((runner.lastPriceTraded + move).toFixed(2)));

    runner.ex.availableToBack = generatePriceLadder(runner.lastPriceTraded, 'back');
    runner.ex.availableToLay = generatePriceLadder(runner.lastPriceTraded, 'lay');

    const newVol = Math.floor(randomBetween(100, 5000, 0));
    runner.totalMatched += newVol;
    runner.volume.back += Math.floor(newVol * 0.55);
    runner.volume.lay += Math.floor(newVol * 0.45);

    if (move < 0) runner.moneyFlow.last5min += Math.floor(newVol * 0.3);
    else runner.moneyFlow.last5min -= Math.floor(newVol * 0.3);

    runner.priceHistory.push({ timestamp: Date.now(), price: runner.lastPriceTraded });
    if (runner.priceHistory.length > 50) runner.priceHistory.shift();
  });

  match.totalMatched = match.runners.reduce((sum, r) => sum + r.totalMatched, 0);
  match.overround = match.runners.reduce((sum, r) => sum + (1 / r.lastPriceTraded), 0);
  match.lastUpdated = new Date().toISOString();

  return match;
}

module.exports = { generateMatches, generateTossMarkets, updateMatchLive, randomBetween };
