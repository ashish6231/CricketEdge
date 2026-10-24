# TennisLiveLoad: preliminary behavioral reconstruction

Investigation date: 20 October 2026 (India time).

The live homepage and `/tennis` route returned Cloudflare 502 responses during inspection. The search index exposes a landing page advertising cricket, tennis and session-market analytics; indexed `/tennis` navigation redirects to login. No signed-in target UI, JavaScript bundle or successful live API response has been captured in this investigation yet.

This report combines public observations with existing **local integration code** and **historical, locally retained cricket snapshots**. It is not the target's source code. Archived records may have been transformed by the local application. Numeric identities below reconstruct the saved outputs, not the complete provider implementation or its present behavior on tennis markets.

## What is established

- The public site advertises live odds, volume analysis, P/L snapshots, tennis point-by-point trades, market load and session/fancy markets. Source: <https://tennisliveload.com/>.
- The existing local adapter calls JSON endpoints with a session cookie and `matchId` query parameter. Source: `server/services/scraper-tennisliveload/adapter.js`.
- The adapter declares `/api/cricket/matches`, `/api/cricket/snapshot`, `/api/tennis/matches`, `/api/tennis/snapshot`, `/api/session/matches`, `/api/session/trades`, `/api/toss/matches`, `/api/toss/snapshot`, and `/api/live-odds`. This is a local API contract, not fresh verification that every endpoint exists today.
- The local application obtains lists and snapshots by HTTP polling, merges live runner prices, enqueues normalization jobs, caches results and broadcasts to its own clients. Its worker defaults to a 10-second interval, with slower idle polling. This describes this workspace's integration; the provider's browser update mechanism and cadence remain unknown.
- Cookie naming (`cricket_live_load_session`) and renewal handling are present locally. The actual authentication implementation remains unverified. No login was performed, and no saved credential was read or transmitted.

## Recovered numeric relationships

The offline checker examined 275 two-team cricket snapshots dated 15 August–27 September 2026. It tested 21 candidate identities: 18 reproduced all eligible records, while three did not. The support percentage has 274 eligible records because one snapshot has zero stakes. Tolerance: absolute 0.02 or relative 1e-8. Units are those retained in the source; no currency conversion was inferred.

Let `B_A` and `L_A` be the sums of back and lay stakes on selection A. Let `EBA = sum(back size × (decimal odds − 1))` and `ELA = sum(lay size × (decimal odds − 1))`. Define the corresponding terms for B. Selection order comes from `teamNames`.

- `deepMetrics.raw.A_back_expo = EBA` and `A_lay_stake = L_A` reproduced 275/275.
- `deepMetrics.totals.totalBetTeam1 = raw.A_back_expo + raw.B_lay_stake`; the B side is symmetric. Both reproduced 275/275. This metric combines back liability on one side with opposite-side lay stake; it is not a count of bets.
- `supportMetrics.team1.supportMoney = B_A + L_B` reproduced 275/275. Support percentage is `100 × (B_A + L_B) / (B_A + L_A + B_B + L_B)`, matching 274/274 eligible snapshots.
- `deepMetrics.simplePL.team1_win = raw.A_lay_stake − raw.A_back_expo` reproduced 275/275. `derivedPL.team1_win = simplePL.team1_win − simplePL.team2_win`, and the B side is its negative, also reproduced 275/275. These fields represent different arithmetic from full settlement P/L.
- Full bookmaker P/L if A wins is `−EBA + ELA + B_B − L_B`. If B wins it is `−EBB + ELB + B_A − L_A`. These equations reproduced both `teams[selection].pnlIfWins` and `marketAnalysis.normalTotalBet[side].profitLoss` in 275/275 snapshots. This is the counterparty settlement model before any unobserved commission or fees; it does not establish any real bookmaker's private positions.
- `netSupport.teamA.netSupportValue = B_A + L_B − ELA` reproduced 275/275.
- `sentimentScore.teamA.sentimentScore = B_A − L_A + L_B − ELB` reproduced 275/275.
- `marketAnalysis.totalNetVolume.team1.totalBet = EBA + ELB` reproduced 275/275.

All formula results, errors and mismatch examples are in `analysis.json`. Re-run with:

```sh
python3 reports/tennisliveload-reverse-engineering/analyze_snapshots.py
```

## Material discrepancy

`bookmakerExposure.team1.backExposure` matched the archived trade-derived back exposure in only 51/275 snapshots; lay exposure also matched 51/275, and net exposure matched 45/275. However, the summary's own `netExposure = backExposure − layExposure` holds in 275/275.

The summary is internally consistent but frequently differs from the retained trade ledger. Possible causes include different time windows, stale values, filtering, rounding conventions or transformations in the local archive. The cause has not been established. It would be inaccurate to label this a live-site bug from the saved data alone. A field's label cannot safely substitute for its definition.

## What remains unresolved

1. The provider's actual upstream odds/trade supplier. Betfair is mentioned by the local application, but there is no direct provider-side evidence yet.
2. Whether trade rows are actual executions, per-price aggregates or reconstructed feed deltas. The archived rows contain selection, price, side, size and timestamp, without proving their original provenance.
3. The live target's browser polling/WebSocket/SSE behavior, update cadence, cache policies and error recovery.
4. The exact tennis score/point model, set markets and any tennis-specific formulas. All numeric validation so far concerns cricket snapshots.
5. Definitions and timing boundaries for pre-match, in-play and three-minute metrics, `matchLoadV2`, prediction thresholds, and `trueMarketLoad`.
6. Target frontend/backend frameworks, storage, scheduler and deployment topology. Cloudflare's presence is observed; internal implementation is not exposed by that fact.

## Next live evidence

Inspect an existing signed-in target match page when reachable. Record the visible labels, loaded JS/CSS assets, ordinary list/snapshot/odds responses, and changes over a short live interval. Analyze the delivered scripts with REA if useful. Compare those live fields with the offline identities and determine which calculations happen in browser code versus arriving precomputed from the server. REA has not been installed or run in this pass because no working target page or JS bundle was available.

Project rule `.agents/rules/no_auto_login.md` says: "NEVER call the upstream login functions or attempt to generate new session cookies dynamically in background scripts, scratch files, or API integrations." Existing adapter methods can invoke automatic login after a 401 or while loading a session, so none were executed. The rule also claims a two-login daily limit; that limit was not tested independently.

No application behavior, running service, session state or archived input was modified. The added files are this report, the offline checker and its generated result.
