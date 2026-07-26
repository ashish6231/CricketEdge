function calculatePrediction(match) {
  const runners = match.runners;
  if (runners.length < 2) return null;

  const totalMarketVolume = match.totalMatched || 1;

  const analysis = runners.map(runner => {
    const odds = runner.lastPriceTraded;
    const impliedProb = 1 / odds;

    // Volume from Betfair's totalMatched per runner, fallback to tradedVolume sum
    const runnerTraded = runner.totalMatched || (runner.ex?.tradedVolume || []).reduce((s, t) => s + t.size, 0) || 0;
    const volumeScore = runnerTraded / totalMarketVolume;
    const backVol = runner.volume?.back || 0;
    const layVol = runner.volume?.lay || 0;
    const backLayRatio = backVol / (layVol || 1);
    const layBackRatio = layVol / (backVol || 1);
    const backLayPercent = (backVol / (backVol + layVol || 1)) * 100;
    const layPercent = (layVol / (backVol + layVol || 1)) * 100;

    // Price history analysis
    const recentPrices = runner.priceHistory?.slice(-20) || [];
    const oldPrice = recentPrices.length > 5 ? recentPrices[0].price : odds;
    const priceChange = odds - oldPrice;
    const priceChangePercent = (priceChange / oldPrice) * 100;

    // Sudden movement detection
    const last3 = runner.priceHistory?.slice(-3) || [];
    const prev3 = runner.priceHistory?.slice(-6, -3) || [];
    const suddenMove = last3.length === 3 && prev3.length === 3
      ? Math.abs(last3[2].price - prev3[2].price) > 0.15 : false;

    // Volatility
    const volatility = recentPrices.length > 2
      ? recentPrices.reduce((sum, p, i, arr) => i === 0 ? 0 : sum + Math.abs(p.price - arr[i-1].price), 0) / (recentPrices.length - 1)
      : 0;

    // Money flow momentum
    const momentum5m = runner.moneyFlow?.last5min || 0;
    const momentum15m = runner.moneyFlow?.last15min || 0;
    const momentum1h = runner.moneyFlow?.last1hour || 0;
    const totalMomentum = momentum5m + momentum15m * 0.5 + momentum1h * 0.2;

    // Smart money detection
    const smartMoneyScore = (momentum5m / 10000) - (priceChange * 10);
    let smartMoneySignal = 'NEUTRAL';
    if (smartMoneyScore > 3) smartMoneySignal = 'SHARKS_IN';
    else if (smartMoneyScore < -3) smartMoneySignal = 'SHARKS_OUT';

    // Market sentiment
    let sentiment = 'NEUTRAL';
    const sentimentScore = -priceChangePercent + (backLayRatio - 1) * 10 + (totalMomentum / 50000);
    if (sentimentScore > 8) sentiment = 'VERY_BULLISH';
    else if (sentimentScore > 4) sentiment = 'BULLISH';
    else if (sentimentScore < -8) sentiment = 'VERY_BEARISH';
    else if (sentimentScore < -4) sentiment = 'BEARISH';

    // Steamers/Drifters
    let steamDrift = 'STABLE';
    if (priceChange < -0.2 && momentum5m > 10000) steamDrift = 'HEAVY_STEAMER';
    else if (priceChange < -0.1) steamDrift = 'STEAMER';
    else if (priceChange > 0.2 && momentum5m < -10000) steamDrift = 'HEAVY_DRIFTER';
    else if (priceChange > 0.1) steamDrift = 'DRIFTER';

    // Win probability
    const winProbability = Math.min(0.95, Math.max(0.05,
      impliedProb * 0.30 + volumeScore * 0.20 +
      (backLayRatio > 1 ? 0.08 : -0.04) * 0.15 +
      (priceChange < 0 ? Math.min(0.15, Math.abs(priceChange) * 0.5) : -Math.min(0.15, Math.abs(priceChange) * 0.5)) * 0.20 +
      (totalMomentum / totalMarketVolume) * 0.15
    ));

    return {
      runnerName: runner.runnerName,
      selectionId: runner.selectionId,
      odds,
      impliedProb: Number(impliedProb.toFixed(4)),
      impliedPercent: Number((impliedProb * 100).toFixed(2)),
      volumeScore: Number(volumeScore.toFixed(4)),
      volumePercent: Number((volumeScore * 100).toFixed(2)),
      backLayRatio: Number(backLayRatio.toFixed(2)),
      layBackRatio: Number(layBackRatio.toFixed(2)),
      backLayPercent: Number(backLayPercent.toFixed(1)),
      layPercent: Number(layPercent.toFixed(1)),
      priceChange: Number(priceChange.toFixed(3)),
      priceChangePercent: Number(priceChangePercent.toFixed(2)),
      suddenMove,
      volatility: Number(volatility.toFixed(3)),
      momentum5m: Math.floor(momentum5m),
      momentum15m: Math.floor(momentum15m),
      momentum1h: Math.floor(momentum1h),
      totalMomentum: Math.floor(totalMomentum),
      smartMoneySignal,
      smartMoneyScore: Number(smartMoneyScore.toFixed(2)),
      sentiment,
      sentimentScore: Number(sentimentScore.toFixed(2)),
      steamDrift,
      winProbability: Number(winProbability.toFixed(4)),
      winPercent: Number((winProbability * 100).toFixed(2))
    };
  });

  const totalProb = analysis.reduce((sum, a) => sum + a.winProbability, 0);
  analysis.forEach(a => {
    a.normalizedProb = Number((a.winProbability / totalProb).toFixed(4));
    a.normalizedPercent = Number((a.normalizedProb * 100).toFixed(2));
  });

  const sorted = [...analysis].sort((a, b) => b.normalizedProb - a.normalizedProb);
  const favorite = sorted[0], second = sorted[1];
  const probDiff = favorite.normalizedPercent - (second?.normalizedPercent || 0);
  let confidence = 'LOW';
  if (probDiff > 25) confidence = 'VERY_HIGH'; else if (probDiff > 15) confidence = 'HIGH'; else if (probDiff > 8) confidence = 'MEDIUM';
  const marketEdge = favorite.normalizedPercent - ((1 / favorite.odds) * 100);
  let recommendation = 'NO_EDGE';
  if (marketEdge > 8) recommendation = 'STRONG_VALUE'; else if (marketEdge > 4) recommendation = 'VALUE_BET'; else if (marketEdge > -2) recommendation = 'FAIR_PRICE'; else recommendation = 'AVOID';
  const suddenMovers = analysis.filter(a => a.suddenMove);
  const volumeImbalance = analysis.some(a => a.backLayRatio > 2 || a.backLayRatio < 0.5);

  return {
    matchId: match.matchId,
    eventName: match.eventName,
    inplay: match.inplay,
    analysis,
    prediction: {
      favorite: favorite.runnerName,
      favoriteProb: favorite.normalizedPercent,
      favoriteOdds: favorite.odds,
      second: second?.runnerName,
      secondProb: second?.normalizedPercent,
      secondOdds: second?.odds,
      confidence,
      edge: Number(marketEdge.toFixed(2)),
      recommendation,
      marketSentiment: favorite.sentimentScore > 5 ? 'STRONG_FAVORITE' : favorite.sentimentScore > 0 ? 'FAVORITE' : 'OPEN_MARKET'
    },
    marketOverround: Number(((match.overround - 1) * 100).toFixed(2)),
    suddenMovers: suddenMovers.map(s => s.runnerName),
    volumeImbalance,
    timestamp: new Date().toISOString()
  };
}

