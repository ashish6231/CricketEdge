# Legends match-winner pass/fail report

10 original saved predictions from `PredictionRecord / matches`, queried 16 October 2026. Public match results were checked separately: **4 pass, 4 fail, 2 excluded (cancelled/postponed)**. Historical hit rate among 8 scored picks: **50%**.

`inputs.json` contains sanitized saved prediction metadata. `analyze.mjs` combines it with reviewed public outcomes and source links to reproduce `results.json`:

```sh
node reports/legends-match-report/analyze.mjs
```

Actual-winner fields in all 10 database records were pending at query time; generating this report does not modify them. National Champions names published by result sites are mapped to the corresponding saved Legends participant names. Only saved fixtures are covered. Original predictions span multiple algorithm versions and have not been replaced with current algorithm replay picks.

All 10 snapshots were captured after their listed start, so the result is a retrospective comparison rather than verified pre-match live accuracy. The new Legends toss rule is separate from the match-winner algorithm.
