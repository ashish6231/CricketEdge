# Toss flow validation protocol, version 1

Purpose: investigate both teams' Back/Lay stakes and odds-weighted liabilities without chasing historical accuracy. This is research, not a production change.

Frozen design before first model run:

- Primary sample: two-runner, positive-volume, valid per-odds snapshots with independent stored result-source evidence matching the saved actual toss winner. Status-only verified labels are a separate sensitivity sample. Pending outcomes, including the observed 10–11 October sequence, are not inferred from P/L.
- Primary data timing: market ledger as retained. Capture time and trade timestamps are audited separately. A timestamp on an aggregate price row cannot establish that its entire stake was available at that time. No claim of authentic pre-toss validation without a timestamped pre-toss snapshot and forecast.
- No winner-relative features, team names, match IDs, league IDs, calendar dates, stored predictions, or provider signals in learned inputs. Labels are joined after extracting features. Swap symmetry is enforced.
- Compare eight fixed directional rules, chance probabilities, nine L2 logistic models (three fixed feature groups and three fixed penalties), and four shallow trees (depth 1–2, minimum leaf 12–20 original-sample equivalents).
- Four expanding chronological outer tests grouped by IST date. Initial 40% of unique dates is the first training window; the remaining dates are divided into four test blocks. Same-day outcomes never cross a boundary. Hyperparameters and feature-family selection use only three earlier-date inner folds and Brier loss, with a one-standard-error preference for simplicity.
- All retained historical data has already been examined in previous development. These are retrospective chronological replays, not a newly untouched holdout. Later reconstruction of corrected labels is also retrospective.
- Report fold accuracy, abstention and coverage, Brier loss, log loss, Wilson accuracy intervals, train/test gaps, and learning-curve diagnostics. A random probability of 0.5 is a no-pick baseline, not a 100% coverage forecast.
- Report descriptive single-factor associations separately. Correct for testing multiple rules with a sign-flip null test of the maximum rule accuracy; resample by calendar date for uncertainty when feasible.
- Test label-shuffled controls, both-team swap invariance, and removal of each factor family. No new threshold sweeps after looking at outer-test results.
- Stop optimizing this fixed historical sample if improvements do not generalize across chronological blocks or data provenance cannot establish pre-toss availability. Do not keep adding rules until a desired score appears. Freeze the protocol and require new pre-toss evidence for further claims.

References: scikit-learn documentation on nested cross-validation and leakage:
https://scikit-learn.org/stable/auto_examples/model_selection/plot_nested_cross_validation_iris.html
https://scikit-learn.org/stable/common_pitfalls.html