function calculateBookieBook(match) {
  const runners = match.runners;
  const totalVolume = match.totalMatched || 1;

  const book = runners.map(runner => {
    const odds = runner.lastPriceTraded || 1;
    // availableToBack = money waiting to back (public wants to back)
    // availableToLay = money waiting to lay (public wants to lay)
    // tradedVolume = already matched money
    const backVol = runner.volume?.back || 0;  // available to back queue
    const layVol = runner.volume?.lay || 0;    // available to lay queue
    const tradedVol = (runner.ex?.tradedVolume || []).reduce((s, t) => s + t.size, 0) || runner.totalMatched || 0;

    // P&L uses available queue (what's at risk right now)
    const ifWins = layVol - backVol * (odds - 1);
    const ifLoses = backVol - layVol * (odds - 1);

    const backLayRatio = backVol / (layVol || 1);
    const layBackRatio = layVol / (backVol || 1);
    const backPercent = (backVol / (backVol + layVol || 1)) * 100;
    const layPercent = (layVol / (backVol + layVol || 1)) * 100;

    let bookiePosition = 'NEUTRAL';
    let bookieWants = 'NO_PREFERENCE';

    if (layBackRatio > 2.0) { bookiePosition = 'LAY_DOMINATED'; bookieWants = 'WIN'; }
    else if (layBackRatio > 1.3) { bookiePosition = 'LAY_HEAVY'; bookieWants = 'WIN'; }
    else if (backLayRatio > 2.0) { bookiePosition = 'BACK_DOMINATED'; bookieWants = 'LOSE'; }
    else if (backLayRatio > 1.3) { bookiePosition = 'BACK_HEAVY'; bookieWants = 'LOSE'; }

    const avgVolume = totalVolume / runners.length;
    const isPublicFavorite = runner.totalMatched > avgVolume * 1.5;

    const sharkIndicator = runner.moneyFlow?.last5min > 50000 ? 'SHARKS_IN' :
                           runner.moneyFlow?.last5min < -50000 ? 'SHARKS_OUT' : 'NONE';

    return {
      runnerName: runner.runnerName,
      selectionId: runner.selectionId,
      odds,
      backVolume: backVol,
      layVolume: layVol,
      tradedVolume: Math.round(tradedVol),
      totalVolume: runner.totalMatched || Math.round(tradedVol),
      backLayRatio: Number(backLayRatio.toFixed(2)),
      layBackRatio: Number(layBackRatio.toFixed(2)),
      backPercent: Number(backPercent.toFixed(1)),
      layPercent: Number(layPercent.toFixed(1)),
      ifWins: Math.floor(ifWins),
      ifLoses: Math.floor(ifLoses),
      netPosition: Math.floor(ifWins + ifLoses),
      bookiePosition,
      bookieWants,
      isPublicFavorite,
      sharkIndicator,
      moneyFlow5m: runner.moneyFlow?.last5min || 0,
      moneyFlow15m: runner.moneyFlow?.last15min || 0
    };
  });

  const bookieFavorite = book.reduce((best, b) => b.ifWins > best.ifWins ? b : best, book[0]);
  const bookieWorst = book.reduce((worst, b) => b.ifWins < worst.ifWins ? b : worst, book[0]);
  const publicFav = book.reduce((fav, b) => b.totalVolume > fav.totalVolume ? b : fav, book[0]);
  const bestCase = Math.max(...book.map(b => b.ifWins));
  const worstCase = Math.min(...book.map(b => b.ifWins));
  const totalNet = book.reduce((sum, b) => sum + Math.abs(b.netPosition), 0);
  const marketBalance = totalNet / (totalVolume || 1) * 100;

  return {
    matchId: match.matchId,
    eventName: match.eventName,
    totalMarketVolume: totalVolume,
    book,
    summary: {
      bestCaseScenario: Math.floor(bestCase),
      worstCaseScenario: Math.floor(worstCase),
      bookieFavoriteOutcome: bookieFavorite?.runnerName,
      bookieFavoriteProfit: Math.floor(bookieFavorite?.ifWins || 0),
      bookieWorstOutcome: bookieWorst?.runnerName,
      bookieWorstLoss: Math.floor(bookieWorst?.ifWins || 0),
      publicFavorite: publicFav?.runnerName,
      publicFavoriteVolume: publicFav?.totalVolume,
      marketBalance: Number(marketBalance.toFixed(2)),
      riskLevel: marketBalance < 10 ? 'LOW' : marketBalance < 25 ? 'MEDIUM' : 'HIGH',
      numberOfOutcomes: runners.length
    },
    timestamp: new Date().toISOString()
  };
}

