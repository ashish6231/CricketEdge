// Spring uses exactly one signal: the lower frozen pre-match reported activity.
import { defineLeagueProfile } from '../leagueProfileRuntime.mjs';
import { getWomensSpringMatchPrediction } from '../womensSpringMatchPredictor.mjs';

const profile = defineLeagueProfile({
  "league": "Women's T20 Spring Challenge",
  "algorithmId": "match-women-s-t20-spring-challenge-independent-v1",
  "profileVersion": "spring-t20-lower-reported-activity-v4",
  "strategy": "lower-prematch-reported-activity",
  "parameters": {},
  "baselineAdjustments": [],
  "model": null,
  "trainingTree": null,
  "trainingSamples": 0,
  "ranges": null,
  "validationStatus": "awaiting-data",
  "evaluation": {
    "baseline": {
      "total": 0,
      "correct": 0,
      "wrong": 0,
      "accuracy": null
    },
    "replay": {
      "total": 0,
      "correct": 0,
      "wrong": 0,
      "accuracy": null
    },
    "trainingFit": {
      "total": 0,
      "correct": 0,
      "wrong": 0,
      "accuracy": null
    },
    "walkForward": {
      "total": 0,
      "correct": 0,
      "wrong": 0,
      "accuracy": null
    },
    "walkForwardBaseline": {
      "total": 0,
      "correct": 0,
      "wrong": 0,
      "accuracy": null
    },
    "developmentFolds": [],
    "selection": "awaiting-data"
  }
});

export default Object.freeze({ ...profile, predict(snapshot) {
  const result = getWomensSpringMatchPrediction(snapshot);
  return result ? { ...result, algorithmId: profile.algorithmId, algorithmLeague: profile.league,
    profileVersion: profile.profileVersion, algorithmStrategy: profile.strategy,
    validation: profile.validationStatus, trainingSamples: 0 } : null;
} });
