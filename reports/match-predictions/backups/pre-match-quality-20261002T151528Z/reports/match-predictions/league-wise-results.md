# Match predictions by league

Generated: 02 Oct 2026, 20:34 IST. Sources: saved predictions, Cricbuzz, and official scorecards.

285 real unique matches across 35 named leagues; 0 test fixture retained separately.
275 saved match records: 250 verified winners, 0 pending, 25 no-result. 10 toss-only and 0 cache-only records.
285 independently confirmed results across the entire inventory; 0 unresolved, including 0 without dates.
Stored predictions: 196/250 (78.4%). Current server replay: 193/225 (85.8%). These are historical agreement rates.

## Algorithm findings

- **Historical replay, not a proven pre-match success rate:** The capture worker saves predictions after a match ends. The record has no separate forecast-issued timestamp or match predictor version. Results below measure agreement with saved winners on historical snapshots, not prospective forecasting accuracy. (server/services/matchCapture.js:147)
- **Server and page predictions differ:** 0 of 243 real saved matches produce different winners in the current server algorithm and frontend match-start algorithm. The page displays both mechanisms. (frontend/src/pages/MatchDetail.jsx:896)
- **Some league rules read fields outside the frozen pre-match inputs:** 0 of 243 replays change when fields other than preMatchVolume, preMatchPnl, and preMatchTotalBets are omitted. European rules read threeMinVolume; Punjab reads advancedMetricsV2, netSupport, and threeMinPnl; ACC and CPL read deepMetrics. (server/utils/leagueAlgorithms.js:455)
- **ETPL accuracy test fails:** Existing server league tests: 38 passed, 1 failed. Match 36057946, Dublin Guardians v Glasgow Cosmic: current prediction Dublin Guardians; saved actual winner Glasgow Cosmic. Frontend match-start/gated-fade tests: 21 passed. (server/tests/etplAlgorithms.test.js:111)
- **Zero-volume default can invent a pick:** getDefaultAlgorithmPrediction(0,0,0,0,0,0,"Team A","Team B") returns Team A with "75% Sure (Good Buy)" because 0 >= 0 * 1.4. Missing data should not establish confidence. (server/utils/leagueAlgorithms.js:1030)
- **Duplicate Kerala function hides an earlier implementation:** getKeralaPrediction is declared twice. JavaScript uses the later declaration, whose final return is null, rather than the earlier safe-PnL fallback. (server/utils/leagueAlgorithms.js:417)
- **Actual winners independently checked:** 285 results were matched to Cricbuzz or official scorecards, including 25 no-results. 0 remain unresolved, including 0 records without saved dates. Previously saved labels are preserved in a backup; unconfirmed labels are excluded from accuracy. (server/data/verified_match_results.json)
- **Toss winners independently checked:** 114 retained toss records have explicit Cricbuzz toss results. Match outcomes were not used as toss outcomes. Original toss predictions remain unchanged, including wrong predictions. (server/data/verified_toss_results.json)

## Method

- Scope: every unique match in the three saved files, independently checked against Cricbuzz and approved official fallback sources.
- Deduplicate by matchId. ACC Mens Premier Cup and ACC Men's Premier Cup are grouped under ACC Men's Premier Cup.
- Actual match winners come only from independently matched public result statements; toss winners and ending odds never become match winners.
- Cache-only league assignment is inferred only when both teams share exactly one saved league; otherwise league remains unavailable.
- Stored predictions are preserved. Current server/page/live predictions are fresh replays on saved match snapshots, each labeled separately.
- After user-requested cleanup, incomplete or unverified records and orphan cache entries are removed from active data. Original files and reports are archived in the cleanup backup. Confirmed no-result records are retained separately from scored winners.
- Accuracy denominator: real verified matches with a valid winner and a prediction from that algorithm. Fixtures, pending results, and no-results excluded.
- Both teams via explicit aliases, compatible format, unique fixture within 18 hours; multi-day records must fall within the published fixture range. Concordant results from different providers within 30 minutes are deduplicated, preferring Cricbuzz. Multiple candidates require a closest start within one hour and a two-hour gap to the next candidate, or within 15 minutes with a 45-minute gap. Conflicting results stay unresolved.
- Tables use the published fixture start in IST when available; the original saved date is retained separately. Undated cache records remain undated and unresolved.
- Frontend live predictor intentionally uses late trades; its historical agreement rate is not a pre-match performance estimate.
- The pre-fields replay is a diagnostic, not a replacement algorithm or a validated forecasting result.

## Full match list by league

### ACC Men's Premier Cup

22 matches; 22 verified. Stored: 20/22; current replay: 15/20.

- **31 Aug 2026, 07:00 · Qatar v United Arab Emirates** (ID 35994846). Actual match winner: **United Arab Emirates**. Stored match prediction: **United Arab Emirates** (Correct); current server: **United Arab Emirates** (Correct); page match-start: **United Arab Emirates**. Source: Match record. Current rule: ACC Lay Shield & Deficit Fade.
- **31 Aug 2026, 07:00 · Bahrain v Nepal** (ID 35997496). Actual match winner: **Nepal**. Stored match prediction: **Nepal** (Correct); current server: **Bahrain** (Wrong); page match-start: **Bahrain**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **01 Sept 2026, 07:00 · Singapore v Kuwait** (ID 36004170). Actual match winner: **Kuwait**. Stored match prediction: **Kuwait** (Correct); current server: **Kuwait** (Correct); page match-start: **Kuwait**. Source: Match record. Current rule: ACC Lay Shield & Deficit Fade.
- **01 Sept 2026, 07:00 · Saudi Arabia v Malaysia** (ID 36004378). Actual match winner: **Malaysia**. Stored match prediction: **Malaysia** (Correct); current server: **Malaysia** (Correct); page match-start: **Malaysia**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **02 Sept 2026, 07:00 · Bahrain v Hong Kong** (ID 36015021). Actual match winner: **Bahrain**. Stored match prediction: **Bahrain** (Correct); current server: **Bahrain** (Correct); page match-start: **Bahrain**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **02 Sept 2026, 07:00 · Qatar v Oman** (ID 36015221). Actual match winner: **Oman**. Stored match prediction: **Oman** (Correct); current server: **Qatar** (Wrong); page match-start: **Qatar**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **03 Sept 2026, 07:00 · Kuwait v United Arab Emirates** (ID 36019441). Actual match winner: **United Arab Emirates**. Stored match prediction: **United Arab Emirates** (Correct); current server: **United Arab Emirates** (Correct); page match-start: **United Arab Emirates**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **03 Sept 2026, 07:00 · Malaysia v Nepal** (ID 36019572). Actual match winner: **Nepal**. Stored match prediction: **Nepal** (Correct); current server: **Malaysia** (Wrong); page match-start: **Malaysia**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **04 Sept 2026, 07:00 · Saudi Arabia v Bahrain** (ID 36022061). Actual match winner: **Saudi Arabia**. Stored match prediction: **Saudi Arabia** (Correct); current server: **Saudi Arabia** (Correct); page match-start: **Saudi Arabia**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **04 Sept 2026, 07:00 · Singapore v Qatar** (ID 36022080). Actual match winner: **Qatar**. Stored match prediction: **Qatar** (Correct); current server: **Qatar** (Correct); page match-start: **Qatar**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **05 Sept 2026, 07:00 · Oman v Kuwait** (ID 36027100). Actual match winner: **Kuwait**. Stored match prediction: **Kuwait** (Correct); current server: **Kuwait** (Correct); page match-start: **Kuwait**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **05 Sept 2026, 07:00 · Hong Kong v Malaysia** (ID 36027510). Actual match winner: **Hong Kong**. Stored match prediction: **Malaysia** (Wrong); current server: **Hong Kong** (Correct); page match-start: **Hong Kong**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **06 Sept 2026, 07:00 · Nepal v Saudi Arabia** (ID 36029386). Actual match winner: **Nepal**. Stored match prediction: **Nepal** (Correct); current server: **Nepal** (Correct); page match-start: **Nepal**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **06 Sept 2026, 07:00 · United Arab Emirates v Singapore** (ID 36029407). Actual match winner: **United Arab Emirates**. Stored match prediction: **United Arab Emirates** (Correct); current server: **United Arab Emirates** (Correct); page match-start: **United Arab Emirates**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **07 Sept 2026, 07:00 · Malaysia v Bahrain** (ID 36034235). Actual match winner: **Malaysia**. Stored match prediction: **Malaysia** (Correct); current server: **Bahrain** (Wrong); page match-start: **Bahrain**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **07 Sept 2026, 07:00 · Kuwait v Qatar** (ID 36034274). Actual match winner: **Qatar**. Stored match prediction: **Qatar** (Correct); current server: **Qatar** (Correct); page match-start: **Qatar**. Source: Match record. Current rule: ACC Lay Shield & Deficit Fade.
- **08 Sept 2026, 07:00 · Nepal v Hong Kong** (ID 36038691). Actual match winner: **Hong Kong**. Stored match prediction: **Hong Kong** (Correct); current server: **Hong Kong** (Correct); page match-start: **Hong Kong**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **08 Sept 2026, 07:00 · United Arab Emirates v Oman** (ID 36038694). Actual match winner: **United Arab Emirates**. Stored match prediction: **United Arab Emirates** (Correct); current server: **United Arab Emirates** (Correct); page match-start: **United Arab Emirates**. Source: Match record. Current rule: ACC Bookie Safe PnL.
- **10 Sept 2026, 07:00 · Nepal v Oman** (ID 36046905). Actual match winner: **Nepal**. Stored match prediction: **Nepal** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **10 Sept 2026, 07:00 · United Arab Emirates v Hong Kong** (ID 36046908). Actual match winner: **United Arab Emirates**. Stored match prediction: **United Arab Emirates** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **12 Sept 2026, 07:00 · Nepal v United Arab Emirates** (ID 36054944). Actual match winner: **Nepal**. Stored match prediction: **Nepal** (Correct); current server: **United Arab Emirates** (Wrong); page match-start: **United Arab Emirates**. Source: Match record. Current rule: ACC Bookie Profit Side (Deficit Fade).
- **12 Sept 2026, 07:00 · Oman v Hong Kong** (ID 36054945). Actual match winner: **Hong Kong**. Stored match prediction: **Oman** (Wrong); current server: **Hong Kong** (Correct); page match-start: **Hong Kong**. Source: Match record. Current rule: ACC Bookie Safe PnL.

### Asian Games Men

1 matches; 1 verified. Stored: 1/1; current replay: 1/1.

- **25 Sept 2026, 05:30 · Hong Kong v Oman** (ID 36098847). Actual match winner: **Hong Kong**. Stored match prediction: **Hong Kong** (Correct); current server: **Hong Kong** (Correct); page match-start: **Hong Kong**. Source: Match record. Current rule: (Maximum Money + Back + Lay Alignment).

### Asian Games T20

5 matches; 1 verified. Stored: 0/1; current replay: 0/1.

- **25 Sept 2026, 10:30 · Afghanistan v Nepal** (ID 36108897). Actual match winner: **Nepal**. Stored match prediction: **Afghanistan** (Wrong); current server: **Afghanistan** (Wrong); page match-start: **Afghanistan**. Source: Match record. Toss prediction (separate): Afghanistan; toss winner: Afghanistan. Current rule: Maximum Money Lead (91% Share).
- **26 Sept 2026, 05:30 · Japan v Nepal** (ID 36114471). Actual match winner: **No Result**. Stored match prediction: **Nepal** (Unscored); current server: **Nepal** (Unscored); page match-start: **Nepal**. Source: Match record. Current rule: Maximum Money Lead (94% Share).
- **26 Sept 2026, 10:30 · Malaysia v Oman** (ID 36114468). Actual match winner: **No Result**. Stored match prediction: **Malaysia** (Unscored); current server: **Malaysia** (Unscored); page match-start: **Malaysia**. Source: Match record. Current rule: Maximum Money Lead (81% Share).
- **01 Oct 2026, 05:30 · Bangladesh v Pakistan** (ID 36131166). Actual match winner: **Pakistan**. Stored match prediction: **Unavailable** (No prediction); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Toss record only. Toss prediction (separate): Bangladesh; toss winner: Pakistan. 
- **01 Oct 2026, 10:00 · India v Sri Lanka** (ID 36131489). Actual match winner: **India**. Stored match prediction: **Unavailable** (No prediction); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Toss record only. 

### Asian Games Women

2 matches; 2 verified. Stored: 2/2; current replay: 2/2.

- **20 Sept 2026, 05:30 · Pakistan W v Sri Lanka W** (ID 36086084). Actual match winner: **Sri Lanka W**. Stored match prediction: **Sri Lanka W** (Correct); current server: **Sri Lanka W** (Correct); page match-start: **Sri Lanka W**. Source: Match record. Current rule: Womens Dual Flow Advantage.
- **20 Sept 2026, 10:30 · Bangladesh W v India W** (ID 36086124). Actual match winner: **India W**. Stored match prediction: **India W** (Correct); current server: **India W** (Correct); page match-start: **India W**. Source: Match record. Current rule: Womens Dual Flow Advantage.

### Australia One Day Cup

3 matches; 3 verified. Stored: 2/3; current replay: 2/3.

- **19 Sept 2026, 09:30 · Queensland Bulls v Victoria** (ID 36070909). Actual match winner: **Victoria**. Stored match prediction: **Queensland Bulls** (Wrong); current server: **Queensland Bulls** (Wrong); page match-start: **Queensland Bulls**. Source: Match record. Current rule: Money Leader (50% Share).
- **20 Sept 2026, 11:30 · Western Australia v Tasmania Tigers** (ID 36085924). Actual match winner: **Tasmania Tigers**. Stored match prediction: **Tasmania Tigers** (Correct); current server: **Tasmania Tigers** (Correct); page match-start: **Tasmania Tigers**. Source: Match record. Current rule: Maximum Money Lead (88% Share).
- **25 Sept 2026, 09:30 · Victoria v New South Wales Blues** (ID 36098736). Actual match winner: **New South Wales Blues**. Stored match prediction: **New South Wales Blues** (Correct); current server: **New South Wales Blues** (Correct); page match-start: **New South Wales Blues**. Source: Match record. Current rule: Maximum Money Lead (62% Share).

### CSA One-Day Challenge Div 2

3 matches; 2 verified. Stored: 1/2; current replay: 1/2.

- **20 Sept 2026, 12:30 · Mpumalanga Rhinos v Garden Route Badgers** (ID 36074960). Actual match winner: **Garden Route Badgers**. Stored match prediction: **Garden Route Badgers** (Correct); current server: **Garden Route Badgers** (Correct); page match-start: **Garden Route Badgers**. Source: Match record. Current rule: (Maximum Money + Back + Lay Alignment).
- **20 Sept 2026, 13:30 · Eastern Storm v Eastern Cape Linyathi** (ID 36075053). Actual match winner: **Eastern Storm**. Stored match prediction: **Eastern Cape Linyathi** (Wrong); current server: **Eastern Cape Linyathi** (Wrong); page match-start: **Eastern Cape Linyathi**. Source: Match record. Current rule: (Good Buy).
- **20 Sept 2026, 13:30 · Northern Cape v Limpopo** (ID 36078863). Actual match winner: **No Result**. Stored match prediction: **Northern Cape** (Unscored); current server: **Northern Cape** (Unscored); page match-start: **Northern Cape**. Source: Match record. Current rule: (Good Buy).

### Caribbean Premier League

26 matches; 25 verified. Stored: 25/25; current replay: 23/24.