function getMarketSignals(match) {
  const signals = [];
  const runners = match.runners;

  const totalBack = runners.reduce((sum, r) => sum + (r.volume?.back || 0), 0);
  const totalLay = runners.reduce((sum, r) => sum + (r.volume?.lay || 0), 0);
  const backLayRatio = totalBack / (totalLay || 1);

  if (backLayRatio > 1.8) signals.push({ type: 'HEAVY_BACKING', message: 'Market seeing heavy back action', severity: 'VERY_HIGH' });
  else if (backLayRatio > 1.3) signals.push({ type: 'BACKING_PRESSURE', message: 'More money backing than laying', severity: 'MEDIUM' });
  else if (backLayRatio < 0.6) signals.push({ type: 'HEAVY_LAYING', message: 'Market seeing heavy lay action', severity: 'VERY_HIGH' });
  else if (backLayRatio < 0.8) signals.push({ type: 'LAYING_PRESSURE', message: 'More money laying than backing', severity: 'MEDIUM' });

  const fav = [...runners].sort((a, b) => a.lastPriceTraded - b.lastPriceTraded)[0];
  if (fav) {
    const recent = fav.priceHistory?.slice(-5) || [];
    if (recent.length >= 2) {
      const drop = recent[0].price - recent[recent.length - 1].price;
      if (drop > 0.25) signals.push({ type: 'HEAVY_STEAMER', message: `${fav.runnerName} steaming in fast`, severity: 'VERY_HIGH' });
      else if (drop > 0.12) signals.push({ type: 'STEAMER', message: `${fav.runnerName} shortening`, severity: 'HIGH' });
      else if (drop < -0.25) signals.push({ type: 'HEAVY_DRIFTER', message: `${fav.runnerName} drifting fast`, severity: 'HIGH' });
      else if (drop < -0.12) signals.push({ type: 'DRIFTER', message: `${fav.runnerName} drifting`, severity: 'MEDIUM' });
    }

    if (fav.moneyFlow?.last5min > 80000) signals.push({ type: 'WHALE_MONEY', message: `Big money on ${fav.runnerName}`, severity: 'VERY_HIGH' });
    else if (fav.moneyFlow?.last5min > 40000) signals.push({ type: 'SMART_MONEY', message: `Strong flow on ${fav.runnerName}`, severity: 'HIGH' });

    const favBLRatio = (fav.volume?.back || 0) / ((fav.volume?.lay || 0) || 1);
    if (favBLRatio > 2) signals.push({ type: 'FAV_BACKED', message: `${fav.runnerName} heavily backed`, severity: 'HIGH' });
    if (favBLRatio < 0.5) signals.push({ type: 'FAV_LAYED', message: `${fav.runnerName} heavily layed`, severity: 'HIGH' });
  }

  if (match.overround > 1.12) signals.push({ type: 'HIGH_OVERROUND', message: 'Bookie margin is high', severity: 'MEDIUM' });

  const maxVol = Math.max(...runners.map(r => r.moneyFlow?.last5min || 0));
  if (maxVol > 100000) signals.push({ type: 'VOLUME_SPIKE', message: 'Unusual volume in last 5 min', severity: 'HIGH' });

  return signals;
}

module.exports = { calculatePrediction, calculateBookieBook, getMarketSignals };
