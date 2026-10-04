# Independently checked match results

The report covers all 431 real unique saved match IDs across 44 named leagues and one unknown-league group. One synthetic fixture is excluded. Predictions and snapshots are preserved.

289 results are independently confirmed: 260 winners and 29 no-results. 250 confirmed winners have saved match predictions: 196 correct, 54 wrong (78.4%). Current server replay: 199 correct, 51 wrong (79.6%). The other confirmed winners have only toss records and no saved match prediction.

142 results remain unresolved: 50 cache records without dates, 91 dated fixtures without a matching result in approved sources, and one official fixture without a final result. These are excluded from accuracy. Seven previously nonempty winner labels changed to a different team; three changed to no-result. Nine previously verified labels were downgraded to pending because an approved independent source could not confirm them.

Confirmed sources: Cricbuzz 212, league official 39, ECB official 22, KNCB official 14, ICC official 2. Each confirmed row includes its source URL and published result statement. `source-results.json` and `fallback-results.json` contain the source fixture catalogs; `verified-results.json` is the matching ledger. The saved copy is `server/data/verified_match_results.json`.

Unavailable sources include incomplete official result widgets and blocked public scorecard pages. Kerala's saved August 14 fixture precedes the published 2026 season and was left unresolved. Official Odisha fixtures remained marked upcoming and did not provide a winner. No winner was inferred from a prediction, odds, a toss outcome, tournament champion, or an unapproved secondary site.

The backup location and before/after hashes are in `save-manifest.json`. Updated match records include `resultVerification`; changed fields retain their prior values in `resultLabelHistory`. Toss records and the market cache are unchanged.

Recheck against the downloaded source catalogs:

```sh
python3 reports/match-predictions/verify-results.py
node reports/match-predictions/audit.mjs
python3 reports/match-predictions/validate-results.py
```

To save newly reviewed ledger results, run `save-verified-results.py` before regenerating the report. It creates a new backup and verifies that prediction and snapshot fields remain intact. These scripts do not download fresh scorecards; refresh source catalogs before auditing newer matches.

The algorithm review found server/page disagreements, dependence on fields outside frozen pre-match inputs, a zero-volume confidence default, and a duplicate Kerala function. Existing server algorithm tests had 38 passing and one failing ETPL accuracy assertion; frontend tests had 21 passing. No algorithm was tuned against observed winners. Capture occurs after match end and lacks a separately recorded forecast-issued timestamp, so these rates establish historical agreement rather than prospective forecasting performance.