- **14 Aug 2026, 05:30 · Jamaica Kingsmen v Guyana Amazon Warriors** (ID 35901908). Actual match winner: **Guyana Amazon Warriors**. Stored match prediction: **Guyana Amazon Warriors** (Correct); current server: **Guyana Amazon Warriors** (Correct); page match-start: **Guyana Amazon Warriors**. Source: Match record. Toss prediction (separate): Guyana Amazon Warriors; toss winner: Guyana Amazon Warriors. Current rule: CPL Back Volume Leader.
- **15 Aug 2026, 04:30 · St. Lucia Kings v Antigua & Barbuda Falcons** (ID 35931569). Actual match winner: **St. Lucia Kings**. Stored match prediction: **St. Lucia Kings** (Correct); current server: **St. Lucia Kings** (Correct); page match-start: **St. Lucia Kings**. Source: Match record. Toss prediction (separate): St. Lucia Kings; toss winner: St. Lucia Kings. Current rule: CPL Back Volume Leader.
- **16 Aug 2026, 05:30 · Jamaica Kingsmen v Trinbago Knight Riders** (ID 35933934). Actual match winner: **Jamaica Kingsmen**. Stored match prediction: **Jamaica Kingsmen** (Correct); current server: **Jamaica Kingsmen** (Correct); page match-start: **Jamaica Kingsmen**. Source: Match record. Toss prediction (separate): Jamaica Kingsmen; toss winner: Jamaica Kingsmen. Current rule: CPL Back Volume Leader.
- **17 Aug 2026, 04:30 · St. Lucia Kings v Barbados Tridents** (ID 35938017). Actual match winner: **Barbados Tridents**. Stored match prediction: **Barbados Tridents** (Correct); current server: **Barbados Tridents** (Correct); page match-start: **Barbados Tridents**. Source: Match record. Toss prediction (separate): St. Lucia Kings; toss winner: St. Lucia Kings. Current rule: CPL Lay Resistance Dump Short.
- **19 Aug 2026, 05:30 · Jamaica Kingsmen v St. Kitts and Nevis Patriots** (ID 35946930). Actual match winner: **Jamaica Kingsmen**. Stored match prediction: **Jamaica Kingsmen** (Correct); current server: **Jamaica Kingsmen** (Correct); page match-start: **Jamaica Kingsmen**. Source: Match record. Toss prediction (separate): St. Kitts and Nevis Patriots; toss winner: St. Kitts and Nevis Patriots. Current rule: CPL Shielded Public Overload Trap Fade.
- **20 Aug 2026, 04:30 · St. Lucia Kings v Guyana Amazon Warriors** (ID 35946931). Actual match winner: **Guyana Amazon Warriors**. Stored match prediction: **Guyana Amazon Warriors** (Correct); current server: **Guyana Amazon Warriors** (Correct); page match-start: **Guyana Amazon Warriors**. Source: Match record. Toss prediction (separate): Guyana Amazon Warriors; toss winner: Guyana Amazon Warriors. Current rule: CPL Back Volume Leader.
- **21 Aug 2026, 04:30 · Antigua & Barbuda Falco v St. Kitts and Nevis Pat** (ID 35954424). Actual match winner: **Antigua & Barbuda Falco**. Stored match prediction: **Antigua & Barbuda Falco** (Correct); current server: **Antigua & Barbuda Falco** (Correct); page match-start: **Antigua & Barbuda Falco**. Source: Match record. Toss prediction (separate): Antigua & Barbuda Falco; toss winner: Antigua & Barbuda Falco. Current rule: CPL Lay Shield & Volume Dominance.
- **22 Aug 2026, 04:30 · St. Lucia Kings v Jamaica Kingsmen** (ID 35962894). Actual match winner: **St. Lucia Kings**. Stored match prediction: **St. Lucia Kings** (Correct); current server: **St. Lucia Kings** (Correct); page match-start: **St. Lucia Kings**. Source: Match record. Toss prediction (separate): St. Lucia Kings; toss winner: St. Lucia Kings. Current rule: CPL Back Volume Leader.
- **26 Aug 2026, 04:30 · Antigua & Barbuda Falc v Barbados Tridents** (ID 35972909). Actual match winner: **Antigua & Barbuda Falc**. Stored match prediction: **Antigua & Barbuda Falc** (Correct); current server: **Antigua & Barbuda Falc** (Correct); page match-start: **Antigua & Barbuda Falc**. Source: Match record. Toss prediction (separate): Barbados Tridents; toss winner: Barbados Tridents. Current rule: CPL Bookmaker Trap (Fade Public Favorite).
- **27 Aug 2026, 04:30 · Trinbago Knight Riders v St. Lucia Kings** (ID 35972917). Actual match winner: **St. Lucia Kings**. Stored match prediction: **St. Lucia Kings** (Correct); current server: **St. Lucia Kings** (Correct); page match-start: **St. Lucia Kings**. Source: Match record. Toss prediction (separate): Trinbago Knight Riders; toss winner: Trinbago Knight Riders. Current rule: CPL Bookmaker Trap (Fade Public Favorite).
- **28 Aug 2026, 04:30 · St. Kitts and Nevis Patriots v Jamaica Kingsmen** (ID 35970079). Actual match winner: **Jamaica Kingsmen**. Stored match prediction: **Jamaica Kingsmen** (Correct); current server: **Jamaica Kingsmen** (Correct); page match-start: **Jamaica Kingsmen**. Source: Match record. Toss prediction (separate): St. Kitts and Nevis Patriots; toss winner: St. Kitts and Nevis Patriots. Current rule: CPL Bookmaker Trap (Fade Public Favorite).
- **29 Aug 2026, 05:30 · Trinbago Knight Riders v Barbados Tridents** (ID 35986052). Actual match winner: **Trinbago Knight Riders**. Stored match prediction: **Trinbago Knight Riders** (Correct); current server: **Trinbago Knight Riders** (Correct); page match-start: **Trinbago Knight Riders**. Source: Match record. Toss prediction (separate): Trinbago Knight Riders; toss winner: Trinbago Knight Riders. Current rule: CPL Bookmaker Trap (Fade Public Favorite).
- **30 Aug 2026, 04:30 · Trinbago Knight Riders v Jamaica Kingsmen** (ID 35997363). Actual match winner: **Jamaica Kingsmen**. Stored match prediction: **Jamaica Kingsmen** (Correct); current server: **Jamaica Kingsmen** (Correct); page match-start: **Jamaica Kingsmen**. Source: Match record. Current rule: CPL Favorite Short Resistance Fade.
- **31 Aug 2026, 04:30 · St Kitts & Nevis Pats v Antigua & Barbuda Falcs** (ID 35989000). Actual match winner: **No Result**. Stored match prediction: **Antigua & Barbuda Falcs** (Unscored); current server: **Antigua & Barbuda Falcs** (Unscored); page match-start: **Antigua & Barbuda Falcs**. Source: Match record. Toss prediction (separate): Antigua & Barbuda Falcs; toss winner: Antigua & Barbuda Falcs. Current rule: CPL Dual Flow Blowout Inflow.
- **01 Sept 2026, 02:30 · Trinbago Knight Riders v Guyana Amazon Warriors** (ID 36004104). Actual match winner: **Guyana Amazon Warriors**. Stored match prediction: **Guyana Amazon Warriors** (Correct); current server: **Guyana Amazon Warriors** (Correct); page match-start: **Guyana Amazon Warriors**. Source: Match record. Toss prediction (separate): Trinbago Knight Riders; toss winner: Trinbago Knight Riders. Current rule: CPL Back Volume Leader.
- **02 Sept 2026, 04:30 · St Kitts & Nevis Pats v Barbados Tridents** (ID 36004314). Actual match winner: **St Kitts & Nevis Pats**. Stored match prediction: **St Kitts & Nevis Pats** (Correct); current server: **St Kitts & Nevis Pats** (Correct); page match-start: **St Kitts & Nevis Pats**. Source: Match record. Toss prediction (separate): St Kitts & Nevis Pats; toss winner: St Kitts & Nevis Pats. Current rule: CPL Favorite Short Resistance Fade.
- **03 Sept 2026, 04:30 · Trinbago Knight Riders v Antigua & Barbuda Falcs** (ID 36018454). Actual match winner: **Antigua & Barbuda Falcs**. Stored match prediction: **Antigua & Barbuda Falcs** (Correct); current server: **Antigua & Barbuda Falcs** (Correct); page match-start: **Antigua & Barbuda Falcs**. Source: Match record. Toss prediction (separate): Trinbago Knight Riders; toss winner: Trinbago Knight Riders. Current rule: CPL Favorite Short Resistance Fade.
- **04 Sept 2026, 04:30 · St Kitts & Nevis Pats v St. Lucia Kings** (ID 36019390). Actual match winner: **St Kitts & Nevis Pats**. Stored match prediction: **St Kitts & Nevis Pats** (Correct); current server: **St Kitts & Nevis Pats** (Correct); page match-start: **St Kitts & Nevis Pats**. Source: Match record. Toss prediction (separate): St. Lucia Kings; toss winner: St. Lucia Kings. Current rule: CPL Bookmaker Trap (Fade Public Favorite).
- **05 Sept 2026, 04:30 · Guyana Amazon Warriors v Jamaica Kingsmen** (ID 36019388). Actual match winner: **Guyana Amazon Warriors**. Stored match prediction: **Guyana Amazon Warriors** (Correct); current server: **Guyana Amazon Warriors** (Correct); page match-start: **Guyana Amazon Warriors**. Source: Match record. Toss prediction (separate): Guyana Amazon Warriors; toss winner: Guyana Amazon Warriors. Current rule: CPL Dual Flow Blowout Inflow.
- **06 Sept 2026, 05:30 · Barbados Tridents v Trinbago Knight Riders** (ID 36023549). Actual match winner: **Trinbago Knight Riders**. Stored match prediction: **Trinbago Knight Riders** (Correct); current server: **Trinbago Knight Riders** (Correct); page match-start: **Trinbago Knight Riders**. Source: Match record. Toss prediction (separate): Barbados Tridents; toss winner: Barbados Tridents. Current rule: CPL Lay Shield & Volume Dominance.
- **07 Sept 2026, 00:30 · Guyana Amazon Warriors v St Kitts & Nevis Pats** (ID 36029412). Actual match winner: **Guyana Amazon Warriors**. Stored match prediction: **Guyana Amazon Warriors** (Correct); current server: **St Kitts & Nevis Pats** (Wrong); page match-start: **St Kitts & Nevis Pats**. Source: Match record. Toss prediction (separate): St Kitts & Nevis Pats; toss winner: St Kitts & Nevis Pats. Current rule: CPL Favorite Short Resistance Fade.
- **07 Sept 2026, 04:30 · Barbados Tridents v St. Lucia Kings** (ID 36034130). Actual match winner: **Barbados Tridents**. Stored match prediction: **Barbados Tridents** (Correct); current server: **Barbados Tridents** (Correct); page match-start: **Barbados Tridents**. Source: Match record. Toss prediction (separate): Barbados Tridents; toss winner: Barbados Tridents. Current rule: CPL Bookmaker Trap (Fade Public Favorite).
- **10 Sept 2026, 04:30 · Guyana Amazon Warriors v St. Lucia Kings** (ID 36045828). Actual match winner: **Guyana Amazon Warriors**. Stored match prediction: **Guyana Amazon Warriors** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. Toss prediction (separate): St. Lucia Kings; toss winner: St. Lucia Kings. 
- **12 Sept 2026, 04:30 · Guyana Amazon Warriors v Trinbago Knight Riders** (ID 36054787). Actual match winner: **Guyana Amazon Warriors**. Stored match prediction: **Guyana Amazon Warriors** (Correct); current server: **Guyana Amazon Warriors** (Correct); page match-start: **Guyana Amazon Warriors**. Source: Match record. Toss prediction (separate): Guyana Amazon Warriors; toss winner: Guyana Amazon Warriors. Current rule: CPL Back Volume Leader.
- **19 Sept 2026, 04:30 · Guyana Amazon Warriors v Jamaica Kingsmen** (ID 36085029). Actual match winner: **Jamaica Kingsmen**. Stored match prediction: **Jamaica Kingsmen** (Correct); current server: **Jamaica Kingsmen** (Correct); page match-start: **Jamaica Kingsmen**. Source: Match record. Toss prediction (separate): Guyana Amazon Warriors; toss winner: Jamaica Kingsmen. Current rule: CPL Favorite Short Resistance Fade.
- **21 Sept 2026, 04:30 · Antigua & Barbuda Falcs v Jamaica Kingsmen** (ID 36090636). Actual match winner: **Antigua & Barbuda Falcs**. Stored match prediction: **Antigua & Barbuda Falcs** (Correct); current server: **Antigua & Barbuda Falcs** (Correct); page match-start: **Antigua & Barbuda Falcs**. Source: Match record. Toss prediction (separate): Antigua & Barbuda Falcs; toss winner: Antigua & Barbuda Falcs. Current rule: CPL Lay Shield & Volume Dominance.

### Delhi Premier League

2 matches; 2 verified. Stored: 2/2; current replay: 1/1.

- **28 Aug 2026, 19:00 · Central Delhi Kings v Purani Delhi 6** (ID 35988292). Actual match winner: **Central Delhi Kings**. Stored match prediction: **Central Delhi Kings** (Correct); current server: **Central Delhi Kings** (Correct); page match-start: **Central Delhi Kings**. Source: Match record. Current rule: Delhi Bookie Trap (Fade Public).
- **30 Aug 2026, 20:00 · South Delhi Superstarz v Central Delhi Kings** (ID 35995780). Actual match winner: **South Delhi Superstarz**. Stored match prediction: **South Delhi Superstarz** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 

### European T20 Premier League

23 matches; 21 verified. Stored: 19/21; current replay: 20/21.

