const { getDefaultStore } = require('./matchDatasetStore');
const { getDefaultD10Store } = require('./emiratesD10Store');
const { getDefaultWNCLStore } = require('./wnclStore');
const { checkMatchRecordQuality } = require('./matchRecordQuality');
const { snapshotMatchesRecord, teamKey } = require('./trackedLeagueSnapshots');
const { wnclTeamKey, isWNCLLeague } = require('../utils/wnclMatchPredictor.mjs');
const { predictMatchWinner } = require('../utils/matchWinnerPredictor');
const { getLeagueMatchAlgorithm, LEAGUE_MATCH_ALGORITHMS, PREDICTOR_VERSION, predictLeagueTrainingFit } = require('../utils/normalLeagueMatchPredictor.mjs');

function algorithmFor(name) {
  const algorithm = getLeagueMatchAlgorithm(name);
  return {
    league: algorithm?.league || name || 'Unknown league',
    algorithmId: algorithm?.algorithmId || 'match-unregistered-league-fallback',
    predictorVersion: PREDICTOR_VERSION,
    registered: !!algorithm,
    mode: algorithm?.profile.model?.correctionTree ? 'League correction tree'
      : algorithm?.profile.model?.tree ? 'League decision tree'
      : algorithm?.profile.model?.forest ? 'League ensemble'
        : algorithm?.profile.model?.neighbors ? 'League nearest neighbors'
          : algorithm ? 'Independent league rules' : 'Unregistered league fallback',
    strategy: algorithm?.profile.strategy || 'market-flow-fallback',
    profileVersion: algorithm?.profile.profileVersion || null,
    trainingSamples: algorithm?.profile.trainingSamples || 0,
    evaluation: algorithm?.profile.evaluation || null,
    validationStatus: algorithm?.profile.validationStatus || 'unregistered',
    parameters: algorithm?.parameters || { totalRatio: 1.5, backRatio: 1.4 },
  };
}

function comparison(predicted, actual) {
  if (actual === 'No Result') return 'no_result';
  if (!predicted) return 'no_pick';
  if (!actual) return 'pending';
  return predicted === actual ? 'hit' : 'miss';
}

function decorate(record, source, predict) {
  const currentAlgorithm = algorithmFor(record.competitionName);
  const currentPrediction = predict({ ...record.snapshot, competitionName: record.competitionName });
  const trainingPrediction = predictLeagueTrainingFit({ ...record.snapshot, competitionName: record.competitionName });
  const evidence = record.resultVerification;
  const verified = ['verified', 'abandoned'].includes(record.status)
    && (evidence?.verification === 'verified' || evidence?.status === 'verified'
      || !!record.confirmedByEmail && record.confirmedByEmail !== 'crex-auto');
  const actualWinner = verified && [record.team1, record.team2, 'No Result'].includes(record.actualWinner) ? record.actualWinner : null;
  return {
    ...record,
    actualWinner,
    status: actualWinner === 'No Result' ? 'abandoned' : actualWinner ? 'verified' : 'pending',
    reportedWinner: record.reportedWinner || (record.confirmedByEmail === 'crex-auto' ? record.actualWinner : null),
    recordKey: `${source}:${record.recordId || record.matchId}`,
    datasetSource: source,
    league: currentAlgorithm.league,
    currentAlgorithm,
    currentPrediction,
    trainingPrediction,
    forecastIssuedBeforeStart: issuedBeforeStart(record),
    comparison: comparison(record.predictedWinner, actualWinner),
    currentComparison: comparison(currentPrediction?.winner, actualWinner),
    trainingComparison: comparison(trainingPrediction?.winner, actualWinner),
  };
}

