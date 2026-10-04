Current active data after input-quality cleanup contains 243 match records (225 usable winners, 18 No Result). Missing/both-zero cases described below are historical records in the cleanup backup; the current `results.json` excludes them. See `../pre-match-quality-cleanup.json` and `../normal-rule-tuning/README.md`.

# League-wise match algorithm optimization

Current normal-mode tuning is documented in `../normal-rule-tuning/README.md`: v4 scores 193 correct / 32 wrong (85.8%) on 225 usable records, using frozen inputs only. The v3 figures below describe the earlier routing stage; `results.json` is refreshed against the current predictor.

All 275 retained match records are preserved: 250 independently verified match winners and 25 No Result records. Among the winner records, 225 have usable frozen market inputs and 25 have zero frozen Back/Lay and P/L. None were removed or relabeled. Original saved predictions remain unchanged.

On the **same 225 usable records**, baseline rules produce 178 correct / 47 wrong (79.1%). The earlier v3 default rules produced 184 correct / 41 wrong (81.8%): eight corrections and two regressions. The original 199 / 51 score used 250 forecasts, including 25 zero-input guesses (21 correct and four wrong); it has a different denominator and should not be directly compared with the updated accuracy.

An explicitly selected **historical-fit** model covers all 35 league groups and fits 225 / 225 usable records, with zero incorrect training predictions. This is 90% forecast coverage of the 250 winner records, not 250 / 250 correct. The 25 zero-input winner records abstain and remain visible. The other 25 records are No Result and have no winner to score.

## Validation matters

The tree learner uses only frozen numeric preMatchVolume, preMatchPnl and preMatchTotalBets fields. Labels are used during fitting only. Runtime inference does not consult match IDs, dates, team identity, actual winners, scorecards, live trades, final odds, or in-play signals. Teams are oriented by market metrics; name and position invariance are tested.

One fixed 80/20 chronological validation fits the first 180 usable snapshots and evaluates the last 45. It achieves **28 correct / 17 wrong (62.2%)**, against legacy baseline 29 / 16 (64.4%). No holdout label was used to fit that model or select hyperparameters. The separate final model subsequently fits all 225 cases, including that holdout. Its 100% score is therefore in-sample, and some leaves contain just one observation. It must not be treated as future/live accuracy or calibrated confidence.

Default rule changes were made after looking at historical failures. Replaying those updated rules on the same later 45 cases gives 32 / 13, but this is explicitly a post-hoc development score, not another independent test. The earlier v3 wrapper still supplied some derived fields whose pre-match timing was unproven. The current v4 normal wrapper excludes those fields entirely. All snapshots were captured after match end; even frozen field names do not independently prove when forecasts were issued.

Because the learned model did not outperform baseline in chronological validation, it is **not the live default**. It remains a concrete, available historical-fit mode for analysis. Current default rule predictions retain real misses in the report; no all-match live guarantee is made.

## Normal default league routing

The selected default is `rules` (now `match-v4-prematch-league-rules`; previously `match-v3-normal-league-rules`). `server/utils/normalLeagueMatchPredictor.mjs` holds 35 separate league entries with unique algorithm IDs and independent parameter objects. Existing specialist rules remain; other leagues start from independently configurable copies of the common market-flow profile. This is not a claim that all 35 use different mathematics or have separately validated accuracy.

The backend and frontend match-start card call the same engine. Explicit league metadata takes priority over team nationality, so Asian women's international matches no longer enter the Asia Cup handler automatically. This correct routing lowers the earlier 186/39 development replay by two correct cases to 184/41; outcomes and frozen snapshots were not changed. New prediction metadata includes `algorithmId`, `algorithmLeague`, `mode`, and `ruleFamily`. Unknown leagues disclose an unregistered fallback. Versioned browser lock storage prevents an old generic/fitted pick from remaining selected after this change.

The experimental fitted model is loaded by the server only for explicit historical-fit calls. It cannot override a normal-mode pick. No production deployment or process restart is included.

## Code changes

- Added generated numeric decision trees for each league and a global fallback in server/utils/matchLeagueModels.js; feature extraction and inference are in matchLeagueModel.js.
- Added explicit `predictMatchWinner(snapshot, {mode: 'historical-fit'})` and `predictMatchStart(snapshot, {mode: 'historical-fit'})` modes. Calls without that option retain default rules.
- Default backend predictions abstain when frozen flow is zero, use volume-derived P/L instead of the wrapper's live fallback when frozen P/L is missing, and avoid an unconditional international-T20 public-overload fade.
- Removed the unbounded match-ID metrics cache, which could freeze an incomplete first response, and the shadowed duplicate Kerala function.
- Numeric confidence percentages in the backend and frontend match-start paths are no longer presented as calibrated probabilities. Experimental results are explicitly labeled in-sample and uncalibrated. Empty frozen frontend volumes also abstain, and payload metadata clears stale AI forecasts when inputs become unusable.

## Reproduction

```sh
node reports/match-predictions/match-optimization/train.mjs
node reports/match-predictions/match-optimization/audit.mjs
node reports/match-predictions/audit.mjs
python3 reports/match-predictions/validate-results.py
```

`train.mjs` reproduces the fixed chronological evaluation and the separate final fit. `audit.mjs` compares baseline, updated rules and historical-fit mode across all 275 records, reconciles all league totals, checks predictor mutation, and checks original input hashes. Full baseline predictor sources and the original 199/51 audit are saved under baseline/ and baseline-results.json.

Prior v3 validation: nine model/integrity tests, four normal-routing tests and eight frontend prediction tests pass; production build passes. Full combined suite: 151 / 154 checks pass; the three existing default-rule 100% accuracy assertions still fail (ACC, ETPL and women's T20I). They are not repointed at training-fit mode to manufacture a green default-accuracy claim. Those misses remain visible in results.json. Canvas TypeScript and render checks pass for 35 league rows, 275 match rows and the validation comparison. Lint has no errors; pre-existing frontend warnings remain. Saved-data hash, source verification and protected-field integrity checks pass.
