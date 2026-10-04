# WNCL snapshot collection

User preference updated on 3 October 2026: one combined Match Dataset tab in
Admin, with only proper saved match snapshots. Separate WNCL/D10 tabs remain
removed. See `reports/match-predictions/admin-dataset.md`.

`server/data/wncl_dataset.json` contains zero records at cleanup: none of the
43 discovered season fixtures had usable WNCL market inputs. Discovery fixtures
remain in memory for matching; they are not saved as empty or zero-filled samples.
The original provider payload in `initial-series-state.json` and the cleanup
backup are historical archives, not active prediction or training data.

The separate normal-default algorithm remains `match-wncl-prematch-rules-v1` in
`server/utils/wnclMatchPredictor.mjs`. It has independent parameters and no measured
WNCL accuracy yet. The algorithm cannot read actual outcomes or live signals.

A stored match/toss snapshot must have finite Back/Lay volume and P&L for both
teams, positive combined flow, and participants matching the fixture. Missing,
failed, wrong-team and both-zero data is skipped. New WNCL inputs must arrive
before the market deadline and while the fixture is upcoming. Response time and
prediction issuance time are checked independently. The first issued prediction
and its exact inputs remain immutable; later valid pre-match inputs are separate.
Valid toss inputs may be saved, without claiming a separate WNCL toss algorithm.

Capture and storage both enforce the snapshot-only rule, including updates to
legacy files. A record with neither a valid match snapshot nor a valid toss
snapshot is removed. Invalid market/latest snapshots are excluded. Existing
usable records survive feed outages and provider identity or alias changes.
CREX-reported winners are not automatically verified. `confirmResult` in the
store remains available for source-checked completed results using Cricbuzz,
Cricket Australia or ESPNcricinfo evidence. The league's Admin components and
endpoints have been removed. Scoring still requires a verified result and a
valid forecast issued before start; no retrospective forecasts are invented.

The backend was gracefully restarted on 3 October to load the new rules. Its
health endpoint responds successfully. Repeated polls show the market feed is
available, 43 WNCL fixtures discovered, no WNCL feed matches, and zero stored
WNCL records. Future usable pre-match snapshots will save automatically.

Configuration and scripts:

- `WNCL_CAPTURE_INTERVAL_MS`: default 30000; minimum 1000.
- `WNCL_SERIES_URLS`: defaults to the 2026–27 CREX `2NG` season.
- `cd server && npm run sync:wncl` refreshes discovery and saved records.
- `npm run sync:wncl -- --market-feed` also requests authenticated market inputs.
- `npm run sync:wncl -- --series-html /path/to/series.html` uses a downloaded
  series page for discovery. It creates no records without usable snapshots.
- `node server/scripts/clean_tracked_league_snapshots.js` backs up and cleans
  WNCL/D10 active files and audits existing match/toss snapshot quality.

Cleanup backup: `reports/snapshot-only-cleanup/2026-10-03T16-28-59-768Z`.
WNCL removed 43 metadata-only records. D10 removed 44 and retained three usable
snapshot records. Existing main datasets contained 243 match and 113 toss
records, all passing the quality gate; they were audited without rewriting.

Validation: 38 focused tests pass across WNCL, D10, snapshot-only persistence,
normal routing, frozen rules and frontend predictions. Production build and lint
pass with existing warnings. Syntax checks and `git diff --check` pass.