function trackedRecord(record, source, normalizeTeam) {
  const market = record.markets?.match;
  if (!market || !snapshotMatchesRecord(market.snapshot, record, normalizeTeam)) return null;
  const snapshot = market.snapshot;
  const names = snapshot.teamNames.slice(0, 2);
  const mapWinner = name => name === 'No Result' ? name : names.find(team => normalizeTeam(team) === normalizeTeam(name)) || null;
  const verified = record.status === 'completed' && record.resultVerification?.status === 'verified';
  const actualWinner = verified ? mapWinner(record.actualWinner) : null;
  return {
    matchId: market.marketMatchId || record.recordId,
    recordId: record.recordId,
    marketId: snapshot.marketId || null,
    matchName: record.matchName,
    competitionName: record.competitionName,
    team1: names[0], team2: names[1],
    startTime: record.startTime,
    capturedAt: market.prediction?.capturedAt || market.capturedAt,
    inputTiming: market.inputTiming,
    matchStatus: record.status,
    status: actualWinner === 'No Result' ? 'abandoned' : actualWinner ? 'verified' : 'pending',
    snapshot,
    predictedWinner: mapWinner(market.prediction?.winner),
    predictionReason: market.prediction?.reason || null,
    predictionConfidence: market.prediction?.confidence || null,
    predictionTier: market.prediction?.tier || null,
    predictorVersion: market.prediction?.predictorVersion || null,
    algorithmId: market.prediction?.algorithmId || null,
    actualWinner,
    reportedWinner: record.reportedWinner || null,
    resultVerification: record.resultVerification,
    resultText: record.resultText || null,
    sourceUrl: record.sourceUrl || null,
    confirmedAt: record.resultVerification?.checkedAt || null,
    confirmedByEmail: record.resultVerification?.confirmedBy || null,
    datasetSource: source,
  };
}

function timestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric < 1e12 ? numeric * 1000 : numeric : Date.parse(value);
}

function issuedBeforeStart(row) {
  return row.inputTiming === 'captured-before-start' && [row.team1, row.team2].includes(row.predictedWinner)
    && Number.isFinite(timestamp(row.capturedAt)) && Number.isFinite(timestamp(row.startTime))
    && timestamp(row.capturedAt) < timestamp(row.startTime);
}

function summarize(records) {
  const result = { total: records.length, verified: 0, pending: 0, noResult: 0, hits: 0, misses: 0, noPick: 0,
    currentHits: 0, currentMisses: 0, currentNoPick: 0, trainingHits: 0, trainingMisses: 0, trainingNoPick: 0,
    forwardForecasts: 0, forwardHits: 0, forwardMisses: 0, forwardPending: 0 };
  for (const row of records) {
    if (row.status === 'verified') result.verified++;
    if (row.status === 'pending') result.pending++;
    if (row.comparison === 'no_result') result.noResult++;
    if (row.comparison === 'hit') result.hits++;
    if (row.comparison === 'miss') result.misses++;
    if (row.comparison === 'no_pick') result.noPick++;
    if (row.currentComparison === 'hit') result.currentHits++;
    if (row.currentComparison === 'miss') result.currentMisses++;
    if (row.currentComparison === 'no_pick') result.currentNoPick++;
    if (row.trainingComparison === 'hit') result.trainingHits++;
    if (row.trainingComparison === 'miss') result.trainingMisses++;
    if (row.trainingComparison === 'no_pick') result.trainingNoPick++;
    if (row.forecastIssuedBeforeStart) {
      result.forwardForecasts++;
      if (row.comparison === 'hit') result.forwardHits++;
      if (row.comparison === 'miss') result.forwardMisses++;
      if (row.comparison === 'pending') result.forwardPending++;
    }
  }
  result.currentAccuracy = result.currentHits + result.currentMisses
    ? Number((100 * result.currentHits / (result.currentHits + result.currentMisses)).toFixed(1)) : null;
  return result;
}

function deduplicateRecords(records) {
  const result = [], identities = new Map();
  for (const row of records) {
    const key = `${row.league}:${row.matchId}`;
    const existing = identities.get(key);
    if (!existing) { identities.set(key, row); result.push(row); continue; }
    const normalize = isWNCLLeague(row.league) ? wnclTeamKey : teamKey;
    const teams = [existing.team1, existing.team2].map(normalize).sort();
    const sameTeams = [row.team1, row.team2].map(normalize).sort().every((name, i) => name === teams[i]);
    const firstDate = timestamp(existing.startTime), nextDate = timestamp(row.startTime);
    if (!sameTeams || existing.datasetSource === row.datasetSource
      || Number.isFinite(firstDate) && Number.isFinite(nextDate) && Math.abs(firstDate - nextDate) > 600000) {
      result.push(row); continue;
    }
    const selected = row.forecastIssuedBeforeStart ? row : existing;
    const sourceSnapshots = [existing, row].flatMap(item => item.sourceSnapshots || [{
      datasetSource:item.datasetSource,recordKey:item.recordKey,snapshot:item.snapshot,
      capturedAt:item.capturedAt,predictedWinner:item.predictedWinner,algorithmId:item.algorithmId,
    }]);
    const outcomes = [existing.actualWinner, row.actualWinner].filter(Boolean);
    const conflict = existing.resultConflict || outcomes.length === 2 && normalize(outcomes[0]) !== normalize(outcomes[1]);
    const actualWinner = conflict ? null : outcomes[0] === 'No Result' ? 'No Result' : outcomes.length
      ? [selected.team1, selected.team2].find(team => normalize(team) === normalize(outcomes[0])) || null : null;
    const verified = [existing, row].find(item => item.actualWinner);
    const combined = { ...selected,sourceSnapshots,actualWinner,resultConflict:!!conflict,
      status:actualWinner === 'No Result' ? 'abandoned' : actualWinner ? 'verified' : 'pending',
      resultVerification:conflict ? {status:'conflict'} : verified?.resultVerification || selected.resultVerification,
      comparison:comparison(selected.predictedWinner,actualWinner),
      currentComparison:comparison(selected.currentPrediction?.winner,actualWinner) };
    combined.trainingComparison = comparison(selected.trainingPrediction?.winner, actualWinner);
    result[result.indexOf(existing)] = combined; identities.set(key,combined);
  }
  return result;
}

