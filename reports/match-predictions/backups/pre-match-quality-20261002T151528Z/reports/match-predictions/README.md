## Current normal match algorithm tuning (v4)

See `normal-rule-tuning/README.md` and `normal-rule-tuning/results.json`. All 35 league routes now accept only normalized frozen pre-match Back/Lay, P/L and activity fields. Six leagues receive independently selected rule adjustments. The shared backend/frontend normal engine scores **193 correct / 32 wrong (85.8%)** on 225 usable verified-winner records, versus previous default **184 / 41 (81.8%)**. Removing later derived/live fields first reduced the base to **171 / 54 (76.0%)**; tuning corrects 22 of those frozen-base misses with zero frozen-base training regressions. Relative to the old mixed-input engine, 18 misses are corrected and nine old correct picks regress, for nine net additional correct forecasts.

These final rules were selected using the known data; 85.8% is an in-sample retrospective score. Training earlier 180 records and replaying later 45 gives **32 / 13**, the same as the previous default and one correct above the frozen base. Expanding-time replay, fitting only strictly earlier outcomes, gives **173 / 52** versus frozen base 171 / 54. On the 97 cases with six or more earlier league samples, this is 77 / 20 versus 75 / 22. The development data and search were already inspected; this does not establish future/live improvement.

All 275 records remain: 25 verified-winner records without usable frozen inputs abstain and 25 No Result records are excluded from winner accuracy. Original saved forecasts and independently verified outcomes are preserved. The full historical-fit tree remains a separate explicit experiment; it fits 225 / 225 known cases but its separate chronological test was only 28 / 45.

## Toss rule optimization (v10)

The latest before/after report is `optimization/results.json` (run `node reports/match-predictions/optimization/audit.mjs`). On the same 114 retained verified toss snapshots, v9 produces 91 correct / 22 wrong / 1 unscored; tuned v10 produces 113 correct / 0 wrong / 1 unscored. All 22 misses are corrected with zero regressions. Original predictions, snapshots and actual winners are preserved.

This is an **in-sample retrospective fit**: rules were tuned after examining these outcomes. It is not held-out validation and does not prove live pre-toss or future accuracy. Snapshots were captured after match end. The zero-flow India–Sri Lanka match (`36131489`) cannot be forecast from the stored inputs and remains unscored. Artificial numerical confidence and the stale frontend 34/34 claim were removed.

The v7/v8 comparison is preserved against the **original v9 baseline**, even after v10 optimization. Baseline source is stored verbatim under `optimization/baseline-v9`. See `optimization/README.md` for changes and validation.

# Verified match and toss data after cleanup

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
