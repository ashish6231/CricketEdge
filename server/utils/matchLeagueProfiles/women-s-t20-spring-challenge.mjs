// Independent Spring profile: Legends consensus plus a timestamp-gated
// pre-match trap/support override. Future accuracy remains unvalidated.
import { defineLeagueProfile } from '../leagueProfileRuntime.mjs';

export default defineLeagueProfile({
  "league": "Women's T20 Spring Challenge",
  "algorithmId": "match-women-s-t20-spring-challenge-independent-v1",
  "profileVersion": "spring-t20-trap-support-v2",
  "strategy": "league-rules",
  "parameters": {
    "totalRatio": 1.5,
    "backRatio": 1.4
  },
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
