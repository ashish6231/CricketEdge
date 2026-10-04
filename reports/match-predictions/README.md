## Current input-quality cleanup

At the user's request, 32 match records and three toss records with missing/invalid or both-zero frozen pre-match inputs were removed from active data. Active storage now has **243 match records: 225 verified winners and 18 verified No Result matches**, **111 verified toss records**, and 121 linked cache entries. The combined inventory has 252 IDs in 35 leagues. Every active match/toss row passes the shared data-quality gate. One zero-flow team is allowed when the other team has valid flow; missing numeric values are not treated as valid zeros.

Removed records and the prior files/reports are backed up at the path recorded in `pre-match-quality-cleanup.json`. Retained rows are byte-for-byte equivalent as JSON objects to their backed-up versions; actual winners and saved predictions were not rewritten. The capture workers now skip incomplete/both-zero pre-match snapshots and count failed feeds without adding null-snapshot records.

Normal match replay remains **193 correct / 32 wrong (85.8%)** on the same 225 usable winner cases. Saved original match forecasts on this active subset score 174 / 51 (77.3%). Current toss replay is **111 / 0**, an in-sample tuned result; original saved toss forecasts score 84 / 27 (75.7%). Removing unscored inputs does not count them as successful predictions or establish future accuracy.

Run `node reports/match-predictions/clean-pre-match-data.mjs` to apply the same cleanup policy; it is a no-op when no invalid rows remain. The immutable pre-optimization hashes remain unchanged; `active-data-hashes.mjs` validates the authorized subset, backup lineage and unchanged retained records.

## Current normal match algorithm tuning (v4)

See `normal-rule-tuning/README.md` and `normal-rule-tuning/results.json`. All 35 league routes now accept only normalized frozen pre-match Back/Lay, P/L and activity fields. Six leagues receive independently selected rule adjustments. The shared backend/frontend normal engine scores **193 correct / 32 wrong (85.8%)** on 225 usable verified-winner records, versus previous default **184 / 41 (81.8%)**. Removing later derived/live fields first reduced the base to **171 / 54 (76.0%)**; tuning corrects 22 of those frozen-base misses with zero frozen-base training regressions. Relative to the old mixed-input engine, 18 misses are corrected and nine old correct picks regress, for nine net additional correct forecasts.

These final rules were selected using the known data; 85.8% is an in-sample retrospective score. Training earlier 180 records and replaying later 45 gives **32 / 13**, the same as the previous default and one correct above the frozen base. Expanding-time replay, fitting only strictly earlier outcomes, gives **173 / 52** versus frozen base 171 / 54. On the 97 cases with six or more earlier league samples, this is 77 / 20 versus 75 / 22. The development data and search were already inspected; this does not establish future/live improvement.

The active report has 243 records: 225 usable verified-winner cases and 18 No Result cases. The 32 invalid/zero-input match rows were archived during the authorized cleanup. Original saved forecasts and independently verified outcomes are preserved. The full historical-fit tree remains a separate explicit experiment; it fits 225 / 225 known cases but its separate chronological test was only 28 / 45.

## Toss rule optimization (v10)

The latest before/after report is `optimization/results.json` (run `node reports/match-predictions/optimization/audit.mjs`). On the current 111 retained verified toss snapshots, v9 produces 89 correct / 22 wrong; tuned v10 produces 111 correct / 0 wrong. The earlier 114-record replay is retained in the cleanup backup. All 22 misses are corrected with zero regressions. Original predictions, snapshots and actual winners are preserved.

This is an **in-sample retrospective fit**: rules were tuned after examining these outcomes. It is not held-out validation and does not prove live pre-toss or future accuracy. Snapshots were captured after match end. The zero-flow India–Sri Lanka toss (`36131489`) and two other missing-pre-match-input toss rows are archived rather than kept in active data. Artificial numerical confidence and the stale frontend 34/34 claim were removed.

The v7/v8 comparison is preserved against the **original v9 baseline**, even after v10 optimization. Baseline source is stored verbatim under `optimization/baseline-v9`. See `optimization/README.md` for changes and validation.

# Earlier result-verification cleanup (before the latest input-quality cleanup)

Active data now contains 275 match records: 250 confirmed winners and 25 confirmed no-results. There are 114 independently verified toss records, 10 of which have no separate match dataset record. The combined inventory covers 285 match IDs in 35 leagues. All active outcomes have source evidence; no unresolved, cache-only, or synthetic fixture records remain.

Removed from active files: 93 incomplete/test match records, 4 incomplete toss records, and 99 cache entries. The remaining 142 cache entries belong to retained match or toss IDs. Original records and the earlier full audit are preserved in `reports/match-predictions/backups/cleanup-20261001T185001Z`. Details and removed IDs are in `cleanup-manifest.json`.