- **27 Aug 2026, 15:00 · Belfast Wolves v Dublin Guardians** (ID 35977014). Actual match winner: **Belfast Wolves**. Stored match prediction: **Belfast Wolves** (Correct); current server: **Belfast Wolves** (Correct); page match-start: **Belfast Wolves**. Source: Match record. Toss prediction (separate): Belfast Wolves; toss winner: Dublin Guardians. Current rule: European T20 Back Volume Leader.
- **27 Aug 2026, 18:45 · Edinburgh Castle Rockers v Glasgow Cosmic** (ID 35979895). Actual match winner: **Edinburgh Castle Rockers**. Stored match prediction: **Edinburgh Castle Rockers** (Correct); current server: **Edinburgh Castle Rockers** (Correct); page match-start: **Edinburgh Castle Rockers**. Source: Match record. Toss prediction (separate): Edinburgh Castle Rockers; toss winner: Edinburgh Castle Rockers. Current rule: European T20 Back Volume Leader.
- **28 Aug 2026, 18:45 · Amsterdam Flames v Edinburgh Castle Rockers** (ID 35988957). Actual match winner: **No Result**. Stored match prediction: **Edinburgh Castle Rockers** (Unscored); current server: **Edinburgh Castle Rockers** (Unscored); page match-start: **Edinburgh Castle Rockers**. Source: Match record. Toss prediction (separate): Edinburgh Castle Rockers; toss winner: Edinburgh Castle Rockers. Current rule: European T20 Back Volume Leader.
- **29 Aug 2026, 15:00 · Glasgow Cosmic v Dublin Guardians** (ID 35989974). Actual match winner: **Glasgow Cosmic**. Stored match prediction: **Glasgow Cosmic** (Correct); current server: **Glasgow Cosmic** (Correct); page match-start: **Glasgow Cosmic**. Source: Match record. Toss prediction (separate): Glasgow Cosmic; toss winner: Dublin Guardians. Current rule: European T20 Back Volume Leader.
- **29 Aug 2026, 18:45 · Rotterdam Dockers v Belfast Wolves** (ID 35989760). Actual match winner: **No Result**. Stored match prediction: **Belfast Wolves** (Unscored); current server: **Belfast Wolves** (Unscored); page match-start: **Belfast Wolves**. Source: Match record. Toss prediction (separate): Belfast Wolves; toss winner: Belfast Wolves. Current rule: European T20 Back Volume Leader.
- **30 Aug 2026, 15:00 · Amsterdam Flames v Belfast Wolves** (ID 35998885). Actual match winner: **Belfast Wolves**. Stored match prediction: **Belfast Wolves** (Correct); current server: **Belfast Wolves** (Correct); page match-start: **Belfast Wolves**. Source: Match record. Toss prediction (separate): Belfast Wolves; toss winner: Belfast Wolves. Current rule: European T20 Back Volume Leader.
- **30 Aug 2026, 18:45 · Edinburgh Castle Rockers v Dublin Guardians** (ID 35997455). Actual match winner: **Edinburgh Castle Rockers**. Stored match prediction: **Edinburgh Castle Rockers** (Correct); current server: **Edinburgh Castle Rockers** (Correct); page match-start: **Edinburgh Castle Rockers**. Source: Match record. Toss prediction (separate): Edinburgh Castle Rockers; toss winner: Dublin Guardians. Current rule: European T20 Back Volume Leader.
- **01 Sept 2026, 18:45 · Glasgow Cosmic v Rotterdam Dockers** (ID 35998693). Actual match winner: **Rotterdam Dockers**. Stored match prediction: **Rotterdam Dockers** (Correct); current server: **Rotterdam Dockers** (Correct); page match-start: **Rotterdam Dockers**. Source: Match record. Toss prediction (separate): Rotterdam Dockers; toss winner: Rotterdam Dockers. Current rule: European T20 Back Volume Leader.
- **02 Sept 2026, 15:00 · Dublin Guardians v Rotterdam Dockers** (ID 36020340). Actual match winner: **Rotterdam Dockers**. Stored match prediction: **Rotterdam Dockers** (Correct); current server: **Rotterdam Dockers** (Correct); page match-start: **Rotterdam Dockers**. Source: Match record. Toss prediction (separate): Rotterdam Dockers; toss winner: Rotterdam Dockers. Current rule: European T20 Back Volume Leader.
- **02 Sept 2026, 18:45 · Belfast Wolves v Edinburgh Castle Rockers** (ID 36016128). Actual match winner: **Edinburgh Castle Rockers**. Stored match prediction: **Edinburgh Castle Rockers** (Correct); current server: **Edinburgh Castle Rockers** (Correct); page match-start: **Edinburgh Castle Rockers**. Source: Match record. Toss prediction (separate): Edinburgh Castle Rockers; toss winner: Belfast Wolves. Current rule: European T20 Lay Dump Resistance.
- **03 Sept 2026, 18:45 · Amsterdam Flames v Glasgow Cosmic** (ID 36020432). Actual match winner: **Amsterdam Flames**. Stored match prediction: **Amsterdam Flames** (Correct); current server: **Amsterdam Flames** (Correct); page match-start: **Amsterdam Flames**. Source: Match record. Toss prediction (separate): Amsterdam Flames; toss winner: Glasgow Cosmic. Current rule: European T20 Back Volume Leader.
- **04 Sept 2026, 18:45 · Glasgow Cosmic v Belfast Wolves** (ID 36027092). Actual match winner: **Belfast Wolves**. Stored match prediction: **Belfast Wolves** (Correct); current server: **Belfast Wolves** (Correct); page match-start: **Belfast Wolves**. Source: Match record. Toss prediction (separate): Belfast Wolves; toss winner: Glasgow Cosmic. Current rule: European T20 Back Volume Leader.
- **05 Sept 2026, 15:00 · Rotterdam Dockers v Edinburgh Castle Rockers** (ID 36023515). Actual match winner: **Edinburgh Castle Rockers**. Stored match prediction: **Edinburgh Castle Rockers** (Correct); current server: **Rotterdam Dockers** (Wrong); page match-start: **Rotterdam Dockers**. Source: Match record. Toss prediction (separate): Edinburgh Castle Rockers; toss winner: Rotterdam Dockers. Current rule: European T20 Back Volume Leader.
- **05 Sept 2026, 18:45 · Dublin Guardians v Amsterdam Flames** (ID 36027440). Actual match winner: **Amsterdam Flames**. Stored match prediction: **Amsterdam Flames** (Correct); current server: **Amsterdam Flames** (Correct); page match-start: **Amsterdam Flames**. Source: Match record. Toss prediction (separate): Amsterdam Flames; toss winner: Dublin Guardians. Current rule: European T20 Back Volume Leader.
- **06 Sept 2026, 15:00 · Glasgow Cosmic v Edinburgh Castle Rockers** (ID 36034286). Actual match winner: **Edinburgh Castle Rockers**. Stored match prediction: **Edinburgh Castle Rockers** (Correct); current server: **Edinburgh Castle Rockers** (Correct); page match-start: **Edinburgh Castle Rockers**. Source: Match record. Toss prediction (separate): Edinburgh Castle Rockers; toss winner: Edinburgh Castle Rockers. Current rule: European T20 Back Volume Leader.
- **06 Sept 2026, 18:45 · Amsterdam Flames v Rotterdam Dockers** (ID 36034385). Actual match winner: **Amsterdam Flames**. Stored match prediction: **Amsterdam Flames** (Correct); current server: **Amsterdam Flames** (Correct); page match-start: **Amsterdam Flames**. Source: Match record. Toss prediction (separate): Amsterdam Flames; toss winner: Amsterdam Flames. Current rule: European T20 Lay Dump Resistance.
- **10 Sept 2026, 15:00 · Rotterdam Dockers v Glasgow Cosmic** (ID 36040032). Actual match winner: **Rotterdam Dockers**. Stored match prediction: **Rotterdam Dockers** (Correct); current server: **Rotterdam Dockers** (Correct); page match-start: **Rotterdam Dockers**. Source: Match record. Toss prediction (separate): Glasgow Cosmic; toss winner: Glasgow Cosmic. Current rule: European T20 Lay Dump Resistance.
- **10 Sept 2026, 18:45 · Belfast Wolves v Amsterdam Flames** (ID 36045869). Actual match winner: **Belfast Wolves**. Stored match prediction: **Belfast Wolves** (Correct); current server: **Belfast Wolves** (Correct); page match-start: **Belfast Wolves**. Source: Match record. Toss prediction (separate): Belfast Wolves; toss winner: Belfast Wolves. Current rule: Pre-match league rule: back share >= 0.55 and opponent lay/back ratio >= 0.5 → lay leader.
- **11 Sept 2026, 18:45 · Dublin Guardians v Edinburgh Castle Rockers** (ID 36045879). Actual match winner: **Edinburgh Castle Rockers**. Stored match prediction: **Dublin Guardians** (Wrong); current server: **Edinburgh Castle Rockers** (Correct); page match-start: **Edinburgh Castle Rockers**. Source: Match record. Toss prediction (separate): Dublin Guardians; toss winner: Dublin Guardians. Current rule: Pre-match league rule: back share >= 0.55 and opponent lay/back ratio >= 0.5 → lay leader.
- **12 Sept 2026, 15:00 · Belfast Wolves v Rotterdam Dockers** (ID 36055698). Actual match winner: **Rotterdam Dockers**. Stored match prediction: **Rotterdam Dockers** (Correct); current server: **Rotterdam Dockers** (Correct); page match-start: **Rotterdam Dockers**. Source: Match record. Toss prediction (separate): Rotterdam Dockers; toss winner: Rotterdam Dockers. Current rule: Pre-match league rule: back share >= 0.55 and opponent lay/back ratio >= 0.5 → lay leader.
- **12 Sept 2026, 18:45 · Dublin Guardians v Glasgow Cosmic** (ID 36057946). Actual match winner: **Glasgow Cosmic**. Stored match prediction: **Dublin Guardians** (Wrong); current server: **Glasgow Cosmic** (Correct); page match-start: **Glasgow Cosmic**. Source: Match record. Toss prediction (separate): Glasgow Cosmic; toss winner: Dublin Guardians. Current rule: Pre-match league rule: back share >= 0.55 and opponent lay/back ratio >= 0.5 → lay leader.
- **19 Sept 2026, 18:45 · Amsterdam Flames v Belfast Wolves** (ID 36084485). Actual match winner: **Belfast Wolves**. Stored match prediction: **Belfast Wolves** (Correct); current server: **Belfast Wolves** (Correct); page match-start: **Belfast Wolves**. Source: Match record. Toss prediction (separate): Belfast Wolves; toss winner: Belfast Wolves. Current rule: European T20 Lay Dump Resistance.
- **20 Sept 2026, 18:45 · Edinburgh Castle Rockers v Belfast Wolves** (ID 36092701). Actual match winner: **Edinburgh Castle Rockers**. Stored match prediction: **Edinburgh Castle Rockers** (Correct); current server: **Edinburgh Castle Rockers** (Correct); page match-start: **Edinburgh Castle Rockers**. Source: Match record. Toss prediction (separate): Belfast Wolves; toss winner: Edinburgh Castle Rockers. Current rule: European T20 Back Volume Leader.

### First Class Matches

1 matches; 1 verified. Stored: 1/1; current replay: 1/1.

- **22 Sept 2026, 09:30 · India A v Australia A** (ID 36101712). Actual match winner: **India A**. Stored match prediction: **India A** (Correct); current server: **India A** (Correct); page match-start: **India A**. Source: Match record. Current rule: (Maximum Money + Back + Lay Alignment).

### ILT20 Development Tournament

5 matches; 5 verified. Stored: 5/5; current replay: 3/5.

- **19 Sept 2026, 18:30 · Sharjah Warriorz Dev v Gulf Giants Dev** (ID 36082473). Actual match winner: **Gulf Giants Dev**. Stored match prediction: **Gulf Giants Dev** (Correct); current server: **Sharjah Warriorz Dev** (Wrong); page match-start: **Sharjah Warriorz Dev**. Source: Match record. Current rule: ILT20 Smart Inflow.
- **19 Sept 2026, 22:30 · Abu Dhabi Knight Riders v Dubai Capitals Dev** (ID 36082580). Actual match winner: **Dubai Capitals Dev**. Stored match prediction: **Dubai Capitals Dev** (Correct); current server: **Dubai Capitals Dev** (Correct); page match-start: **Dubai Capitals Dev**. Source: Match record. Current rule: ILT20 Smart Inflow.
- **20 Sept 2026, 18:30 · Desert Vipers Dev v Abu Dhabi Knight Riders** (ID 36090798). Actual match winner: **Abu Dhabi Knight Riders**. Stored match prediction: **Abu Dhabi Knight Riders** (Correct); current server: **Abu Dhabi Knight Riders** (Correct); page match-start: **Abu Dhabi Knight Riders**. Source: Match record. Current rule: ILT20 Smart Inflow.
- **20 Sept 2026, 22:30 · Sharjah Warriorz Dev v Mi Emirates Dev** (ID 36090931). Actual match winner: **Mi Emirates Dev**. Stored match prediction: **Mi Emirates Dev** (Correct); current server: **Mi Emirates Dev** (Correct); page match-start: **Mi Emirates Dev**. Source: Match record. Current rule: ILT20 Smart Inflow.
- **24 Sept 2026, 20:30 · Gulf Giants Development v Desert Vipers Developme** (ID 36110045). Actual match winner: **Gulf Giants Development**. Stored match prediction: **Gulf Giants Development** (Correct); current server: **Desert Vipers Developme** (Wrong); page match-start: **Desert Vipers Developme**. Source: Match record. Current rule: ILT20 Smart Inflow.

### International Twenty20 Matches

27 matches; 22 verified. Stored: 12/22; current replay: 17/19.

- **28 Aug 2026, 17:30 · Namibia v South Africa** (ID 35977921). Actual match winner: **Namibia**. Stored match prediction: **Namibia** (Correct); current server: **Namibia** (Correct); page match-start: **Namibia**. Source: Match record. Toss prediction (separate): South Africa; toss winner: South Africa. Current rule: T20I Dual Flow Inflow Dominance.
- **29 Aug 2026, 17:30 · South Africa v Zimbabwe** (ID 35993805). Actual match winner: **South Africa**. Stored match prediction: **South Africa** (Correct); current server: **South Africa** (Correct); page match-start: **South Africa**. Source: Match record. Toss prediction (separate): Zimbabwe; toss winner: Zimbabwe. Current rule: T20I Dual Flow Inflow Dominance.
- **31 Aug 2026, 17:30 · Namibia v Zimbabwe** (ID 35998050). Actual match winner: **Zimbabwe**. Stored match prediction: **Zimbabwe** (Correct); current server: **Zimbabwe** (Correct); page match-start: **Zimbabwe**. Source: Match record. Toss prediction (separate): Namibia; toss winner: Namibia. Current rule: T20I Dual Flow Inflow Dominance.
- **01 Sept 2026, 17:30 · Zimbabwe v South Africa** (ID 36013997). Actual match winner: **South Africa**. Stored match prediction: **Zimbabwe** (Wrong); current server: **South Africa** (Correct); page match-start: **South Africa**. Source: Match record. Toss prediction (separate): South Africa; toss winner: South Africa. Current rule: T20I Dual Flow Inflow Dominance.
- **03 Sept 2026, 17:30 · Namibia v Zimbabwe** (ID 36020245). Actual match winner: **Zimbabwe**. Stored match prediction: **Namibia** (Wrong); current server: **Zimbabwe** (Correct); page match-start: **Zimbabwe**. Source: Match record. Toss prediction (separate): Zimbabwe; toss winner: Zimbabwe. Current rule: T20I Dual Flow Inflow Dominance.
- **04 Sept 2026, 17:30 · Namibia v South Africa** (ID 36026448). Actual match winner: **South Africa**. Stored match prediction: **Namibia** (Wrong); current server: **South Africa** (Correct); page match-start: **South Africa**. Source: Match record. Toss prediction (separate): Namibia; toss winner: Namibia. Current rule: T20I Dual Flow Inflow Dominance.
- **06 Sept 2026, 17:30 · South Africa v Zimbabwe** (ID 36032174). Actual match winner: **South Africa**. Stored match prediction: **Zimbabwe** (Wrong); current server: **South Africa** (Correct); page match-start: **South Africa**. Source: Match record. Toss prediction (separate): South Africa; toss winner: South Africa. Current rule: T20I Dual Flow Inflow Dominance.
- **10 Sept 2026, 13:00 · Botswana v Uganda** (ID 36051784). Actual match winner: **Uganda**. Stored match prediction: **Uganda** (Correct); current server: **Uganda** (Correct); page match-start: **Uganda**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **10 Sept 2026, 17:30 · Rwanda v Sierra Leone** (ID 36051787). Actual match winner: **Rwanda**. Stored match prediction: **Sierra Leone** (Wrong); current server: **Rwanda** (Correct); page match-start: **Rwanda**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **11 Sept 2026, 13:00 · Rwanda v Uganda** (ID 36054814). Actual match winner: **Uganda**. Stored match prediction: **Uganda** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **11 Sept 2026, 17:00 · Botswana v Kenya** (ID 36054876). Actual match winner: **Kenya**. Stored match prediction: **Kenya** (Correct); current server: **Kenya** (Correct); page match-start: **Kenya**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **12 Sept 2026, 13:00 · Kenya v Uganda** (ID 36058629). Actual match winner: **Kenya**. Stored match prediction: **Kenya** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **12 Sept 2026, 17:30 · Botswana v Sierra Leone** (ID 36058639). Actual match winner: **Botswana**. Stored match prediction: **Botswana** (Correct); current server: **Botswana** (Correct); page match-start: **Botswana**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **19 Sept 2026, 06:30 · Japan v Hong Kong** (ID 36067248). Actual match winner: **Hong Kong**. Stored match prediction: **Japan** (Wrong); current server: **Hong Kong** (Correct); page match-start: **Hong Kong**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **19 Sept 2026, 17:30 · Uganda v Kenya** (ID 36087032). Actual match winner: **Kenya**. Stored match prediction: **Kenya** (Correct); current server: **Kenya** (Correct); page match-start: **Kenya**. Source: Match record. Current rule: T20I Smart Money Inflow Margin.
- **19 Sept 2026, 19:00 · England v Sri Lanka** (ID 36082542). Actual match winner: **England**. Stored match prediction: **Sri Lanka** (Wrong); current server: **England** (Correct); page match-start: **England**. Source: Match record. Toss prediction (separate): England; toss winner: England. Current rule: T20I Dual Flow Inflow Dominance.
- **20 Sept 2026, 06:30 · Japan v Hong Kong** (ID 36090684). Actual match winner: **No Result**. Stored match prediction: **Hong Kong** (Unscored); current server: **Hong Kong** (Unscored); page match-start: **Hong Kong**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **21 Sept 2026, 00:00 · Cayman v Bermuda** (ID 36079572). Actual match winner: **No Result**. Stored match prediction: **Cayman** (Unscored); current server: **Cayman** (Unscored); page match-start: **Cayman**. Source: Match record. Current rule: T20I Smart Money Inflow Margin.
- **24 Sept 2026, 20:30 · Cayman v Bahamas (Game 1)** (ID 36094846). Actual match winner: **Cayman**. Stored match prediction: **Cayman** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **25 Sept 2026, 01:00 · Cayman v Bahamas (Game 2)** (ID 36107226). Actual match winner: **No Result**. Stored match prediction: **Cayman** (Unscored); current server: **Cayman** (Unscored); page match-start: **Cayman**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **25 Sept 2026, 14:30 · Ghana v Sierra Leone** (ID 36115215). Actual match winner: **Sierra Leone**. Stored match prediction: **Ghana** (Wrong); current server: **Ghana** (Wrong); page match-start: **Ghana**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **25 Sept 2026, 18:30 · Nigeria v Nigeria A** (ID 36115223). Actual match winner: **Nigeria**. Stored match prediction: **Nigeria A** (Wrong); current server: **Nigeria A** (Wrong); page match-start: **Nigeria A**. Source: Match record. Current rule: T20I Smart Money Inflow Margin.
- **25 Sept 2026, 20:30 · Bahamas v Bermuda (Game 1)** (ID 36099099). Actual match winner: **No Result**. Stored match prediction: **Bermuda** (Unscored); current server: **Bermuda** (Unscored); page match-start: **Bermuda**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **26 Sept 2026, 01:00 · Bahamas v Bermuda** (ID 36110388). Actual match winner: **No Result**. Stored match prediction: **Bermuda** (Unscored); current server: **Bermuda** (Unscored); page match-start: **Bermuda**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **26 Sept 2026, 14:30 · Sierra Leone v Nigeria A** (ID 36116022). Actual match winner: **Nigeria A**. Stored match prediction: **Nigeria A** (Correct); current server: **Nigeria A** (Correct); page match-start: **Nigeria A**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **26 Sept 2026, 18:30 · Ghana v Nigeria** (ID 36116026). Actual match winner: **Nigeria**. Stored match prediction: **Nigeria** (Correct); current server: **Nigeria** (Correct); page match-start: **Nigeria**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.
- **27 Sept 2026, 00:00 · Bahamas v Bermuda** (ID 36119703). Actual match winner: **Bermuda**. Stored match prediction: **Bahamas** (Wrong); current server: **Bermuda** (Correct); page match-start: **Bermuda**. Source: Match record. Current rule: T20I Dual Flow Inflow Dominance.

