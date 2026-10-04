# Admin Match Dataset

Updated on 3 October 2026. The user requested one Match Dataset tab after the
dedicated WNCL/D10 tabs were removed. The new superadmin tab combines the main
match dataset with proper D10 and WNCL match snapshots; toss-only samples remain
in their own dataset. Empty discovery fixtures are not added to the view.

Select a league to inspect date-wise matches in IST. The page shows the current
normal algorithm ID, version and parameters, current normal predicted winner,
original saved predicted winner, verified actual winner, and separate outcomes
for current replay and saved pick. League totals cover all pages. Search,
actual-result and current pass/fail filters apply before pagination. Profiles
with no valid records remain visible as waiting for proper match data.

View data expands the exact saved Back/Lay volume, P&L, activity, capture time,
saved algorithm/version when available, prediction reason, result evidence and
full saved snapshot JSON. Export all JSON includes all valid matches, across
the main and tracked league files. The page refreshes every 30 seconds.

Historical captures are not relabelled as pre-match forecasts. Current replay
uses only frozen pre-match fields and is displayed separately from the original
saved pick. The historical replay accuracy is not a future accuracy claim.
CREX auto labels without independent verification remain reported-only and
cannot produce pass/fail. Verified No Result is separate from decided outcomes.
Source conflicts remain pending. Shared market IDs across datasets are counted
once only when participants and dates agree, with all source snapshots retained
for inspection and a genuine pre-match forecast preferred.

The main store now rejects incomplete, failed, both-zero and misidentified
records at write time. It requires a league and match ID, preserves the original
snapshot/prediction when resolving a result, and refuses to overwrite corrupt
JSON. New captures save algorithm metadata. D10/WNCL snapshot-only capture and
storage gates continue to apply. Existing valid historical records are unchanged.

At verification, 246 proper match records are shown across 37 algorithm profiles:
243 main records, three D10 snapshots, and zero WNCL match snapshots. The current
normal replay is 193 correct / 32 wrong, with 18 No Results and three pending
tracked results. Original historical saved picks are 174 correct / 51 wrong.
These are different comparisons; the interface labels both explicitly.

42 focused tests pass, including storage quality, source verification, current
versus saved comparisons, combined filtering, pagination, immutable inputs,
deduplication, conflicting outcomes, and existing D10/WNCL routing/capture.
Frontend production build and lint pass with existing warnings. Syntax and diff
checks pass. The local backend was gracefully restarted, health is OK, and the
dataset endpoint returns HTTP 401 without authentication. The tab and endpoints
use the existing superadmin access policy. No public deployment was performed.
