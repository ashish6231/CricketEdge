# Legends toss factor comparison

Source: current `PredictionRecord` database archive, dataset `tosses`, World Championship of Legends T20. The sanitized extraction is in `inputs.json`; run `node reports/legends-toss-analysis/analyze.mjs` to reproduce `results.json`.

There are 9 records: 8 verified outcomes (3 saved-prediction passes, 5 failures), plus 1 abandoned outcome excluded from scoring. This report compares the saved selected team with its opponent, then separately examines every actual winner. It does not alter an algorithm or a confirmed result.

All three passed selections have higher back volume and pre-match activity, negative pre-match P/L versus positive opponent P/L, higher net exposure, higher own lay volume with lay present on both teams, and agreeing synthetic support. The same full conjunction also holds for the failed England selection against India: four matching selections, three passes and one failure. These related market quantities must not be counted as independent confirmations.

The three passes have back leads of 1.45–2.45 times the opponent, while the England counterexample has a 5.14-times lead. Those are observed ranges after inspecting outcomes, not validated thresholds. India against South Africa also had a 2.03-times back lead and negative P/L, but no lay volume on either team, and failed.

All eight scored snapshots were captured after their listed start time. The `preMatch*` fields are the provider's saved fields; the accompanying bookmaker exposure and synthetic-support fields have no separate verified pre-toss timestamp. Findings are retrospective associations in a small sample and do not establish causation or future accuracy.

## Exploratory reconstruction

Run `node reports/legends-toss-analysis/hypotheses.mjs` to reproduce `exploratory-rules.json`. Starting with the higher positive net-exposure / negative-P/L team gives 6/8 historical hits. Two exceptions—leader lay/back at least 10%, or both lays zero with leader back lead below 3×—reconstruct 8/8. Each exception is supported by just one match. The features and cutoffs were selected after inspecting all outcomes; no independent test set exists. This is not a validated accuracy result.

The user subsequently selected this rule for future World Championship of Legends toss predictions. The shared implementation is `server/utils/worldLegendsTossAlgorithm.js`, version `toss-world-legends-exposure-lay-v1`; both frontend and backend route explicit World Legends metadata to it. Missing or inconsistent exposure/P&L/volume inputs abstain without a generic fallback. Original archived predictions are preserved. Cloud deployment remains deferred at the user's request.