### Kerala Cricket League

16 matches; 16 verified. Stored: 12/16; current replay: 14/15.

- **28 Aug 2026, 14:30 · Alleppey Ripples v Calicut Globstars** (ID 35988970). Actual match winner: **Alleppey Ripples**. Stored match prediction: **Alleppey Ripples** (Correct); current server: **Alleppey Ripples** (Correct); page match-start: **Alleppey Ripples**. Source: Match record. Current rule: Kerala Lay Resistance Dump.
- **28 Aug 2026, 18:45 · Thrissur Titans v Trivandrum Royals** (ID 35989822). Actual match winner: **Trivandrum Royals**. Stored match prediction: **Trivandrum Royals** (Correct); current server: **Trivandrum Royals** (Correct); page match-start: **Trivandrum Royals**. Source: Match record. Current rule: Kerala Pre-Match Activity Lead.
- **29 Aug 2026, 18:45 · Aries Kollam Sailors v Alleppey Ripples** (ID 35993903). Actual match winner: **Alleppey Ripples**. Stored match prediction: **Alleppey Ripples** (Correct); current server: **Aries Kollam Sailors** (Wrong); page match-start: **Aries Kollam Sailors**. Source: Match record. Current rule: Kerala Lay Resistance Dump.
- **30 Aug 2026, 14:00 · Kochi Blue Tigers v Calicut Globstars** (ID 35997338). Actual match winner: **Calicut Globstars**. Stored match prediction: **Calicut Globstars** (Correct); current server: **Calicut Globstars** (Correct); page match-start: **Calicut Globstars**. Source: Match record. Current rule: Kerala Volume Leader.
- **30 Aug 2026, 18:00 · Trivandrum Royals v Aries Kollam Sailors** (ID 35997404). Actual match winner: **Trivandrum Royals**. Stored match prediction: **Aries Kollam Sailors** (Wrong); current server: **Trivandrum Royals** (Correct); page match-start: **Trivandrum Royals**. Source: Match record. Current rule: Kerala Bookie Trap (Fade Public).
- **31 Aug 2026, 14:30 · Alleppey Ripples v Trivandrum Royals** (ID 36004150). Actual match winner: **Trivandrum Royals**. Stored match prediction: **Alleppey Ripples** (Wrong); current server: **Trivandrum Royals** (Correct); page match-start: **Trivandrum Royals**. Source: Match record. Current rule: Kerala Lay Resistance Dump.
- **31 Aug 2026, 18:45 · Thrissur Titans v Calicut Globstars** (ID 36004153). Actual match winner: **Thrissur Titans**. Stored match prediction: **Thrissur Titans** (Correct); current server: **Thrissur Titans** (Correct); page match-start: **Thrissur Titans**. Source: Match record. Current rule: Kerala Pre-Match Activity Lead.
- **01 Sept 2026, 14:30 · Aries Kollam Sailors v Thrissur Titans** (ID 36015975). Actual match winner: **Thrissur Titans**. Stored match prediction: **Aries Kollam Sailors** (Wrong); current server: **Thrissur Titans** (Correct); page match-start: **Thrissur Titans**. Source: Match record. Current rule: Kerala Volume Margin Inflow.
- **01 Sept 2026, 18:45 · Alleppey Ripples v Kochi Blue Tigers** (ID 36016326). Actual match winner: **Kochi Blue Tigers**. Stored match prediction: **Kochi Blue Tigers** (Correct); current server: **Kochi Blue Tigers** (Correct); page match-start: **Kochi Blue Tigers**. Source: Match record. Current rule: Kerala Pre-Match Activity Lead.
- **02 Sept 2026, 14:30 · Kochi Blue Tigers v Trivandrum Royals** (ID 36018427). Actual match winner: **Trivandrum Royals**. Stored match prediction: **Trivandrum Royals** (Correct); current server: **Trivandrum Royals** (Correct); page match-start: **Trivandrum Royals**. Source: Match record. Current rule: Kerala Lay Resistance Dump.
- **02 Sept 2026, 18:45 · Calicut Globstars v Aries Kollam Sailors** (ID 36019525). Actual match winner: **Aries Kollam Sailors**. Stored match prediction: **Aries Kollam Sailors** (Correct); current server: **Aries Kollam Sailors** (Correct); page match-start: **Aries Kollam Sailors**. Source: Match record. Current rule: Kerala Pre-Match Activity Lead.
- **03 Sept 2026, 14:30 · Trivandrum Royals v Calicut Globstars** (ID 36022021). Actual match winner: **Calicut Globstars**. Stored match prediction: **Calicut Globstars** (Correct); current server: **Calicut Globstars** (Correct); page match-start: **Calicut Globstars**. Source: Match record. Current rule: Kerala Lay Resistance Dump.
- **03 Sept 2026, 18:45 · Thrissur Titans v Alleppey Ripples** (ID 36021391). Actual match winner: **Alleppey Ripples**. Stored match prediction: **Alleppey Ripples** (Correct); current server: **Alleppey Ripples** (Correct); page match-start: **Alleppey Ripples**. Source: Match record. Current rule: Maximum Money Lead (83% Share).
- **04 Sept 2026, 14:20 · Trivandrum Royals v Thrissur Titans** (ID 36028567). Actual match winner: **Thrissur Titans**. Stored match prediction: **Thrissur Titans** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **04 Sept 2026, 18:30 · Alleppey Ripples v Calicut Globstars** (ID 36028568). Actual match winner: **Calicut Globstars**. Stored match prediction: **Alleppey Ripples** (Wrong); current server: **Calicut Globstars** (Correct); page match-start: **Calicut Globstars**. Source: Match record. Current rule: Kerala Bookie Trap (Fade Public).
- **05 Sept 2026, 19:00 · Thrissur Titans v Calicut Globstars** (ID 36032393). Actual match winner: **Thrissur Titans**. Stored match prediction: **Thrissur Titans** (Correct); current server: **Thrissur Titans** (Correct); page match-start: **Thrissur Titans**. Source: Match record. Current rule: Kerala Lay Resistance Dump.

### Metro Bank One Day Cup

1 matches; 1 verified. Stored: 1/1; current replay: 1/1.

- **20 Sept 2026, 15:30 · Leicestershire v Middlesex** (ID 36075087). Actual match winner: **Middlesex**. Stored match prediction: **Middlesex** (Correct); current server: **Middlesex** (Correct); page match-start: **Middlesex**. Source: Match record. Toss prediction (separate): Middlesex; toss winner: Leicestershire. Current rule: (Good Buy).

### Metro Bank Womens One Day Cup

18 matches; 18 verified. Stored: 12/18; current replay: 13/15.

- **03 Sept 2026, 15:00 · Durham W v Hampshire W** (ID 36019728). Actual match winner: **Hampshire W**. Stored match prediction: **Durham W** (Wrong); current server: **Durham W** (Wrong); page match-start: **Durham W**. Source: Match record. Current rule: Womens Smart Inflow Margin.
- **03 Sept 2026, 15:00 · Lancashire Thunder W v Surrey W** (ID 36020183). Actual match winner: **Lancashire Thunder W**. Stored match prediction: **Lancashire Thunder W** (Correct); current server: **Lancashire Thunder W** (Correct); page match-start: **Lancashire Thunder W**. Source: Match record. Current rule: Womens Smart Inflow Margin.
- **03 Sept 2026, 15:00 · Warwickshire W v Essex W** (ID 36020284). Actual match winner: **Warwickshire W**. Stored match prediction: **Warwickshire W** (Correct); current server: **Warwickshire W** (Correct); page match-start: **Warwickshire W**. Source: Match record. Current rule: Womens Smart Inflow Margin.
- **03 Sept 2026, 15:00 · Yorkshire W v Somerset W** (ID 36020883). Actual match winner: **Somerset W**. Stored match prediction: **Yorkshire W** (Wrong); current server: **Somerset W** (Correct); page match-start: **Somerset W**. Source: Match record. Current rule: Pre-match league rule: lay share >= 0.1 → lower pre-match P/L.
- **06 Sept 2026, 15:00 · Derbyshire Falcons W v Northamptonshire W** (ID 36022934). Actual match winner: **Northamptonshire W**. Stored match prediction: **Northamptonshire W** (Correct); current server: **Northamptonshire W** (Correct); page match-start: **Northamptonshire W**. Source: Match record. Current rule: Womens Dual Flow Advantage.
- **06 Sept 2026, 15:00 · Kent W v Leicestershire Foxes W** (ID 36023006). Actual match winner: **Kent W**. Stored match prediction: **Kent W** (Correct); current server: **Kent W** (Correct); page match-start: **Kent W**. Source: Match record. Current rule: Womens Smart Inflow Margin.
- **06 Sept 2026, 15:00 · Middlesex W v Glamorgan W** (ID 36023082). Actual match winner: **Middlesex W**. Stored match prediction: **Glamorgan W** (Wrong); current server: **Glamorgan W** (Wrong); page match-start: **Glamorgan W**. Source: Match record. Current rule: Womens Smart Inflow Margin.
- **06 Sept 2026, 15:00 · Worcestershire Rapids W v Gloucestershire W** (ID 36023505). Actual match winner: **Gloucestershire W**. Stored match prediction: **Gloucestershire W** (Correct); current server: **Gloucestershire W** (Correct); page match-start: **Gloucestershire W**. Source: Match record. Current rule: Womens Volume Leader.
- **06 Sept 2026, 15:00 · Essex W v Surrey W** (ID 36027509). Actual match winner: **Surrey W**. Stored match prediction: **Essex W** (Wrong); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **06 Sept 2026, 15:00 · Lancashire Thunder W v Durham W** (ID 36027620). Actual match winner: **Lancashire Thunder W**. Stored match prediction: **Lancashire Thunder W** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **06 Sept 2026, 15:00 · The Blaze W v Somerset W** (ID 36027698). Actual match winner: **The Blaze W**. Stored match prediction: **The Blaze W** (Correct); current server: **The Blaze W** (Correct); page match-start: **The Blaze W**. Source: Match record. Current rule: Womens Smart Inflow Margin.
- **06 Sept 2026, 15:00 · Hampshire W v Yorkshire W** (ID 36027752). Actual match winner: **Hampshire W**. Stored match prediction: **Yorkshire W** (Wrong); current server: **Hampshire W** (Correct); page match-start: **Hampshire W**. Source: Match record. Current rule: Pre-match league rule: lay share >= 0.1 → lower pre-match P/L.
- **11 Sept 2026, 15:00 · The Blaze W v Essex W** (ID 36052861). Actual match winner: **The Blaze W**. Stored match prediction: **The Blaze W** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **12 Sept 2026, 15:00 · Durham W v Warwickshire W** (ID 36051729). Actual match winner: **Durham W**. Stored match prediction: **Warwickshire W** (Wrong); current server: **Durham W** (Correct); page match-start: **Durham W**. Source: Match record. Current rule: Pre-match league rule: lay share >= 0.1 → lower pre-match P/L.
- **12 Sept 2026, 15:00 · Surrey W v Somerset W** (ID 36051845). Actual match winner: **Surrey W**. Stored match prediction: **Surrey W** (Correct); current server: **Surrey W** (Correct); page match-start: **Surrey W**. Source: Match record. Current rule: Womens Dual Flow Advantage.
- **12 Sept 2026, 15:00 · Yorkshire W v Lancashire Thunder W** (ID 36052441). Actual match winner: **Lancashire Thunder W**. Stored match prediction: **Lancashire Thunder W** (Correct); current server: **Lancashire Thunder W** (Correct); page match-start: **Lancashire Thunder W**. Source: Match record. Current rule: Womens Smart Inflow Margin.
- **19 Sept 2026, 15:00 · The Blaze W v Hampshire W** (ID 36082549). Actual match winner: **The Blaze W**. Stored match prediction: **The Blaze W** (Correct); current server: **The Blaze W** (Correct); page match-start: **The Blaze W**. Source: Match record. Current rule: Womens Smart Inflow Margin.
- **20 Sept 2026, 15:00 · Middlesex W v Glamorgan W** (ID 36082557). Actual match winner: **Middlesex W**. Stored match prediction: **Middlesex W** (Correct); current server: **Middlesex W** (Correct); page match-start: **Middlesex W**. Source: Match record. Current rule: Womens Smart Inflow Margin.

### Netherlands Topklasse T20

14 matches; 9 verified. Stored: 4/9; current replay: 6/7.

- **29 Aug 2026, 14:30 · Excelsior 20 v Vcc** (ID 35987242). Actual match winner: **Vcc**. Stored match prediction: **Excelsior 20** (Wrong); current server: **Vcc** (Correct); page match-start: **Vcc**. Source: Match record. Current rule: Pre-match league rule: activity share <= 0.75 → opposite back leader.
- **29 Aug 2026, 15:30 · Rotterdam Cricket Club v Hermes-Dvs** (ID 35987261). Actual match winner: **Rotterdam Cricket Club**. Stored match prediction: **Hermes-Dvs** (Wrong); current server: **Rotterdam Cricket Club** (Correct); page match-start: **Rotterdam Cricket Club**. Source: Match record. Current rule: Pre-match league rule: activity share <= 0.75 → opposite back leader.
- **29 Aug 2026, 18:30 · Sparta v HCC** (ID 35987270). Actual match winner: **No Result**. Stored match prediction: **HCC** (Unscored); current server: **Unavailable** (Unscored); page match-start: **Unavailable**. Source: Match record. 
- **29 Aug 2026, 18:30 · Excelsior 20 v SV Kampong Cricket** (ID 35987280). Actual match winner: **No Result**. Stored match prediction: **SV Kampong Cricket** (Unscored); current server: **SV Kampong Cricket** (Unscored); page match-start: **SV Kampong Cricket**. Source: Match record. Current rule: Maximum Money Lead (100% Share).
- **29 Aug 2026, 19:30 · Rotterdam Cricket Club v Vra** (ID 35987286). Actual match winner: **No Result**. Stored match prediction: **Vra** (Unscored); current server: **Unavailable** (Unscored); page match-start: **Unavailable**. Source: Match record. 
- **30 Aug 2026, 18:30 · SV Kampong Cricket v Vcc** (ID 35997475). Actual match winner: **No Result**. Stored match prediction: **Vcc** (Unscored); current server: **Unavailable** (Unscored); page match-start: **Unavailable**. Source: Match record. 
- **30 Aug 2026, 18:30 · Vra v Hermes-Dvs** (ID 35997508). Actual match winner: **No Result**. Stored match prediction: **Vra** (Unscored); current server: **Unavailable** (Unscored); page match-start: **Unavailable**. Source: Match record. 
- **05 Sept 2026, 14:30 · Vra v Sparta** (ID 36023016). Actual match winner: **Vra**. Stored match prediction: **Vra** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **05 Sept 2026, 18:30 · Hermes-Dvs v SV Kampong Cricket** (ID 36023020). Actual match winner: **Hermes-Dvs**. Stored match prediction: **SV Kampong Cricket** (Wrong); current server: **Hermes-Dvs** (Correct); page match-start: **Hermes-Dvs**. Source: Match record. Current rule: Pre-match league rule: activity share <= 0.75 → opposite back leader.
- **05 Sept 2026, 18:30 · Vra v Excelsior 20** (ID 36030087). Actual match winner: **Vra**. Stored match prediction: **Vra** (Correct); current server: **Vra** (Correct); page match-start: **Vra**. Source: Match record. Current rule: (Maximum Money + Back + Lay Alignment).
- **05 Sept 2026, 19:30 · Vcc v HCC** (ID 36023022). Actual match winner: **HCC**. Stored match prediction: **Vcc** (Wrong); current server: **HCC** (Correct); page match-start: **HCC**. Source: Match record. Current rule: Pre-match league rule: activity share <= 0.75 → opposite back leader.
- **06 Sept 2026, 15:30 · Vcc v Rotterdam Cricket Club** (ID 36034430). Actual match winner: **Rotterdam Cricket Club**. Stored match prediction: **Rotterdam Cricket Club** (Correct); current server: **Rotterdam Cricket Club** (Correct); page match-start: **Rotterdam Cricket Club**. Source: Match record. Current rule: Maximum Money Lead (82% Share).
- **06 Sept 2026, 19:30 · Excelsior 20 v Sparta** (ID 36034512). Actual match winner: **Excelsior 20**. Stored match prediction: **Excelsior 20** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **06 Sept 2026, 19:30 · Rotterdam Cricket Club v HCC** (ID 36035088). Actual match winner: **Rotterdam Cricket Club**. Stored match prediction: **HCC** (Wrong); current server: **HCC** (Wrong); page match-start: **HCC**. Source: Match record. Current rule: (Good Buy).

