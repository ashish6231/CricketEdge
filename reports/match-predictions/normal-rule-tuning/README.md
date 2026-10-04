# Normal league match rules, frozen-input tuning (v4)

The normal default engine is `server/utils/normalLeagueMatchPredictor.mjs`, version `match-v4-prematch-league-rules`. Backend and frontend use the same engine and all 35 saved leagues have independent algorithm IDs/settings. It accepts only normalized frozen preMatchVolume Back/Lay, preMatchPnl and preMatchTotalBets. Later market signals, SimplePL/derivedPL, smart-money fields, three-minute fields, net support, final scores, live trades, IDs, dates and actual winners are excluded from inference. Totals are recomputed from Back + Lay; invalid numeric values are normalized, empty flows and perfectly symmetric inputs abstain.

## Results on the same 225 usable winner records

- Previous v3 mixed-input normal rules: **184 correct / 41 wrong (81.8%)**.
- Frozen base after excluding later fields and recomputing totals: **171 / 54 (76.0%)**.
- Updated normal pre-match rules: **193 / 32 (85.8%)**.

Against the frozen base, adjustments correct 22 misses with zero training regressions. Against the previous mixed-input engine, 18 misses are corrected and nine previously correct picks regress, for nine net additional correct forecasts. Five leagues improve their total score, three regress and 27 are unchanged. The nine regressions are visible, not removed from scoring.

Six leagues have fitted adjustments: European T20 Premier League, Metro Bank Womens One Day Cup, Netherlands Topklasse T20, Sher E Punjab T20 League, Uttar Pradesh Premier League and Womens International Twenty20 Matches. Other leagues retain their own frozen base rules; several have too little data to support reliable tuning. Sher E Punjab recovers its previous 17/17 score using frozen inputs instead of later signals.

After the later user-requested input-quality cleanup, 243 match records remain: 225 usable verified winners and 18 verified No Result matches. The 32 incomplete/both-zero match records are archived, including 25 no-input winner records and seven no-results. Their labels, source evidence, snapshots and original saved predictions are unchanged. No missing-input or no-result case is counted as a pass. Toss algorithm code is unaffected; three missing-pre-match-input toss rows were also archived by this later cleanup, leaving 111.

## Rule search and temporal checks

`preMatchRuleAdjustments.mjs` computes back/lay/total/activity shares, normalized P/L, lay/back ratios, activity surplus, net flow and P/L pressure from frozen numeric fields. Conditions are oriented to market inputs rather than team names or team position. `leaguePreMatchAdjustments.mjs` stores only league settings, numeric conditions, actions and support/selection counts; no fixture IDs, result lookups or team-specific winner rules are used.

The search considers 54,080 fixed-grid condition/action combinations in two libraries (basic flow and expanded pressure/activity). Each league needs six usable cases. There are at most two selected rules, at most two conditions each, at least four supporting cases and at least two training corrections, with no frozen-base training regression. Libraries are selected using internal 67% and 80% chronological development splits and may not underperform the frozen base on either. Some small-league training folds have fewer than six earlier samples, so their unchanged baseline score is not evidence of a successful fitted validation.

The final settings are fitted to all 225 usable cases. **85.8% is an in-sample development replay**, with substantial search/overfitting risk; it is not an independent estimate of future accuracy.

The separate earlier-180/later-45 replay fits the complete selection procedure using only the first 180 cases and scores the later 45: **32 correct / 13 wrong (71.1%)**. This equals the previous mixed-input engine and is one correct above the frozen base (31/14). Expanding-time evaluation fits each forecast using only strictly earlier league outcomes: **173/52 (76.9%)**, versus frozen base 171/54. On the 97 forecasts with at least six earlier league observations, the scores are 77/20 versus 75/22. Equal timestamps are excluded from one another's training sets.

All these records and development outcomes have already been inspected, including comparisons of alternative search libraries. The temporal scores are retrospective diagnostics, not pristine untouched tests or proof of a live improvement. Snapshots were captured after match end; frozen field names alone do not establish when a forecast was issued. New prospective observations are needed to validate future performance. The existing full historical-fit tree remains explicit experimental mode, independent of these normal rules.

## Reproduce and validate

```sh
node reports/match-predictions/normal-rule-tuning/tune.mjs
node reports/match-predictions/match-optimization/audit.mjs
node reports/match-predictions/normal-rule-tuning/audit.mjs
node reports/match-predictions/audit.mjs
python3 reports/match-predictions/validate-results.py
```

The baseline sources and previous 184/41 report are preserved under `baseline/` and `before.json`. `tuning-results.json` contains the search limits, selected settings and per-case chronological/expanding-time diagnostics. `results.json` reconciles every retained record and each league, checks runtime predictions against the tuning replay, and verifies protected data hashes. Original source verification and preserved-field checks pass.

Validation: 17 focused normal-routing/frontend/invariance checks pass; full combined suite passes 157/159 checks. The two remaining ACC and ETPL dataset assertions demand 100% accuracy and still fail on real misses. They were not repointed to fitted-tree mode or weakened into an all-correct claim. Two behavior tests were updated to explicitly distinguish legacy later-signal behavior from the new frozen-input contract. Frontend production build passes; its existing large-chunk advisory remains. Lint has no errors. Canvas TypeScript and render checks pass for 35 league rows, 243 match rows and the temporal/rule tables. No deployment or production process restart was performed.
