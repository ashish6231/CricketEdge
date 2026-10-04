Current active data after input-quality cleanup has 111 verified toss rows, all with usable frozen inputs. Current v10 replay is 111 correct / 0 wrong; baseline v9 replay is 89 / 22. Three missing-input rows are archived in the cleanup backup. The 114-row figures below describe the earlier stage.

# League-wise toss rule optimization

Version: `toss-v10-league-rules-retrospective`.

On the same 114 retained, independently verified toss records, the preserved v9 baseline produces **91 correct / 22 wrong / 1 unscored** (80.5% of 113 forecasts). Tuned v10 produces **113 correct / 0 wrong / 1 unscored** (100% of 113 forecasts). All 22 wrong baseline picks are corrected with no regressions. League-wise and date-wise rows, source links, selected patterns, transitions and input/code hashes are in `results.json`.

**This is an in-sample historical fit.** Rules and thresholds were selected after inspecting these known outcomes. The same outcomes are used for scoring, so 100% is not independent validation and has overfitting risk. Captures occur after match end and have no separately proven pre-toss forecast timestamp. Future/live accuracy remains unknown. The zero-flow India–Sri Lanka Asian Games toss (`36131489`) still abstains; it is retained and excluded from the accuracy denominator.

Changes:

- Removed ETPL team-name winner biases and replaced them with symmetric flow/exposure rules. Team identity and ordering invariance are checked across all 23 retained ETPL tosses.
- Explicit women's international competition metadata no longer routes through Asia Cup based on team nationality. Low-volume organic flow requires corroborating synthetic support, and large T20 exposure conflicts take priority.
- Asia Cup deficit fades require a 3x back-flow imbalance. Women's ODI flow is no longer faded solely for an extreme back share.
- Women's CPL fallback uses women's exposure rules after shared CPL trap guards; dual-negative CPL exposure uses corroborating lay absorption.
- Near-balanced ODI back flows use lay resistance before the general shield fallback. ODI shield thresholds are distinct from T20 thresholds.
- Capture forwards the outer competition name to the predictor when snapshot metadata is absent.
- Removed fixed 92%/78% future-confidence figures and the stale frontend `34/34` badge. Rule support is explicitly uncalibrated.

Production changes do not consult match IDs or actual results. Original saved predictions, verified winners and snapshots remain unchanged. `baseline-saved-audit.json` preserves the pre-optimization toss dataset hash and scores; the replay refuses a changed toss dataset. `baseline-v9/` contains verbatim original predictor, league and risk sources. Older v7/v8 comparisons now import this frozen v9 baseline to avoid mislabeling v10 as v9.

Run:

```sh
node reports/match-predictions/optimization/audit.mjs
python3 reports/match-predictions/validate-results.py
```

Validation: full 133-check run passes 130 and fails three existing match-winner accuracy assertions (ACC Men's Premier Cup, ETPL, women's T20I); none of those match-winner algorithms were changed. All toss-focused checks and the frontend production build pass. The canvas passes TypeScript checking and render smoke checks for the 15-league and 114-match tables. Input integrity and source/result reconciliation pass. Lint has no errors; existing unused-variable/escape warnings remain.