### One Day Internationals

10 matches; 5 verified. Stored: 2/5; current replay: 2/4.

- **15 Aug 2026, 15:15 · Ireland v Afghanistan** (ID 35931559). Actual match winner: **Afghanistan**. Stored match prediction: **Afghanistan** (Correct); current server: **Afghanistan** (Correct); page match-start: **Afghanistan**. Source: Match record. Toss prediction (separate): Afghanistan; toss winner: Afghanistan. Current rule: Maximum Money Lead (61% Share).
- **11 Sept 2026, 13:00 · Namibia v South Africa** (ID 36051688). Actual match winner: **South Africa**. Stored match prediction: **Namibia** (Wrong); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. Toss prediction (separate): Namibia; toss winner: Namibia. 
- **20 Sept 2026, 13:00 · Zimbabwe v Australia** (ID 36085898). Actual match winner: **Australia**. Stored match prediction: **Australia** (Correct); current server: **Australia** (Correct); page match-start: **Australia**. Source: Match record. Toss prediction (separate): Australia; toss winner: Zimbabwe. Current rule: (Maximum Money + Back + Lay Alignment).
- **24 Sept 2026, 13:30 · South Africa v Australia** (ID 36083840). Actual match winner: **South Africa**. Stored match prediction: **Australia** (Wrong); current server: **Australia** (Wrong); page match-start: **Australia**. Source: Match record. Toss prediction (separate): South Africa; toss winner: Australia. Current rule: Maximum Money Lead (95% Share).
- **24 Sept 2026, 17:00 · England v Sri Lanka** (ID 36103843). Actual match winner: **Sri Lanka**. Stored match prediction: **England** (Wrong); current server: **England** (Wrong); page match-start: **England**. Source: Match record. Toss prediction (separate): Sri Lanka; toss winner: Sri Lanka. Current rule: (Maximum Money + Back + Lay Alignment).
- **27 Sept 2026, 13:30 · South Africa v Australia** (ID 36111199). Actual match winner: **South Africa**. Stored match prediction: **Unavailable** (No prediction); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Toss record only. Toss prediction (separate): South Africa; toss winner: Australia. 
- **27 Sept 2026, 14:00 · India v West Indies** (ID 36100425). Actual match winner: **India**. Stored match prediction: **Unavailable** (No prediction); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Toss record only. Toss prediction (separate): West Indies; toss winner: India. 
- **27 Sept 2026, 15:00 · England v Sri Lanka** (ID 36111684). Actual match winner: **England**. Stored match prediction: **Unavailable** (No prediction); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Toss record only. Toss prediction (separate): England; toss winner: England. 
- **30 Sept 2026, 14:00 · India v West Indies** (ID 36125669). Actual match winner: **India**. Stored match prediction: **Unavailable** (No prediction); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Toss record only. Toss prediction (separate): West Indies; toss winner: India. 
- **30 Sept 2026, 17:00 · South Africa v Australia** (ID 36124730). Actual match winner: **Australia**. Stored match prediction: **Unavailable** (No prediction); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Toss record only. Toss prediction (separate): South Africa; toss winner: South Africa. 

### One Day Matches

3 matches; 2 verified. Stored: 0/2; current replay: 0/1.

- **06 Sept 2026, 13:00 · South Africa A v Bangladesh A** (ID 36031389). Actual match winner: **No Result**. Stored match prediction: **South Africa A** (Unscored); current server: **Unavailable** (Unscored); page match-start: **Unavailable**. Source: Match record. 
- **12 Sept 2026, 13:30 · South Africa A v Bangladesh A** (ID 36051616). Actual match winner: **Bangladesh A**. Stored match prediction: **South Africa A** (Wrong); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **12 Sept 2026, 15:00 · England U19 v Pakistan U19** (ID 36059692). Actual match winner: **Pakistan U19**. Stored match prediction: **England U19** (Wrong); current server: **England U19** (Wrong); page match-start: **England U19**. Source: Match record. Current rule: (Good Buy).

### Sher E Punjab T20 League

23 matches; 23 verified. Stored: 22/23; current replay: 17/17.

- **31 Aug 2026, 13:00 · Jalandhar Warriors v Fazilka Falcons** (ID 36014652). Actual match winner: **Fazilka Falcons**. Stored match prediction: **Fazilka Falcons** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **31 Aug 2026, 19:00 · Mohali Kings v Bathinda Royals** (ID 36004132). Actual match winner: **Bathinda Royals**. Stored match prediction: **Bathinda Royals** (Correct); current server: **Bathinda Royals** (Correct); page match-start: **Bathinda Royals**. Source: Match record. Current rule: Sher-e-Punjab Lay Shield (Lay Absorbed).
- **01 Sept 2026, 13:00 · Bathinda Royals v Ludhiana Lion** (ID 36015981). Actual match winner: **Ludhiana Lion**. Stored match prediction: **Ludhiana Lion** (Correct); current server: **Ludhiana Lion** (Correct); page match-start: **Ludhiana Lion**. Source: Match record. Current rule: Sher-e-Punjab Lay Resistance Dump (Fade to Clean Inflow).
- **01 Sept 2026, 19:00 · Jalandhar Warriors v Amritsar Soormas** (ID 36015901). Actual match winner: **Jalandhar Warriors**. Stored match prediction: **Jalandhar Warriors** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **02 Sept 2026, 13:00 · Mohali Kings v Ludhiana Lion** (ID 36018467). Actual match winner: **Ludhiana Lion**. Stored match prediction: **Ludhiana Lion** (Correct); current server: **Ludhiana Lion** (Correct); page match-start: **Ludhiana Lion**. Source: Match record. Current rule: Sher-e-Punjab Bookie Trap (Fade Public).
- **02 Sept 2026, 19:00 · Fazilka Falcons v Amritsar Soormas** (ID 36019307). Actual match winner: **Amritsar Soormas**. Stored match prediction: **Amritsar Soormas** (Correct); current server: **Amritsar Soormas** (Correct); page match-start: **Amritsar Soormas**. Source: Match record. Current rule: Pre-match league rule: lay share >= 0.1 and normalized activity surplus >= -0.25 → activity leader.
- **03 Sept 2026, 13:00 · Bathinda Royals v Jalandhar Warriors** (ID 36020656). Actual match winner: **Jalandhar Warriors**. Stored match prediction: **Jalandhar Warriors** (Correct); current server: **Jalandhar Warriors** (Correct); page match-start: **Jalandhar Warriors**. Source: Match record. Current rule: Sher-e-Punjab Bookie Trap (Fade Public).
- **03 Sept 2026, 19:00 · Fazilka Falcons v Mohali Kings** (ID 36022046). Actual match winner: **Mohali Kings**. Stored match prediction: **Mohali Kings** (Correct); current server: **Mohali Kings** (Correct); page match-start: **Mohali Kings**. Source: Match record. Current rule: Maximum Money Lead (73% Share).
- **04 Sept 2026, 13:00 · Bathinda Royals v Amritsar Soormas** (ID 36027073). Actual match winner: **Bathinda Royals**. Stored match prediction: **Bathinda Royals** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **04 Sept 2026, 19:00 · Ludhiana Lion v Jalandhar Warriors** (ID 36026793). Actual match winner: **Jalandhar Warriors**. Stored match prediction: **Jalandhar Warriors** (Correct); current server: **Jalandhar Warriors** (Correct); page match-start: **Jalandhar Warriors**. Source: Match record. Current rule: Pre-match league rule: lay share >= 0.1 and normalized activity surplus >= -0.25 → activity leader.
- **05 Sept 2026, 13:00 · Fazilka Falcons v Bathinda Royals** (ID 36029487). Actual match winner: **Fazilka Falcons**. Stored match prediction: **Fazilka Falcons** (Correct); current server: **Fazilka Falcons** (Correct); page match-start: **Fazilka Falcons**. Source: Match record. Current rule: Money Leader (53% Share).
- **05 Sept 2026, 19:00 · Jalandhar Warriors v Mohali Kings** (ID 36030307). Actual match winner: **Mohali Kings**. Stored match prediction: **Mohali Kings** (Correct); current server: **Mohali Kings** (Correct); page match-start: **Mohali Kings**. Source: Match record. Current rule: Sher-e-Punjab Bookie Trap (Fade Public).
- **06 Sept 2026, 13:00 · Bathinda Royals v Jalandhar Warriors** (ID 36034145). Actual match winner: **Bathinda Royals**. Stored match prediction: **Bathinda Royals** (Correct); current server: **Bathinda Royals** (Correct); page match-start: **Bathinda Royals**. Source: Match record. Current rule: (Maximum Money + Back + Lay Alignment).
- **06 Sept 2026, 19:00 · Ludhiana Lion v Fazilka Falcons** (ID 36034192). Actual match winner: **Fazilka Falcons**. Stored match prediction: **Fazilka Falcons** (Correct); current server: **Fazilka Falcons** (Correct); page match-start: **Fazilka Falcons**. Source: Match record. Current rule: (Maximum Money + Back + Lay Alignment).
- **07 Sept 2026, 13:00 · Mohali Kings v Ludhiana Lion** (ID 36038498). Actual match winner: **Mohali Kings**. Stored match prediction: **Mohali Kings** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **07 Sept 2026, 19:00 · Amritsar Soormas v Fazilka Falcons** (ID 36043600). Actual match winner: **Amritsar Soormas**. Stored match prediction: **Amritsar Soormas** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **08 Sept 2026, 13:00 · Amritsar Soormas v Mohali Kings** (ID 36043141). Actual match winner: **Amritsar Soormas**. Stored match prediction: **Amritsar Soormas** (Correct); current server: **Amritsar Soormas** (Correct); page match-start: **Amritsar Soormas**. Source: Match record. Current rule: Pre-match league rule: lay share >= 0.1 and normalized activity surplus >= -0.25 → activity leader.
- **08 Sept 2026, 19:00 · Ludhiana Lion v Jalandhar Warriors** (ID 36044252). Actual match winner: **Jalandhar Warriors**. Stored match prediction: **Jalandhar Warriors** (Correct); current server: **Jalandhar Warriors** (Correct); page match-start: **Jalandhar Warriors**. Source: Match record. Current rule: Sher-e-Punjab Bookie Trap (Fade Public).
- **10 Sept 2026, 13:00 · Jalandhar Warriors v Amritsar Soormas** (ID 36052400). Actual match winner: **Amritsar Soormas**. Stored match prediction: **Amritsar Soormas** (Correct); current server: **Amritsar Soormas** (Correct); page match-start: **Amritsar Soormas**. Source: Match record. Current rule: Pre-match league rule: lay share <= 0.9 and total-flow share >= 0.5 → opposite back leader.
- **10 Sept 2026, 19:00 · Fazilka Falcons v Bathinda Royals** (ID 36052409). Actual match winner: **Fazilka Falcons**. Stored match prediction: **Fazilka Falcons** (Correct); current server: **Fazilka Falcons** (Correct); page match-start: **Fazilka Falcons**. Source: Match record. Current rule: Sher-e-Punjab Lay Shield (Lay Absorbed).
- **11 Sept 2026, 19:00 · Amritsar Soormas v Ludhiana Lion** (ID 36054928). Actual match winner: **Ludhiana Lion**. Stored match prediction: **Amritsar Soormas** (Wrong); current server: **Ludhiana Lion** (Correct); page match-start: **Ludhiana Lion**. Source: Match record. Current rule: Pre-match league rule: lay share <= 0.9 and total-flow share >= 0.5 → opposite back leader.
- **12 Sept 2026, 13:00 · Mohali Kings v Amritsar Soormas** (ID 36060837). Actual match winner: **Amritsar Soormas**. Stored match prediction: **Amritsar Soormas** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **12 Sept 2026, 19:00 · Ludhiana Lion v Jalandhar Warriors** (ID 36060868). Actual match winner: **Ludhiana Lion**. Stored match prediction: **Ludhiana Lion** (Correct); current server: **Ludhiana Lion** (Correct); page match-start: **Ludhiana Lion**. Source: Match record. Current rule: Maximum Money Lead (65% Share).

### South Africa T20 Challenge

4 matches; 2 verified. Stored: 1/2; current replay: 1/2.

- **25 Sept 2026, 17:30 · Warriors v North West Dragons** (ID 36099057). Actual match winner: **North West Dragons**. Stored match prediction: **Warriors** (Wrong); current server: **Warriors** (Wrong); page match-start: **Warriors**. Source: Match record. Current rule: (Maximum Money + Back + Lay Alignment).
- **25 Sept 2026, 21:30 · Titans v Western Province** (ID 36099060). Actual match winner: **Titans**. Stored match prediction: **Titans** (Correct); current server: **Titans** (Correct); page match-start: **Titans**. Source: Match record. Current rule: Maximum Money Lead (92% Share).
- **26 Sept 2026, 16:30 · Northern Cape v Eastern Cape Linyathi** (ID 36103410). Actual match winner: **No Result**. Stored match prediction: **Northern Cape** (Unscored); current server: **Northern Cape** (Unscored); page match-start: **Northern Cape**. Source: Match record. Current rule: (Maximum Money + Back + Lay Alignment).
- **01 Oct 2026, 16:30 · Garden Route Badgers v Eastern Cape Linyathi** (ID 36127430). Actual match winner: **Garden Route Badgers**. Stored match prediction: **Unavailable** (No prediction); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Toss record only. Toss prediction (separate): Garden Route Badgers; toss winner: Garden Route Badgers. 

### T20 African Continental Cup

2 matches; 2 verified. Stored: 2/2; current replay: 2/2.

- **08 Sept 2026, 13:00 · Rwanda v Botswana** (ID 36039224). Actual match winner: **Rwanda**. Stored match prediction: **Rwanda** (Correct); current server: **Rwanda** (Correct); page match-start: **Rwanda**. Source: Match record. Current rule: Maximum Money Lead (73% Share).
- **08 Sept 2026, 17:30 · Kenya v Sierra Leone** (ID 36039256). Actual match winner: **Kenya**. Stored match prediction: **Kenya** (Correct); current server: **Kenya** (Correct); page match-start: **Kenya**. Source: Match record. Current rule: Maximum Money Lead (99% Share).

### T20 Matches

1 matches; 1 verified. Stored: 1/1; current replay: 1/1.

- **11 Sept 2026, 23:00 · England Lions v Sri Lanka** (ID 36050868). Actual match winner: **England Lions**. Stored match prediction: **England Lions** (Correct); current server: **England Lions** (Correct); page match-start: **England Lions**. Source: Match record. Current rule: (Maximum Money + Back + Lay Alignment).

### Tamil Nadu Premier League

9 matches; 8 verified. Stored: 5/8; current replay: 5/8.

