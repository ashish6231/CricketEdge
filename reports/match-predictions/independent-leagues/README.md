# Independent league profiles and validation

All 42 leagues in the admin dataset selector have their own generated `.mjs` module under `server/utils/matchLeagueProfiles/`. Each exports an immutable profile and its own predictor closure, algorithm ID, parameters, league adjustments, trained reference tree and profile hash. A change to one league's model invalidates that league's browser prediction lock. Backend feeds, frontend match-start predictions and future saved captures use the same league router by default.

The active strategy is selected independently for each league. Candidate rules, shallow/full trees, guarded trees, baseline-correction trees, small forests and nearest-neighbor profiles are compared on 60% and 80% chronological development splits. A new strategy must improve one split, avoid regression on either split, and avoid regression on the full historical replay. Leagues with fewer than six verified examples retain their own rules profile and disclose limited history; WNCL and Emirates D10 currently have no independently verified training examples and do not claim trained accuracy.

The current selection uses a league-trained decision tree for International Twenty20 Matches. The other 41 modules retain their own frozen league rules and adjustments because the alternative models did not meet the selection checks. Separate modules do not imply that all leagues need different mathematical primitives.

On 232 verified usable winners, active replay improves from **196 correct / 36 missed (84.5%)** to **198 / 34 (85.3%)**. Independent reference trees fitted to all the same examples reproduce **232 / 232 (100%)**; this is explicitly an in-sample training fit. Those trees are visible through the admin “Training fit” view and are not silently substituted for the selected live algorithm. The near-100% active/future target is not supported by the available data.

The complete selection procedure replayed with strictly earlier league labels produces **195 / 37 (84.1%)**, versus the fixed rules profile's **196 / 36 (84.5%)**. The diagnostic does not show an overall future improvement. The global 80/20 earlier/later diagnostic and per-league folds are recorded in `results.json`. All these matches and the rules had already been inspected during development, so temporal results are retrospective diagnostics, not untouched tests. Some specialist rules themselves originated in prior dataset tuning. Saved snapshots were also captured after match end; frozen field names alone do not establish that a forecast was issued before the match.

Prediction features contain only frozen numeric pre-match back/lay volumes, P/L and activity. Team names supply output labels; names, IDs, dates, actual winners, final scores and live metrics are not decision inputs. Actual results are used only during offline fitting and comparison. Original snapshots and saved winner labels are not rewritten.

Reproduce profiles and checks:

```sh
node reports/match-predictions/independent-leagues/train.mjs
cd server
node --test tests/independentLeagueProfiles.test.js tests/preMatchRuleTuning.test.js tests/normalLeagueRouting.test.js
```

The admin interface uses a full-width league selector, a searchable league algorithm directory, larger responsive match rows, three clearly labeled comparison views, and a snapshot drawer. It exposes actual misses, pending verification and no-result matches. New prospective data is needed to estimate future accuracy.

Validation: 71 targeted backend routing, capture, quality and dataset checks pass, and 9 frontend predictor checks pass. The frontend production build and changed admin components pass compilation/lint. The redesigned desktop league selector, profile directory and a 390-pixel mobile summary were inspected. Snapshot opening/Escape dismissal, training comparison and the empty WNCL state were checked before the layout refresh. Among 39 additional legacy league checks, 37 pass; the existing ACC and ETPL 100%-historical-accuracy assertions still fail on real misses and have not been weakened.

The training command now includes source-verified winners from the main, WNCL and Emirates D10 stores through the admin quality/deduplication service. Result labels that are only reported remain excluded. Before-start forecast statistics require a stored forecast, the explicit before-start timing label, and a capture timestamp strictly earlier than kickoff. They use the original issued forecast and verified outcome, not the current model replay. There are currently two eligible forecasts awaiting results and no verified prospective score. Correction-tree candidates were evaluated in the same development splits; none improved the selection, so the active replay remains 198/232.

The 4 October reconciliation inspected all 27 matches currently marked ended by the market feed. It saved 25 complete snapshots and rejected two European Cricket Series matches whose frozen pre-match flow was missing or zero. The India–West Indies ODI (`36137653`) was absent from that feed but recovered by exact ID from the completed toss record and saved from the proper cricket snapshot endpoint, bringing the added total to 26. Seven published winners were attached with public CREX evidence. Five newly observed leagues now have dedicated profiles: European Cricket Series, Canada Super 60, Canada Super 60 Women, CSA Womens Pro50, and World Championship of Legends T20.
