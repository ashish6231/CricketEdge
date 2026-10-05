import { describeCommonFactors, extractMatchFeatures, evaluateNumericTree } from './matchNumericFeatures.mjs';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function evaluateLeagueModel(model, values, baseline) {
  if (model?.correctionTree) {
    const branch = evaluateNumericTree(model.correctionTree, values);
    const correctBaseline = branch.side === 1 && branch.samples >= (model.minSupport || 2);
    return { ...branch, side: correctBaseline ? 1 - baseline : baseline, usedModel: correctBaseline };
  }
  if (model?.tree) {
    const branch = evaluateNumericTree(model.tree, values);
    return branch.samples >= (model.minSupport || 1) ? { ...branch, usedModel: true } : { side: baseline, usedModel: false };
  }
  if (model?.forest?.length) {
    const share = model.forest.filter(tree => evaluateNumericTree(tree, values).side === 1).length / model.forest.length;
    const side = share >= model.consensus ? 1 : 1 - share >= model.consensus ? 0 : baseline;
    return { side, usedModel: side !== baseline, samples: model.forest.length, path: ['League ensemble consensus'] };
  }
  if (model?.neighbors?.length) {
    const scales = [1, 1, 1, 2, 1, 1, 12, 1];
    const nearby = model.neighbors.map(row => ({ ...row, distance: Math.sqrt(row.values.reduce((sum, value, i) => sum + ((value - values[i]) / scales[i]) ** 2, 0)) }))
      .sort((a, b) => a.distance - b.distance).slice(0, model.count);
    if (nearby.length === model.count && nearby.at(-1).distance <= model.radius) {
      return { side: nearby.filter(row => row.side === 1).length > nearby.length / 2 ? 1 : 0, usedModel: true, samples: nearby.length, path: ['Nearby league market-flow profiles'] };
    }
  }
  return { side: baseline, usedModel: false };
}

export function defineLeagueProfile(config) {
  const profile = deepFreeze(config);
  const predict = (snapshot, baseline) => {
    const features = extractMatchFeatures(snapshot);
    if (!features || !baseline) return null;
    const baselineSide = features.teams.findIndex(team => team.index === baseline.winnerIdx);
    const branch = evaluateLeagueModel(profile.model, features.values, baselineSide);
    const useModel = branch.usedModel;
    const winnerIdx = features.teams[branch.side].index;
    return {
      ...baseline,
      winner: snapshot.teamNames[winnerIdx], winnerIdx,
      algorithmId: profile.algorithmId, algorithmLeague: profile.league,
      profileVersion: profile.profileVersion,
      algorithmStrategy: profile.strategy,
      trainingSamples: profile.trainingSamples,
      validation: useModel ? profile.validationStatus : baseline.ruleAdjusted ? baseline.validation : profile.validationStatus,
      modelScope: 'rules',
      reason: useModel ? `${profile.league}: ${branch.path.join('; ') || 'Observed market-flow class'}` : baseline.reason,
      ruleFamily: useModel ? profile.model?.correctionTree ? 'independent-league-correction' : 'independent-league-tree' : baseline.ruleFamily,
      leafSamples: useModel ? branch.samples : null,
      confidence: useModel ? 'League tree; future accuracy uncalibrated' : baseline.confidence,
      confidenceCalibrated: false,
      commonFactors: describeCommonFactors(features, winnerIdx),
    };
  };
  const predictTrainingFit = snapshot => {
    if (!profile.trainingTree) return null;
    const features = extractMatchFeatures(snapshot);
    if (!features) return null;
    const branch = evaluateNumericTree(profile.trainingTree, features.values);
    if (!branch) return null;
    const winnerIdx = features.teams[branch.side].index;
    return {
      winner: snapshot.teamNames[winnerIdx], winnerIdx,
      algorithmId: `${profile.algorithmId}-training-fit`, algorithmLeague: profile.league,
      profileVersion: profile.profileVersion,
      predictorVersion: 'match-v9-cross-market-support',
      trainingSamples: profile.trainingSamples,
      leafSamples: branch.samples,
      reason: `${profile.league} training-fit tree: ${branch.path.join('; ') || 'Single observed market-flow class'}`,
      validation: 'in-sample-training-fit', confidenceCalibrated: false,
      confidence: 'Training fit only; future accuracy unvalidated',
      inputTiming: 'frozen-pre-match-fields', modelScope: 'league-training-fit', mode: 'training-fit',
    };
  };
  return Object.freeze({ ...profile, predict, predictTrainingFit });
}