- **19 Aug 2026, 19:30 · Dindigul Dragons v Ruby Trichy Warriors** (ID 35948552). Actual match winner: **Ruby Trichy Warriors**. Stored match prediction: **Dindigul Dragons** (Wrong); current server: **Dindigul Dragons** (Wrong); page match-start: **Dindigul Dragons**. Source: Match record. Toss prediction (separate): Dindigul Dragons; toss winner: Dindigul Dragons. Current rule: TNPL Bookie Trap (Fade Public).
- **20 Aug 2026, 15:30 · Madurai Panthers v Tiruppur Tamizhans** (ID 35955958). Actual match winner: **Tiruppur Tamizhans**. Stored match prediction: **Madurai Panthers** (Wrong); current server: **Madurai Panthers** (Wrong); page match-start: **Madurai Panthers**. Source: Match record. Toss prediction (separate): Tiruppur Tamizhans; toss winner: Tiruppur Tamizhans. Current rule: TNPL Bookie Trap (Fade Public).
- **20 Aug 2026, 19:30 · Nellai Royal Kings v Salem Spartans** (ID 35950773). Actual match winner: **Nellai Royal Kings**. Stored match prediction: **Nellai Royal Kings** (Correct); current server: **Nellai Royal Kings** (Correct); page match-start: **Nellai Royal Kings**. Source: Match record. Toss prediction (separate): Salem Spartans; toss winner: Salem Spartans. Current rule: TNPL Bookie Trap (Fade Public).
- **21 Aug 2026, 15:30 · Lyca Kovai Kings v Dindigul Dragons** (ID 35958414). Actual match winner: **Lyca Kovai Kings**. Stored match prediction: **Lyca Kovai Kings** (Correct); current server: **Lyca Kovai Kings** (Correct); page match-start: **Lyca Kovai Kings**. Source: Match record. Toss prediction (separate): Dindigul Dragons; toss winner: Dindigul Dragons. Current rule: TNPL Bookie Trap (Fade Public).
- **21 Aug 2026, 19:30 · Ruby Trichy Warriors v Chepauk Super Gillies** (ID 35958346). Actual match winner: **Ruby Trichy Warriors**. Stored match prediction: **Ruby Trichy Warriors** (Correct); current server: **Ruby Trichy Warriors** (Correct); page match-start: **Ruby Trichy Warriors**. Source: Match record. Toss prediction (separate): Ruby Trichy Warriors; toss winner: Ruby Trichy Warriors. Current rule: TNPL Bookie Trap (Fade Public).
- **22 Aug 2026, 15:30 · Tiruppur Tamizhans v Salem Spartans** (ID 35962365). Actual match winner: **Salem Spartans**. Stored match prediction: **Salem Spartans** (Correct); current server: **Salem Spartans** (Correct); page match-start: **Salem Spartans**. Source: Match record. Toss prediction (separate): Salem Spartans; toss winner: Salem Spartans. Current rule: TNPL Bookie Trap (Fade Public).
- **22 Aug 2026, 19:30 · Nellai Royal Kings v Madurai Panthers** (ID 35962407). Actual match winner: **Madurai Panthers**. Stored match prediction: **Madurai Panthers** (Correct); current server: **Madurai Panthers** (Correct); page match-start: **Madurai Panthers**. Source: Match record. Toss prediction (separate): Madurai Panthers; toss winner: Madurai Panthers. Current rule: TNPL Bookie Trap (Fade Public).
- **24 Aug 2026, 19:30 · Lyca Kovai Kings v Tiruppur Tamizhans** (ID 35973277). Actual match winner: **No Result**. Stored match prediction: **Lyca Kovai Kings** (Unscored); current server: **Lyca Kovai Kings** (Unscored); page match-start: **Lyca Kovai Kings**. Source: Match record. Toss prediction (separate): Lyca Kovai Kings; toss winner: Lyca Kovai Kings. Current rule: TNPL Bookie Trap (Fade Public).
- **28 Aug 2026, 19:30 · Madurai Panthers v Lyca Kovai Kings** (ID 35988179). Actual match winner: **Lyca Kovai Kings**. Stored match prediction: **Madurai Panthers** (Wrong); current server: **Madurai Panthers** (Wrong); page match-start: **Madurai Panthers**. Source: Match record. Current rule: TNPL Bookie Trap (Fade Public).

### Test Matches

5 matches; 5 verified. Stored: 5/5; current replay: 5/5.

- **15 Aug 2026, 10:00 · Sri Lanka v India** (ID 35913614). Actual match winner: **India**. Stored match prediction: **India** (Correct); current server: **India** (Correct); page match-start: **India**. Source: Match record. Toss prediction (separate): India; toss winner: India. Current rule: (Maximum Money + Back + Lay Alignment).
- **19 Aug 2026, 15:30 · England v Pakistan** (ID 35913612). Actual match winner: **England**. Stored match prediction: **England** (Correct); current server: **England** (Correct); page match-start: **England**. Source: Match record. Toss prediction (separate): England; toss winner: England. Current rule: (Good Buy).
- **22 Aug 2026, 05:30 · Australia v Bangladesh** (ID 35947011). Actual match winner: **Australia**. Stored match prediction: **Australia** (Correct); current server: **Australia** (Correct); page match-start: **Australia**. Source: Match record. Toss prediction (separate): Australia; toss winner: Australia. Current rule: Maximum Money Lead (78% Share).
- **27 Aug 2026, 15:30 · England v Pakistan** (ID 35966902). Actual match winner: **England**. Stored match prediction: **England** (Correct); current server: **England** (Correct); page match-start: **England**. Source: Match record. Toss prediction (separate): Pakistan; toss winner: Pakistan. Current rule: (Maximum Money + Back + Lay Alignment).
- **09 Sept 2026, 15:30 · England v Pakistan** (ID 36022943). Actual match winner: **England**. Stored match prediction: **England** (Correct); current server: **England** (Correct); page match-start: **England**. Source: Match record. Current rule: Maximum Money Lead (96% Share).

### The Hundred

2 matches; 2 verified. Stored: 2/2; current replay: 2/2.

- **14 Aug 2026, 22:30 · Manchester Super Giants v Sunrisers Leeds** (ID 35933619). Actual match winner: **Manchester Super Giants**. Stored match prediction: **Manchester Super Giants** (Correct); current server: **Manchester Super Giants** (Correct); page match-start: **Manchester Super Giants**. Source: Match record. Toss prediction (separate): Sunrisers Leeds; toss winner: Sunrisers Leeds. Current rule: The Hundred Volume Margin.
- **16 Aug 2026, 22:30 · Trent Rockets v Manchester Super Giants** (ID 35941131). Actual match winner: **Manchester Super Giants**. Stored match prediction: **Manchester Super Giants** (Correct); current server: **Manchester Super Giants** (Correct); page match-start: **Manchester Super Giants**. Source: Match record. Toss prediction (separate): Manchester Super Giants; toss winner: Manchester Super Giants. Current rule: The Hundred Dual Advantage (Strong Buy).

### The Hundred - Womens

2 matches; 2 verified. Stored: 1/2; current replay: 1/2.

- **14 Aug 2026, 18:45 · Sunrisers Leeds W v Southern Brave W** (ID 35929461). Actual match winner: **Sunrisers Leeds W**. Stored match prediction: **Sunrisers Leeds W** (Correct); current server: **Southern Brave W** (Wrong); page match-start: **Southern Brave W**. Source: Match record. Toss prediction (separate): Sunrisers Leeds W; toss winner: Sunrisers Leeds W. Current rule: Womens Dual Flow Advantage.
- **16 Aug 2026, 18:45 · Trent Rockets W v Sunrisers Leeds W** (ID 35940115). Actual match winner: **Trent Rockets W**. Stored match prediction: **Sunrisers Leeds W** (Wrong); current server: **Trent Rockets W** (Correct); page match-start: **Trent Rockets W**. Source: Match record. Toss prediction (separate): Trent Rockets W; toss winner: Trent Rockets W. Current rule: Womens Smart Inflow Margin.

### Unofficial International Matches

1 matches; 1 verified. Stored: 1/1; current replay: 1/1.

- **21 Sept 2026, 09:00 · India U19 v Australia U19** (ID 36086137). Actual match winner: **India U19**. Stored match prediction: **India U19** (Correct); current server: **India U19** (Correct); page match-start: **India U19**. Source: Match record. Current rule: Money Leader (50% Share).

### Uttar Pradesh Premier League

11 matches; 10 verified. Stored: 7/10; current replay: 10/10.

- **28 Aug 2026, 19:13 · Kashi Rudras v Noida Super Kings** (ID 35987416). Actual match winner: **Kashi Rudras**. Stored match prediction: **Kashi Rudras** (Correct); current server: **Kashi Rudras** (Correct); page match-start: **Kashi Rudras**. Source: Match record. Current rule: UP Pre-Match Activity Lead.
- **29 Aug 2026, 14:54 · Meerut Mavericks v Lucknow Falcons** (ID 35985679). Actual match winner: **No Result**. Stored match prediction: **Meerut Mavericks** (Unscored); current server: **Meerut Mavericks** (Unscored); page match-start: **Meerut Mavericks**. Source: Match record. Current rule: UP Bookie Trap Fortress.
- **29 Aug 2026, 21:52 · Kanpur Superstar v Noida Super Kings** (ID 35994069). Actual match winner: **Kanpur Superstar**. Stored match prediction: **Kanpur Superstar** (Correct); current server: **Kanpur Superstar** (Correct); page match-start: **Kanpur Superstar**. Source: Match record. Current rule: UP Pre-Match Activity Lead.
- **30 Aug 2026, 14:33 · Gorakhpur Lions v Lucknow Falcons** (ID 35997459). Actual match winner: **Lucknow Falcons**. Stored match prediction: **Lucknow Falcons** (Correct); current server: **Lucknow Falcons** (Correct); page match-start: **Lucknow Falcons**. Source: Match record. Current rule: UP Bookmaker Lay Shield.
- **30 Aug 2026, 21:50 · Noida Super Kings v Meerut Mavericks** (ID 35997903). Actual match winner: **Noida Super Kings**. Stored match prediction: **Noida Super Kings** (Correct); current server: **Noida Super Kings** (Correct); page match-start: **Noida Super Kings**. Source: Match record. Current rule: UP Pre-Match Activity Lead.
- **31 Aug 2026, 19:20 · Kanpur Superstar v Lucknow Falcons** (ID 36005017). Actual match winner: **Lucknow Falcons**. Stored match prediction: **Lucknow Falcons** (Correct); current server: **Lucknow Falcons** (Correct); page match-start: **Lucknow Falcons**. Source: Match record. Current rule: UP Bookmaker Lay Shield.
- **01 Sept 2026, 15:32 · Meerut Mavericks v Kashi Rudras** (ID 36013979). Actual match winner: **Kashi Rudras**. Stored match prediction: **Meerut Mavericks** (Wrong); current server: **Kashi Rudras** (Correct); page match-start: **Kashi Rudras**. Source: Match record. Current rule: Pre-match league rule: normalized activity surplus <= 0 → higher pre-match P/L.
- **03 Sept 2026, 15:18 · Meerut Mavericks v Lucknow Falcons** (ID 36020698). Actual match winner: **Lucknow Falcons**. Stored match prediction: **Lucknow Falcons** (Correct); current server: **Lucknow Falcons** (Correct); page match-start: **Lucknow Falcons**. Source: Match record. Current rule: UP Pre-Match Activity Lead.
- **03 Sept 2026, 20:04 · Kashi Rudras v Noida Super Kings** (ID 36020715). Actual match winner: **Noida Super Kings**. Stored match prediction: **Noida Super Kings** (Correct); current server: **Noida Super Kings** (Correct); page match-start: **Noida Super Kings**. Source: Match record. Current rule: UP Bookie Trap Fortress.
- **04 Sept 2026, 19:01 · Meerut Mavericks v Noida Super Kings** (ID 36029181). Actual match winner: **Meerut Mavericks**. Stored match prediction: **Noida Super Kings** (Wrong); current server: **Meerut Mavericks** (Correct); page match-start: **Meerut Mavericks**. Source: Match record. Current rule: Pre-match league rule: normalized activity surplus <= 0 → higher pre-match P/L.
- **06 Sept 2026, 19:12 · Lucknow Falcons v Meerut Mavericks** (ID 36032328). Actual match winner: **Meerut Mavericks**. Stored match prediction: **Lucknow Falcons** (Wrong); current server: **Meerut Mavericks** (Correct); page match-start: **Meerut Mavericks**. Source: Match record. Current rule: Pre-match league rule: normalized activity surplus <= 0 → higher pre-match P/L.

### Uttarakhand Premier League

6 matches; 3 verified. Stored: 3/3; current replay: 1/1.

- **24 Sept 2026, 15:00 · Haridwar Elmas v Rishikesh River Kings** (ID 36107189). Actual match winner: **Haridwar Elmas**. Stored match prediction: **Haridwar Elmas** (Correct); current server: **Haridwar Elmas** (Correct); page match-start: **Haridwar Elmas**. Source: Match record. Current rule: (Maximum Money + Back + Lay Alignment).
- **25 Sept 2026, 15:00 · Pithoragarh Hurricanes v Usn Indians** (ID 36108578). Actual match winner: **Pithoragarh Hurricanes**. Stored match prediction: **Pithoragarh Hurricanes** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **25 Sept 2026, 19:30 · Rishikesh River Kings v Dehradun Warriors** (ID 36111459). Actual match winner: **Rishikesh River Kings**. Stored match prediction: **Rishikesh River Kings** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **26 Sept 2026, 10:30 · Rishikesh River Kings v Pithoragarh Hurricanes** (ID 36115533). Actual match winner: **No Result**. Stored match prediction: **Rishikesh River Kings** (Unscored); current server: **Unavailable** (Unscored); page match-start: **Unavailable**. Source: Match record. 
- **26 Sept 2026, 15:00 · Haridwar Elmas v Dehradun Warriors** (ID 36115539). Actual match winner: **No Result**. Stored match prediction: **Haridwar Elmas** (Unscored); current server: **Haridwar Elmas** (Unscored); page match-start: **Haridwar Elmas**. Source: Match record. Current rule: Money Leader (56% Share).
- **26 Sept 2026, 19:30 · Usn Indians v Tehri Titans** (ID 36115521). Actual match winner: **No Result**. Stored match prediction: **Tehri Titans** (Unscored); current server: **Tehri Titans** (Unscored); page match-start: **Tehri Titans**. Source: Match record. Current rule: (Maximum Money + Back + Lay Alignment).

### Women's Asia Cup T20

7 matches; 7 verified. Stored: 6/7; current replay: 7/7.

- **04 Sept 2026, 20:00 · United Arab Emirates W v Indonesia W** (ID 36023009). Actual match winner: **United Arab Emirates W**. Stored match prediction: **Indonesia W** (Wrong); current server: **United Arab Emirates W** (Correct); page match-start: **United Arab Emirates W**. Source: Match record. Toss prediction (separate): United Arab Emirates W; toss winner: United Arab Emirates W. Current rule: United Arab Emirates W holds massive matched volume dominance (₹6383 vs ₹348).
- **05 Sept 2026, 20:00 · India W v Pakistan W** (ID 36027587). Actual match winner: **India W**. Stored match prediction: **India W** (Correct); current server: **India W** (Correct); page match-start: **India W**. Source: Match record. Toss prediction (separate): India W; toss winner: Pakistan W. Current rule: India W holds massive matched volume dominance (₹295682 vs ₹5907).
- **06 Sept 2026, 20:00 · Bangladesh W v Sri Lanka W** (ID 36023089). Actual match winner: **Sri Lanka W**. Stored match prediction: **Sri Lanka W** (Correct); current server: **Sri Lanka W** (Correct); page match-start: **Sri Lanka W**. Source: Match record. Toss prediction (separate): Sri Lanka W; toss winner: Sri Lanka W. Current rule: Sri Lanka W holds massive matched volume dominance (₹6785 vs ₹381).
- **07 Sept 2026, 20:00 · Hong Kong W v Pakistan W** (ID 36034463). Actual match winner: **Pakistan W**. Stored match prediction: **Pakistan W** (Correct); current server: **Pakistan W** (Correct); page match-start: **Pakistan W**. Source: Match record. Toss prediction (separate): Pakistan W; toss winner: Pakistan W. Current rule: Pakistan W holds massive matched volume dominance (₹67433 vs ₹953).
- **08 Sept 2026, 20:00 · United Arab Emirates W v Bangladesh W** (ID 36039351). Actual match winner: **Bangladesh W**. Stored match prediction: **Bangladesh W** (Correct); current server: **Bangladesh W** (Correct); page match-start: **Bangladesh W**. Source: Match record. Toss prediction (separate): United Arab Emirates W; toss winner: United Arab Emirates W. Current rule: Bangladesh W holds massive matched volume dominance (₹161761 vs ₹2319).
- **10 Sept 2026, 20:00 · India W v Bangladesh W** (ID 36049475). Actual match winner: **India W**. Stored match prediction: **India W** (Correct); current server: **India W** (Correct); page match-start: **India W**. Source: Match record. Toss prediction (separate): Bangladesh W; toss winner: Bangladesh W. Current rule: India W holds massive matched volume dominance (₹214186 vs ₹4047).
- **11 Sept 2026, 20:00 · Sri Lanka W v Pakistan W** (ID 36049024). Actual match winner: **Sri Lanka W**. Stored match prediction: **Sri Lanka W** (Correct); current server: **Sri Lanka W** (Correct); page match-start: **Sri Lanka W**. Source: Match record. Toss prediction (separate): Sri Lanka W; toss winner: Sri Lanka W. Current rule: Sri Lanka W holds massive matched volume dominance (₹15882 vs ₹2419).

### Women's Caribbean Premier League

5 matches; 5 verified. Stored: 3/5; current replay: 3/5.