async function loadMatchDataset({ store = getDefaultStore(), trackedStores, predict = predictMatchWinner } = {}) {
  const sources = trackedStores || [
    { source: 'emirates_d10_dataset', store: getDefaultD10Store(), normalizeTeam: teamKey },
    { source: 'wncl_dataset', store: getDefaultWNCLStore(), normalizeTeam: wnclTeamKey },
  ];
  const datasets = await Promise.all([store.load(), ...sources.map(source => source.store.load())]);
  const collected = [];
  let excluded = 0;
  for (const record of datasets[0].records) {
    if (!checkMatchRecordQuality(record).valid) { excluded++; continue; }
    collected.push(decorate({ ...record, matchStatus: 'completed' }, 'match_dataset', predict));
  }
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    for (const record of datasets[i + 1].records) {
      // Toss-only samples do not belong in the match dataset view.
      if (!record.markets?.match) continue;
      const normalized = trackedRecord(record, source.source, source.normalizeTeam || teamKey);
      if (!normalized || !checkMatchRecordQuality(normalized).valid) { excluded++; continue; }
      collected.push(decorate(normalized, source.source, predict));
    }
  }
  const records = deduplicateRecords(collected);
  records.sort((a, b) => a.league.localeCompare(b.league)
    || (Number(b.startTime) || Date.parse(b.startTime) || 0) - (Number(a.startTime) || Date.parse(a.startTime) || 0)
    || a.recordKey.localeCompare(b.recordKey));
  const leagues = new Map(LEAGUE_MATCH_ALGORITHMS.map(algorithm => [algorithm.league, algorithmFor(algorithm.league)]));
  for (const row of records) leagues.set(row.league, row.currentAlgorithm);
  return {
    version: 2,
    updatedAt: datasets.map(data => data.updatedAt).filter(Boolean).sort().at(-1) || null,
    records,
    leagues: [...leagues.values()].map(algorithm => ({ ...algorithm, ...summarize(records.filter(row => row.league === algorithm.league)) }))
      .sort((a, b) => a.league.localeCompare(b.league)),
    summary: summarize(records),
    quality: { excluded, policy: 'Two distinct teams, matching participants, league, finite pre-match back/lay and P/L, and nonzero combined flow.' },
  };
}

async function listMatchDataset(options = {}, deps = {}) {
  const data = await loadMatchDataset(deps);
  const { league = '', status = 'all', search = '', result = 'all', predictionMode = 'active' } = options;
  const q = String(search).trim().toLowerCase();
  const leagueName = league ? algorithmFor(league).league : '';
  const leagueRecords = data.records.filter(row => !leagueName || row.league === leagueName);
  const records = leagueRecords.filter(row => (!status || status === 'all' || row.status === status)
    && (!result || result === 'all' || row[predictionMode === 'training' ? 'trainingComparison' : predictionMode === 'saved' ? 'comparison' : 'currentComparison'] === result)
    && (!q || [row.matchName, row.team1, row.team2, row.league, row.matchId].some(value => String(value || '').toLowerCase().includes(q))));
  const boundedInteger = (value, fallback, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(1, Math.trunc(Number(value)) || fallback)) : fallback;
  const limit = boundedInteger(options.limit, 20, 100);
  const pages = Math.max(1, Math.ceil(records.length / limit));
  const page = boundedInteger(options.page, 1, pages);
  return {
    ...data,
    records: records.slice((page - 1) * limit, page * limit),
    overallSummary: data.summary,
    summary: summarize(leagueRecords),
    pagination: { page, limit, pages, total: records.length },
  };
}

module.exports = { loadMatchDataset, listMatchDataset, comparison };
