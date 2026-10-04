# Emirates D10 snapshot collection

User preference updated on 3 October 2026: one combined Match Dataset tab in
Admin, with only proper saved match snapshots. Separate WNCL/D10 tabs remain
removed. Active records require usable match/toss snapshots. See
`reports/match-predictions/admin-dataset.md`.

`server/data/emirates_d10_dataset.json` now retains three proper snapshot records.
Cleanup removed 44 metadata-only or unusable records from the 47-record file.
The backup and removal manifest are under
`reports/snapshot-only-cleanup/2026-10-03T16-28-59-768Z`.
`initial-series-state.json` remains an archive of the initial provider download,
not an active sample set. The fixture inventory is discovered in memory for
linking; empty fixtures are no longer written into the active dataset.

The independent normal-default algorithm remains
`match-emirates-d10-prematch-rules-v1`, defined in
`server/utils/emiratesD10MatchPredictor.mjs`. No calibrated accuracy claim is
made for this initial market-flow profile. Actual outcomes and later/live
signals cannot change a prediction. Only a genuine forecast issued before
start can be scored against a source-verified actual winner.

Both capture and storage enforce finite Back/Lay volume and P&L for each team,
positive combined flow, and snapshot participants matching the record. Invalid,
failed, both-zero and wrong-team snapshots are excluded. A record with neither
a usable match nor a usable toss snapshot is removed. Newly captured D10 inputs
must now arrive before the deadline while the market is upcoming. Existing
proper snapshots captured after start remain labelled retrospective, without
an invented old prediction. First genuine forecasts and their inputs are
immutable; later valid pre-match inputs are separate. Source outages retain
usable saved records. Manual source verification remains available through the
store's `confirmResult` method with Cricbuzz, official ECB or ESPNcricinfo URLs.
The D10/WNCL Admin tabs, components and dedicated endpoints were removed.

The backend was gracefully restarted to load this policy. Health is OK, and
repeated D10 polls show the market feed available and only three active records;
the old worker no longer recreates metadata-only fixtures.

Configuration:

- `EMIRATES_D10_CAPTURE_INTERVAL_MS`: default 30000; minimum 1000.
- `EMIRATES_D10_SERIES_URLS`: defaults to the current CREX `2NK` season.
- `cd server && npm run sync:emirates-d10` performs one capture.
- `npm run sync:emirates-d10 -- --market-feed` includes authenticated inputs.
- `npm run sync:emirates-d10 -- --series-html /path/to/series.html` uses local
  fixture discovery. No record is saved without a usable snapshot.
- `node server/scripts/clean_tracked_league_snapshots.js` backs up and cleans
  the active D10/WNCL datasets.

Validation: 38 focused tests pass, including snapshot-only persistence,
fixture discovery without insertion, strict quality, team reversal, alias and
provider identity changes, immutable forecasts, late-input rejection, source
outages, verification domains, and non-overlapping workers. Frontend production
build and lint pass with existing warnings; syntax and diff checks pass.