- **06 Sept 2026, 00:30 · Barbados Tridents W v Trinbago Knight Riders W** (ID 36023098). Actual match winner: **Trinbago Knight Riders W**. Stored match prediction: **Trinbago Knight Riders W** (Correct); current server: **Trinbago Knight Riders W** (Correct); page match-start: **Trinbago Knight Riders W**. Source: Match record. Toss prediction (separate): Trinbago Knight Riders W; toss winner: Barbados Tridents W. Current rule: WCPL Lay Resistance Dump (Fade Short Team).
- **06 Sept 2026, 19:30 · Guyana Amazon Warriors W v Jamaica Empress W** (ID 36023506). Actual match winner: **Jamaica Empress W**. Stored match prediction: **Jamaica Empress W** (Correct); current server: **Jamaica Empress W** (Correct); page match-start: **Jamaica Empress W**. Source: Match record. Toss prediction (separate): Jamaica Empress W; toss winner: Jamaica Empress W. Current rule: WCPL Bookmaker Trap (Fade Public Favorite).
- **10 Sept 2026, 19:30 · Jamaica Empress W v Trinbago Knight Riders W** (ID 36040305). Actual match winner: **Trinbago Knight Riders W**. Stored match prediction: **Jamaica Empress W** (Wrong); current server: **Jamaica Empress W** (Wrong); page match-start: **Jamaica Empress W**. Source: Match record. Toss prediction (separate): Trinbago Knight Riders W; toss winner: Trinbago Knight Riders W. Current rule: WCPL Lay Resistance Dump (Fade Short Team).
- **12 Sept 2026, 19:30 · Guyana Amazon War W v Trinbago Knight Rid W** (ID 36054985). Actual match winner: **Guyana Amazon Warriors W**. Stored match prediction: **Guyana Amazon Warriors W** (Correct); current server: **Guyana Amazon Warriors W** (Correct); page match-start: **Guyana Amazon Warriors W**. Source: Match record. Toss prediction (separate): Guyana Amazon Warriors W; toss winner: Trinbago Knight Riders W. Current rule: WCPL Lay Resistance Dump (Fade Short Team).
- **13 Sept 2026, 00:30 · Barbados Tridents W v Jamaica Empress W** (ID 36055328). Actual match winner: **Barbados Tridents W**. Stored match prediction: **Jamaica Empress W** (Wrong); current server: **Jamaica Empress W** (Wrong); page match-start: **Jamaica Empress W**. Source: Match record. Toss prediction (separate): Barbados Tridents W; toss winner: Barbados Tridents W. Current rule: WCPL Lay Resistance Dump (Fade Short Team).

### Women's One Day Matches

2 matches; 2 verified. Stored: 0/2; current replay: 0/2.

- **20 Sept 2026, 14:00 · India A W v Australia A W** (ID 36091321). Actual match winner: **India A W**. Stored match prediction: **Australia A W** (Wrong); current server: **Australia A W** (Wrong); page match-start: **Australia A W**. Source: Match record. Current rule: Womens Smart Inflow Margin.
- **25 Sept 2026, 14:00 · India A W v Australia A W** (ID 36107251). Actual match winner: **India A W**. Stored match prediction: **Australia A W** (Wrong); current server: **Australia A W** (Wrong); page match-start: **Australia A W**. Source: Match record. Current rule: Womens Dual Flow Advantage.

### Women's T20 County Cup

3 matches; 3 verified. Stored: 3/3; current replay: 1/1.

- **29 Aug 2026, 15:30 · The Blaze W v Essex W** (ID 35982142). Actual match winner: **The Blaze W**. Stored match prediction: **The Blaze W** (Correct); current server: **The Blaze W** (Correct); page match-start: **The Blaze W**. Source: Match record. Current rule: Womens Dual Flow Advantage.
- **29 Aug 2026, 19:00 · Somerset W v Surrey W** (ID 35982192). Actual match winner: **Surrey W**. Stored match prediction: **Surrey W** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 
- **29 Aug 2026, 23:15 · The Blaze W v Surrey W** (ID 36001044). Actual match winner: **The Blaze W**. Stored match prediction: **The Blaze W** (Correct); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Match record. 

### Womens International Twenty20 Matches

11 matches; 10 verified. Stored: 9/10; current replay: 10/10.

- **28 Aug 2026, 20:00 · Hong Kong W v Thailand W** (ID 35982250). Actual match winner: **Thailand W**. Stored match prediction: **Thailand W** (Correct); current server: **Thailand W** (Correct); page match-start: **Thailand W**. Source: Match record. Toss prediction (separate): Thailand W; toss winner: Hong Kong W. Current rule: Pre-match league rule: back share >= 0.55 → opposite activity leader.
- **29 Aug 2026, 20:00 · United Arab Emirates W v Sri Lanka W** (ID 35982257). Actual match winner: **Sri Lanka W**. Stored match prediction: **Sri Lanka W** (Correct); current server: **Sri Lanka W** (Correct); page match-start: **Sri Lanka W**. Source: Match record. Toss prediction (separate): Sri Lanka W; toss winner: Sri Lanka W. Current rule: Womens Dual Flow Advantage.
- **30 Aug 2026, 20:00 · India W v Thailand W** (ID 35982267). Actual match winner: **India W**. Stored match prediction: **India W** (Correct); current server: **India W** (Correct); page match-start: **India W**. Source: Match record. Toss prediction (separate): India W; toss winner: Thailand W. Current rule: Womens Dual Flow Advantage.
- **31 Aug 2026, 20:00 · Bangladesh W v Indonesia W** (ID 35982279). Actual match winner: **Bangladesh W**. Stored match prediction: **Bangladesh W** (Correct); current server: **Bangladesh W** (Correct); page match-start: **Bangladesh W**. Source: Match record. Toss prediction (separate): Bangladesh W; toss winner: Indonesia W. Current rule: Womens Dual Flow Advantage.
- **01 Sept 2026, 20:00 · Pakistan W v Thailand W** (ID 36007810). Actual match winner: **Pakistan W**. Stored match prediction: **Pakistan W** (Correct); current server: **Pakistan W** (Correct); page match-start: **Pakistan W**. Source: Match record. Toss prediction (separate): Pakistan W; toss winner: Pakistan W. Current rule: Womens Dual Flow Advantage.
- **02 Sept 2026, 20:00 · Indonesia W v Sri Lanka W** (ID 36018220). Actual match winner: **Sri Lanka W**. Stored match prediction: **Sri Lanka W** (Correct); current server: **Sri Lanka W** (Correct); page match-start: **Sri Lanka W**. Source: Match record. Toss prediction (separate): Sri Lanka W; toss winner: Indonesia W. Current rule: Womens Dual Flow Advantage.
- **03 Sept 2026, 20:00 · Hong Kong W v India W** (ID 36021032). Actual match winner: **India W**. Stored match prediction: **India W** (Correct); current server: **India W** (Correct); page match-start: **India W**. Source: Match record. Toss prediction (separate): India W; toss winner: Hong Kong W. Current rule: Pre-match league rule: back share >= 0.55 → opposite activity leader.
- **11 Sept 2026, 17:00 · Zimbabwe W v South Africa W** (ID 36050870). Actual match winner: **South Africa W**. Stored match prediction: **South Africa W** (Correct); current server: **South Africa W** (Correct); page match-start: **South Africa W**. Source: Match record. Toss prediction (separate): Zimbabwe W; toss winner: Zimbabwe W. Current rule: Womens Dual Flow Advantage.
- **12 Sept 2026, 06:30 · Japan W v Malaysia W** (ID 36061266). Actual match winner: **No Result**. Stored match prediction: **Japan W** (Unscored); current server: **Unavailable** (Unscored); page match-start: **Unavailable**. Source: Match record. 
- **12 Sept 2026, 18:00 · India A W v Australia A W** (ID 36062380). Actual match winner: **Australia A W**. Stored match prediction: **India A W** (Wrong); current server: **Australia A W** (Correct); page match-start: **Australia A W**. Source: Match record. Current rule: Pre-match league rule: back share >= 0.55 → opposite activity leader.
- **19 Sept 2026, 17:00 · Zimbabwe W v South Africa W** (ID 36082765). Actual match winner: **South Africa W**. Stored match prediction: **South Africa W** (Correct); current server: **South Africa W** (Correct); page match-start: **South Africa W**. Source: Match record. Toss prediction (separate): Zimbabwe W; toss winner: South Africa W. Current rule: Womens Dual Flow Advantage.

### Womens One Day Internationals

9 matches; 6 verified. Stored: 4/6; current replay: 4/6.

- **28 Aug 2026, 15:30 · Scotland W v Netherlands W** (ID 35989920). Actual match winner: **Netherlands W**. Stored match prediction: **Scotland W** (Wrong); current server: **Scotland W** (Wrong); page match-start: **Scotland W**. Source: Match record. Current rule: Womens Dual Flow Advantage.
- **31 Aug 2026, 15:30 · Scotland W v Netherlands W** (ID 35994097). Actual match winner: **Scotland W**. Stored match prediction: **Netherlands W** (Wrong); current server: **Netherlands W** (Wrong); page match-start: **Netherlands W**. Source: Match record. Current rule: Womens Dual Flow Advantage.
- **01 Sept 2026, 15:30 · Scotland W v Netherlands W** (ID 36006030). Actual match winner: **No Result**. Stored match prediction: **Scotland W** (Unscored); current server: **Scotland W** (Unscored); page match-start: **Scotland W**. Source: Match record. Current rule: Womens Dual Flow Advantage.
- **01 Sept 2026, 17:30 · England W v Ireland W** (ID 35994441). Actual match winner: **England W**. Stored match prediction: **England W** (Correct); current server: **England W** (Correct); page match-start: **England W**. Source: Match record. Toss prediction (separate): England W; toss winner: England W. Current rule: Womens Dual Flow Advantage.
- **03 Sept 2026, 17:30 · England W v Ireland W** (ID 36021300). Actual match winner: **England W**. Stored match prediction: **England W** (Correct); current server: **England W** (Correct); page match-start: **England W**. Source: Match record. Toss prediction (separate): England W; toss winner: England W. Current rule: Womens Dual Flow Advantage.
- **06 Sept 2026, 15:00 · England W v Ireland W** (ID 36027911). Actual match winner: **England W**. Stored match prediction: **England W** (Correct); current server: **England W** (Correct); page match-start: **England W**. Source: Match record. Toss prediction (separate): Ireland W; toss winner: Ireland W. Current rule: Womens Dual Flow Advantage.
- **24 Sept 2026, 13:00 · Zimbabwe W v West Indies W** (ID 36103490). Actual match winner: **West Indies W**. Stored match prediction: **West Indies W** (Correct); current server: **West Indies W** (Correct); page match-start: **West Indies W**. Source: Match record. Toss prediction (separate): West Indies W; toss winner: West Indies W. Current rule: Womens Dual Flow Advantage.
- **27 Sept 2026, 13:00 · Zimbabwe W v West Indies W** (ID 36110371). Actual match winner: **Zimbabwe W**. Stored match prediction: **Unavailable** (No prediction); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Toss record only. Toss prediction (separate): West Indies W; toss winner: West Indies W. 
- **30 Sept 2026, 13:00 · Zimbabwe W v West Indies W** (ID 36123677). Actual match winner: **West Indies W**. Stored match prediction: **Unavailable** (No prediction); current server: **Unavailable** (No prediction); page match-start: **Unavailable**. Source: Toss record only. Toss prediction (separate): Zimbabwe W; toss winner: Zimbabwe W. 

## Test fixture (excluded)


## Saved toss predictions (separate outcome)

### Asian Games T20

- 25 Sept 2026, 10:30 · **Afghanistan v Nepal** (ID 36108897): predicted toss **Afghanistan**; actual toss **Afghanistan**; Correct.
- 01 Oct 2026, 05:30 · **Bangladesh v Pakistan** (ID 36131166): predicted toss **Bangladesh**; actual toss **Pakistan**; Wrong.
- 01 Oct 2026, 10:00 · **India v Sri Lanka** (ID 36131489): predicted toss **Unavailable**; actual toss **Sri Lanka**; No prediction.

### Caribbean Premier League

- 14 Aug 2026, 05:30 · **Jamaica Kingsmen v Guyana Amazon Warriors** (ID 35901908): predicted toss **Guyana Amazon Warriors**; actual toss **Guyana Amazon Warriors**; Correct.
- 15 Aug 2026, 04:30 · **St. Lucia Kings v Antigua & Barbuda Falcons** (ID 35931569): predicted toss **St. Lucia Kings**; actual toss **St. Lucia Kings**; Correct.
- 16 Aug 2026, 05:30 · **Jamaica Kingsmen v Trinbago Knight Riders** (ID 35933934): predicted toss **Jamaica Kingsmen**; actual toss **Jamaica Kingsmen**; Correct.
- 17 Aug 2026, 04:30 · **St. Lucia Kings v Barbados Tridents** (ID 35938017): predicted toss **St. Lucia Kings**; actual toss **St. Lucia Kings**; Correct.
- 19 Aug 2026, 05:30 · **Jamaica Kingsmen v St. Kitts and Nevis Patriots** (ID 35946930): predicted toss **St. Kitts and Nevis Patriots**; actual toss **St. Kitts and Nevis Patriots**; Correct.
- 20 Aug 2026, 04:30 · **St. Lucia Kings v Guyana Amazon Warriors** (ID 35946931): predicted toss **Guyana Amazon Warriors**; actual toss **Guyana Amazon Warriors**; Correct.
- 21 Aug 2026, 04:30 · **Antigua & Barbuda Falco v St. Kitts and Nevis Pat** (ID 35954424): predicted toss **Antigua & Barbuda Falco**; actual toss **Antigua & Barbuda Falco**; Correct.
- 22 Aug 2026, 04:30 · **St. Lucia Kings v Jamaica Kingsmen** (ID 35962894): predicted toss **St. Lucia Kings**; actual toss **St. Lucia Kings**; Correct.
- 26 Aug 2026, 04:30 · **Antigua & Barbuda Falc v Barbados Tridents** (ID 35972909): predicted toss **Barbados Tridents**; actual toss **Barbados Tridents**; Correct.
- 27 Aug 2026, 04:30 · **Trinbago Knight Riders v St. Lucia Kings** (ID 35972917): predicted toss **Trinbago Knight Riders**; actual toss **Trinbago Knight Riders**; Correct.
- 28 Aug 2026, 04:30 · **St. Kitts and Nevis Patriots v Jamaica Kingsmen** (ID 35970079): predicted toss **St. Kitts and Nevis Patriots**; actual toss **St. Kitts and Nevis Patriots**; Correct.
- 29 Aug 2026, 05:30 · **Trinbago Knight Riders v Barbados Tridents** (ID 35986052): predicted toss **Trinbago Knight Riders**; actual toss **Trinbago Knight Riders**; Correct.
- 31 Aug 2026, 04:30 · **St Kitts & Nevis Pats v Antigua & Barbuda Falcs** (ID 35989000): predicted toss **Antigua & Barbuda Falcs**; actual toss **Antigua & Barbuda Falcs**; Correct.
- 01 Sept 2026, 02:30 · **Trinbago Knight Riders v Guyana Amazon Warriors** (ID 36004104): predicted toss **Trinbago Knight Riders**; actual toss **Trinbago Knight Riders**; Correct.
- 02 Sept 2026, 04:30 · **St Kitts & Nevis Pats v Barbados Tridents** (ID 36004314): predicted toss **St Kitts & Nevis Pats**; actual toss **St Kitts & Nevis Pats**; Correct.
- 03 Sept 2026, 04:30 · **Trinbago Knight Riders v Antigua & Barbuda Falcs** (ID 36018454): predicted toss **Trinbago Knight Riders**; actual toss **Trinbago Knight Riders**; Correct.
- 04 Sept 2026, 04:30 · **St Kitts & Nevis Pats v St. Lucia Kings** (ID 36019390): predicted toss **St. Lucia Kings**; actual toss **St. Lucia Kings**; Correct.
- 05 Sept 2026, 04:30 · **Guyana Amazon Warriors v Jamaica Kingsmen** (ID 36019388): predicted toss **Guyana Amazon Warriors**; actual toss **Guyana Amazon Warriors**; Correct.
- 06 Sept 2026, 05:30 · **Barbados Tridents v Trinbago Knight Riders** (ID 36023549): predicted toss **Barbados Tridents**; actual toss **Barbados Tridents**; Correct.
- 07 Sept 2026, 00:30 · **Guyana Amazon Warriors v St Kitts & Nevis Pats** (ID 36029412): predicted toss **St Kitts & Nevis Pats**; actual toss **St Kitts & Nevis Pats**; Correct.
- 07 Sept 2026, 04:30 · **Barbados Tridents v St. Lucia Kings** (ID 36034130): predicted toss **Barbados Tridents**; actual toss **Barbados Tridents**; Correct.
- 10 Sept 2026, 04:30 · **Guyana Amazon Warriors v St. Lucia Kings** (ID 36045828): predicted toss **St. Lucia Kings**; actual toss **St. Lucia Kings**; Correct.
- 12 Sept 2026, 04:30 · **Guyana Amazon Warriors v Trinbago Knight Riders** (ID 36054787): predicted toss **Guyana Amazon Warriors**; actual toss **Guyana Amazon Warriors**; Correct.
- 19 Sept 2026, 04:30 · **Guyana Amazon Warriors v Jamaica Kingsmen** (ID 36085029): predicted toss **Guyana Amazon Warriors**; actual toss **Jamaica Kingsmen**; Wrong.
- 21 Sept 2026, 04:30 · **Antigua & Barbuda Falcs v Jamaica Kingsmen** (ID 36090636): predicted toss **Antigua & Barbuda Falcs**; actual toss **Antigua & Barbuda Falcs**; Correct.