Cricbuzz match headers independently confirmed all 114 retained toss winners. Sixteen existing toss-winner labels were corrected and 18 previously pending toss outcomes were confirmed. One retained toss has no saved prediction and is unscored. Saved toss predictions: 86 correct, 27 wrong out of 113 scored (76.1%). The old 94.8% figure was based on unverified saved labels and is superseded.

Saved match predictions: 196 correct, 54 wrong out of 250 scored (78.4%). The pre-optimization server replay was 199 correct, 51 wrong (79.6%); it included 25 zero-input guesses. The latest default-rule result above uses 225 usable forecasts. Wrong predictions with verified outcomes remain in the data. Retained prediction and snapshot fields were not changed. Confirmed no-results are kept as accurate result records but excluded from accuracy.

`server/data/verified_match_results.json` and `server/data/verified_toss_results.json` store the active verification ledgers. Each result has a direct source URL. `results.json` and `league-wise-results.md` describe the cleaned active inventory. The interactive tables also include verified toss outcomes.

Refresh the report and check the current saved data:

```sh
node reports/match-predictions/audit.mjs
python3 reports/match-predictions/validate-results.py
```

The source catalogs contain independently published fixtures. The original inventory in `initial-results.json` is retained as historical audit evidence, and the verifier restricts it to active IDs so deleted records are not reintroduced. Scripts do not fetch fresh scorecards automatically.

Algorithm checks found server/page disagreements, use of fields outside frozen pre-match inputs, a zero-volume confidence default, and a duplicate Kerala function. The prior algorithm test run had 38 passing server tests and one failing ETPL accuracy assertion; frontend tests had 21 passing. Cleanup and canvas verification pass. That initial audit did not tune algorithms; the subsequent v10 optimization above does tune against known outcomes and is reported separately. Captures occur after match end and lack a separate forecast-issued timestamp, so these figures establish historical agreement, not prospective forecasting accuracy.

## Common pre-match factor audit and v8 league rules

`independent-leagues/common-factor-analysis.mjs` evaluates all **232 independently verified winner snapshots** currently eligible for modelling. It only reads the frozen pre-match Back/Lay volume, P/L and total-bet fields. Match IDs, dates, team identity, final scores, live fields and actual winners are excluded from the predictor inputs.

The shared descriptive signal is **relative market-flow dominance**: which team leads total flow, Back flow and Lay flow, interpreted with relative P/L and activity. Used alone, total flow scores 148 / 232 (63.8%), Back flow 149 / 232 (64.2%) and Lay flow 147 / 232 (63.4%). On the latest chronological 47 records those scores are 61.7%, 63.8% and 59.6%. A global correction tree found no validated flips, so no universal override was activated.

All 42 league profiles were re-evaluated. Eight profiles now have league-local rules: European T20 Premier League, Metro Bank Womens One Day Cup, Netherlands Topklasse T20, One Day Internationals, Sher E Punjab T20 League, Tamil Nadu Premier League, Uttar Pradesh Premier League and Womens International Twenty20 Matches. On walk-forward cases with enough prior league history, the tuned rules score 79 / 98 versus 76 / 98 for the frozen base. The full current replay is 204 / 232 (87.9%); the latest 47-record block is 36 / 47 (76.6%). These remain retrospective development figures. Leagues with too little evidence keep their independent baseline profile until more verified snapshots arrive.

The men’s ODI profile has a narrow extreme-flow guard prompted by the India v West Indies miss (`36137653`). The old rule selected India from 96.2% total-flow dominance even though its activity share was only 13.3%. In the five verified men’s ODI snapshots, all three cases with a 90–97.5% total-flow back leader were won by the opposite side, while the separate 98%+ case was won by the leader. The guard therefore fades the back leader only inside the 90–97.5% band. It needs two earlier zero-regression examples before activation; in expanding-time replay those two earlier misses activate the guard and it selects West Indies for the next match. This is a three-example retrospective pattern and needs prospective confirmation.

The v8 failure audit freezes all 232 v7 predictions and compares the new algorithm match by match. A TNPL low-volume pattern corrected three failures after two earlier zero-regression examples; all 201 previously correct v7 predictions stayed correct. The result is three corrections, zero regressions and 28 retained failures. Every old failure, its feature vector and its final status are recorded in `failure-audit/results.json`. The remaining cases were reviewed but were not force-fitted when they lacked repeatable chronological evidence.

Every v6 prediction now includes a `commonFactors` explanation with the dominant team, Back/Lay/total shares, activity share, normalized P/L gap and agreement between the selected prediction and the three flow signals. This metadata is descriptive and does not expose a calibrated probability. Regenerate the audit with `node reports/match-predictions/independent-leagues/common-factor-analysis.mjs`.