### European T20 Premier League

- 27 Aug 2026, 15:00 · **Belfast Wolves v Dublin Guardians** (ID 35977014): predicted toss **Belfast Wolves**; actual toss **Dublin Guardians**; Wrong.
- 27 Aug 2026, 18:45 · **Edinburgh Castle Rockers v Glasgow Cosmic** (ID 35979895): predicted toss **Edinburgh Castle Rockers**; actual toss **Edinburgh Castle Rockers**; Correct.
- 28 Aug 2026, 18:45 · **Amsterdam Flames v Edinburgh Castle Rockers** (ID 35988957): predicted toss **Edinburgh Castle Rockers**; actual toss **Edinburgh Castle Rockers**; Correct.
- 29 Aug 2026, 15:00 · **Glasgow Cosmic v Dublin Guardians** (ID 35989974): predicted toss **Glasgow Cosmic**; actual toss **Dublin Guardians**; Wrong.
- 29 Aug 2026, 18:45 · **Rotterdam Dockers v Belfast Wolves** (ID 35989760): predicted toss **Belfast Wolves**; actual toss **Belfast Wolves**; Correct.
- 30 Aug 2026, 15:00 · **Amsterdam Flames v Belfast Wolves** (ID 35998885): predicted toss **Belfast Wolves**; actual toss **Belfast Wolves**; Correct.
- 30 Aug 2026, 18:45 · **Edinburgh Castle Rockers v Dublin Guardians** (ID 35997455): predicted toss **Edinburgh Castle Rockers**; actual toss **Dublin Guardians**; Wrong.
- 01 Sept 2026, 18:45 · **Glasgow Cosmic v Rotterdam Dockers** (ID 35998693): predicted toss **Rotterdam Dockers**; actual toss **Rotterdam Dockers**; Correct.
- 02 Sept 2026, 15:00 · **Dublin Guardians v Rotterdam Dockers** (ID 36020340): predicted toss **Rotterdam Dockers**; actual toss **Rotterdam Dockers**; Correct.
- 02 Sept 2026, 18:45 · **Belfast Wolves v Edinburgh Castle Rockers** (ID 36016128): predicted toss **Edinburgh Castle Rockers**; actual toss **Belfast Wolves**; Wrong.
- 03 Sept 2026, 18:45 · **Amsterdam Flames v Glasgow Cosmic** (ID 36020432): predicted toss **Amsterdam Flames**; actual toss **Glasgow Cosmic**; Wrong.
- 04 Sept 2026, 18:45 · **Glasgow Cosmic v Belfast Wolves** (ID 36027092): predicted toss **Belfast Wolves**; actual toss **Glasgow Cosmic**; Wrong.
- 05 Sept 2026, 15:00 · **Rotterdam Dockers v Edinburgh Castle Rockers** (ID 36023515): predicted toss **Edinburgh Castle Rockers**; actual toss **Rotterdam Dockers**; Wrong.
- 05 Sept 2026, 18:45 · **Dublin Guardians v Amsterdam Flames** (ID 36027440): predicted toss **Amsterdam Flames**; actual toss **Dublin Guardians**; Wrong.
- 06 Sept 2026, 15:00 · **Glasgow Cosmic v Edinburgh Castle Rockers** (ID 36034286): predicted toss **Edinburgh Castle Rockers**; actual toss **Edinburgh Castle Rockers**; Correct.
- 06 Sept 2026, 18:45 · **Amsterdam Flames v Rotterdam Dockers** (ID 36034385): predicted toss **Amsterdam Flames**; actual toss **Amsterdam Flames**; Correct.
- 10 Sept 2026, 15:00 · **Rotterdam Dockers v Glasgow Cosmic** (ID 36040032): predicted toss **Glasgow Cosmic**; actual toss **Glasgow Cosmic**; Correct.
- 10 Sept 2026, 18:45 · **Belfast Wolves v Amsterdam Flames** (ID 36045869): predicted toss **Belfast Wolves**; actual toss **Belfast Wolves**; Correct.
- 11 Sept 2026, 18:45 · **Dublin Guardians v Edinburgh Castle Rockers** (ID 36045879): predicted toss **Dublin Guardians**; actual toss **Dublin Guardians**; Correct.
- 12 Sept 2026, 15:00 · **Belfast Wolves v Rotterdam Dockers** (ID 36055698): predicted toss **Rotterdam Dockers**; actual toss **Rotterdam Dockers**; Correct.
- 12 Sept 2026, 18:45 · **Dublin Guardians v Glasgow Cosmic** (ID 36057946): predicted toss **Glasgow Cosmic**; actual toss **Dublin Guardians**; Wrong.
- 19 Sept 2026, 18:45 · **Amsterdam Flames v Belfast Wolves** (ID 36084485): predicted toss **Belfast Wolves**; actual toss **Belfast Wolves**; Correct.
- 20 Sept 2026, 18:45 · **Edinburgh Castle Rockers v Belfast Wolves** (ID 36092701): predicted toss **Belfast Wolves**; actual toss **Edinburgh Castle Rockers**; Wrong.

### International Twenty20 Matches

- 28 Aug 2026, 17:30 · **Namibia v South Africa** (ID 35977921): predicted toss **South Africa**; actual toss **South Africa**; Correct.
- 29 Aug 2026, 17:30 · **South Africa v Zimbabwe** (ID 35993805): predicted toss **Zimbabwe**; actual toss **Zimbabwe**; Correct.
- 31 Aug 2026, 17:30 · **Namibia v Zimbabwe** (ID 35998050): predicted toss **Namibia**; actual toss **Namibia**; Correct.
- 01 Sept 2026, 17:30 · **Zimbabwe v South Africa** (ID 36013997): predicted toss **South Africa**; actual toss **South Africa**; Correct.
- 03 Sept 2026, 17:30 · **Namibia v Zimbabwe** (ID 36020245): predicted toss **Zimbabwe**; actual toss **Zimbabwe**; Correct.
- 04 Sept 2026, 17:30 · **Namibia v South Africa** (ID 36026448): predicted toss **Namibia**; actual toss **Namibia**; Correct.
- 06 Sept 2026, 17:30 · **South Africa v Zimbabwe** (ID 36032174): predicted toss **South Africa**; actual toss **South Africa**; Correct.
- 19 Sept 2026, 19:00 · **England v Sri Lanka** (ID 36082542): predicted toss **England**; actual toss **England**; Correct.

### Metro Bank One Day Cup

- 20 Sept 2026, 15:30 · **Leicestershire v Middlesex** (ID 36075087): predicted toss **Middlesex**; actual toss **Leicestershire**; Wrong.

### One Day Internationals

- 15 Aug 2026, 15:15 · **Ireland v Afghanistan** (ID 35931559): predicted toss **Afghanistan**; actual toss **Afghanistan**; Correct.
- 11 Sept 2026, 13:00 · **Namibia v South Africa** (ID 36051688): predicted toss **Namibia**; actual toss **Namibia**; Correct.
- 20 Sept 2026, 13:00 · **Zimbabwe v Australia** (ID 36085898): predicted toss **Australia**; actual toss **Zimbabwe**; Wrong.
- 24 Sept 2026, 13:30 · **South Africa v Australia** (ID 36083840): predicted toss **South Africa**; actual toss **Australia**; Wrong.
- 24 Sept 2026, 17:00 · **England v Sri Lanka** (ID 36103843): predicted toss **Sri Lanka**; actual toss **Sri Lanka**; Correct.
- 27 Sept 2026, 13:30 · **South Africa v Australia** (ID 36111199): predicted toss **South Africa**; actual toss **Australia**; Wrong.
- 27 Sept 2026, 14:00 · **India v West Indies** (ID 36100425): predicted toss **West Indies**; actual toss **India**; Wrong.
- 27 Sept 2026, 15:00 · **England v Sri Lanka** (ID 36111684): predicted toss **England**; actual toss **England**; Correct.
- 30 Sept 2026, 14:00 · **India v West Indies** (ID 36125669): predicted toss **West Indies**; actual toss **India**; Wrong.
- 30 Sept 2026, 17:00 · **South Africa v Australia** (ID 36124730): predicted toss **South Africa**; actual toss **South Africa**; Correct.

### South Africa T20 Challenge

- 01 Oct 2026, 16:30 · **Garden Route Badgers v Eastern Cape Linyathi** (ID 36127430): predicted toss **Garden Route Badgers**; actual toss **Garden Route Badgers**; Correct.

### Tamil Nadu Premier League

- 19 Aug 2026, 19:30 · **Dindigul Dragons v Ruby Trichy Warriors** (ID 35948552): predicted toss **Dindigul Dragons**; actual toss **Dindigul Dragons**; Correct.
- 20 Aug 2026, 15:30 · **Madurai Panthers v Tiruppur Tamizhans** (ID 35955958): predicted toss **Tiruppur Tamizhans**; actual toss **Tiruppur Tamizhans**; Correct.
- 20 Aug 2026, 19:30 · **Nellai Royal Kings v Salem Spartans** (ID 35950773): predicted toss **Salem Spartans**; actual toss **Salem Spartans**; Correct.
- 21 Aug 2026, 15:30 · **Lyca Kovai Kings v Dindigul Dragons** (ID 35958414): predicted toss **Dindigul Dragons**; actual toss **Dindigul Dragons**; Correct.
- 21 Aug 2026, 19:30 · **Ruby Trichy Warriors v Chepauk Super Gillies** (ID 35958346): predicted toss **Ruby Trichy Warriors**; actual toss **Ruby Trichy Warriors**; Correct.
- 22 Aug 2026, 15:30 · **Tiruppur Tamizhans v Salem Spartans** (ID 35962365): predicted toss **Salem Spartans**; actual toss **Salem Spartans**; Correct.
- 22 Aug 2026, 19:30 · **Nellai Royal Kings v Madurai Panthers** (ID 35962407): predicted toss **Madurai Panthers**; actual toss **Madurai Panthers**; Correct.
- 24 Aug 2026, 19:30 · **Lyca Kovai Kings v Tiruppur Tamizhans** (ID 35973277): predicted toss **Lyca Kovai Kings**; actual toss **Lyca Kovai Kings**; Correct.

### Test Matches

- 15 Aug 2026, 10:00 · **Sri Lanka v India** (ID 35913614): predicted toss **India**; actual toss **India**; Correct.
- 19 Aug 2026, 15:30 · **England v Pakistan** (ID 35913612): predicted toss **England**; actual toss **England**; Correct.
- 22 Aug 2026, 05:30 · **Australia v Bangladesh** (ID 35947011): predicted toss **Australia**; actual toss **Australia**; Correct.
- 27 Aug 2026, 15:30 · **England v Pakistan** (ID 35966902): predicted toss **Pakistan**; actual toss **Pakistan**; Correct.

### The Hundred

- 14 Aug 2026, 22:30 · **Manchester Super Giants v Sunrisers Leeds** (ID 35933619): predicted toss **Sunrisers Leeds**; actual toss **Sunrisers Leeds**; Correct.
- 16 Aug 2026, 22:30 · **Trent Rockets v Manchester Super Giants** (ID 35941131): predicted toss **Manchester Super Giants**; actual toss **Manchester Super Giants**; Correct.

### The Hundred - Womens

- 14 Aug 2026, 18:45 · **Sunrisers Leeds W v Southern Brave W** (ID 35929461): predicted toss **Sunrisers Leeds W**; actual toss **Sunrisers Leeds W**; Correct.
- 16 Aug 2026, 18:45 · **Trent Rockets W v Sunrisers Leeds W** (ID 35940115): predicted toss **Trent Rockets W**; actual toss **Trent Rockets W**; Correct.

### Women's Asia Cup T20

- 04 Sept 2026, 20:00 · **United Arab Emirates W v Indonesia W** (ID 36023009): predicted toss **United Arab Emirates W**; actual toss **United Arab Emirates W**; Correct.
- 05 Sept 2026, 20:00 · **India W v Pakistan W** (ID 36027587): predicted toss **India W**; actual toss **Pakistan W**; Wrong.
- 06 Sept 2026, 20:00 · **Bangladesh W v Sri Lanka W** (ID 36023089): predicted toss **Sri Lanka W**; actual toss **Sri Lanka W**; Correct.
- 07 Sept 2026, 20:00 · **Hong Kong W v Pakistan W** (ID 36034463): predicted toss **Pakistan W**; actual toss **Pakistan W**; Correct.
- 08 Sept 2026, 20:00 · **United Arab Emirates W v Bangladesh W** (ID 36039351): predicted toss **United Arab Emirates W**; actual toss **United Arab Emirates W**; Correct.
- 10 Sept 2026, 20:00 · **India W v Bangladesh W** (ID 36049475): predicted toss **Bangladesh W**; actual toss **Bangladesh W**; Correct.
- 11 Sept 2026, 20:00 · **Sri Lanka W v Pakistan W** (ID 36049024): predicted toss **Sri Lanka W**; actual toss **Sri Lanka W**; Correct.

### Women's Caribbean Premier League

- 06 Sept 2026, 00:30 · **Barbados Tridents W v Trinbago Knight Riders W** (ID 36023098): predicted toss **Trinbago Knight Riders W**; actual toss **Barbados Tridents W**; Wrong.
- 06 Sept 2026, 19:30 · **Guyana Amazon Warriors W v Jamaica Empress W** (ID 36023506): predicted toss **Jamaica Empress W**; actual toss **Jamaica Empress W**; Correct.
- 10 Sept 2026, 19:30 · **Jamaica Empress W v Trinbago Knight Riders W** (ID 36040305): predicted toss **Trinbago Knight Riders W**; actual toss **Trinbago Knight Riders W**; Correct.
- 12 Sept 2026, 19:30 · **Guyana Amazon War W v Trinbago Knight Rid W** (ID 36054985): predicted toss **Guyana Amazon Warriors W**; actual toss **Trinbago Knight Riders W**; Wrong.
- 13 Sept 2026, 00:30 · **Barbados Tridents W v Jamaica Empress W** (ID 36055328): predicted toss **Barbados Tridents W**; actual toss **Barbados Tridents W**; Correct.

### Womens International Twenty20 Matches

- 28 Aug 2026, 20:00 · **Hong Kong W v Thailand W** (ID 35982250): predicted toss **Thailand W**; actual toss **Hong Kong W**; Wrong.
- 29 Aug 2026, 20:00 · **United Arab Emirates W v Sri Lanka W** (ID 35982257): predicted toss **Sri Lanka W**; actual toss **Sri Lanka W**; Correct.
- 30 Aug 2026, 20:00 · **India W v Thailand W** (ID 35982267): predicted toss **India W**; actual toss **Thailand W**; Wrong.
- 31 Aug 2026, 20:00 · **Bangladesh W v Indonesia W** (ID 35982279): predicted toss **Bangladesh W**; actual toss **Indonesia W**; Wrong.
- 01 Sept 2026, 20:00 · **Pakistan W v Thailand W** (ID 36007810): predicted toss **Pakistan W**; actual toss **Pakistan W**; Correct.
- 02 Sept 2026, 20:00 · **Indonesia W v Sri Lanka W** (ID 36018220): predicted toss **Sri Lanka W**; actual toss **Indonesia W**; Wrong.
- 03 Sept 2026, 20:00 · **Hong Kong W v India W** (ID 36021032): predicted toss **India W**; actual toss **Hong Kong W**; Wrong.
- 11 Sept 2026, 17:00 · **Zimbabwe W v South Africa W** (ID 36050870): predicted toss **Zimbabwe W**; actual toss **Zimbabwe W**; Correct.
- 19 Sept 2026, 17:00 · **Zimbabwe W v South Africa W** (ID 36082765): predicted toss **Zimbabwe W**; actual toss **South Africa W**; Wrong.

### Womens One Day Internationals

- 01 Sept 2026, 17:30 · **England W v Ireland W** (ID 35994441): predicted toss **England W**; actual toss **England W**; Correct.
- 03 Sept 2026, 17:30 · **England W v Ireland W** (ID 36021300): predicted toss **England W**; actual toss **England W**; Correct.
- 06 Sept 2026, 15:00 · **England W v Ireland W** (ID 36027911): predicted toss **Ireland W**; actual toss **Ireland W**; Correct.
- 24 Sept 2026, 13:00 · **Zimbabwe W v West Indies W** (ID 36103490): predicted toss **West Indies W**; actual toss **West Indies W**; Correct.
- 27 Sept 2026, 13:00 · **Zimbabwe W v West Indies W** (ID 36110371): predicted toss **West Indies W**; actual toss **West Indies W**; Correct.
- 30 Sept 2026, 13:00 · **Zimbabwe W v West Indies W** (ID 36123677): predicted toss **Zimbabwe W**; actual toss **Zimbabwe W**; Correct.

