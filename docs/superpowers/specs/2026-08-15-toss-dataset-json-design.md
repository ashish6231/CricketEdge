# Toss Dataset (JSON) — Design Spec

**Date:** 2026-08-15  
**Status:** Approved for implementation planning  
**Goal:** Capture ended toss markets into a durable JSON dataset, let Superadmin confirm the real toss winner, and keep verified records for building a better toss-winner algorithm later.

---

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| When to capture | Only when toss market `status === 'ended'` |
| Storage | JSON file only (no Postgres `TossDatasetRecord` table) |
| Capture trigger | Background worker (~60s) **and** Superadmin “Capture now” |
| Ground truth | Superadmin selects real winner; never treat inferred odds winner as truth |
| Predictor changes | Out of scope for this feature |

---

## Problem

We need labeled toss outcomes with full market snapshots so we can iterate on toss-winner logic. Upstream does not expose a reliable confirmed toss winner API we trust; Superadmin must label winners. Data must persist across restarts and be easy to export/analyze.

---

## Architecture overview

```
Toss list API (ended)
        │
        ▼
 tossCapture (+ worker / Capture now)
        │
        ▼
 tossDatasetStore  ──atomic──►  server/data/toss_dataset.json
        │
        ▼
 Superadmin APIs + AdminTossDataset UI
        │
        ▼
 Confirm actualWinner → status=verified
```

**Source of truth:** `server/data/toss_dataset.json`  
**Access path:** server services only (UI never writes the file directly).

---

## JSON file shape

Path: `server/data/toss_dataset.json`

```json
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "records": [
    {
      "matchId": "string",
      "marketId": "string|null",
      "matchName": "string",
      "competitionName": "string|null",
      "team1": "string",
      "team2": "string",
      "startTime": "ISO-8601|null",
      "endedAt": "ISO-8601|null",
      "capturedAt": "ISO-8601",
      "snapshot": {},
      "predictedWinner": "string|null",
      "predictionReason": "string|null",
      "predictionRisk": {},
      "matchedRules": [],
      "predictorVersion": "string|null",
      "actualWinner": "string|null",
      "status": "pending|verified",
      "confirmedAt": "ISO-8601|null",
      "confirmedByEmail": "string|null",
      "confirmedById": "number|null",
      "lastCaptureError": "string|null"
    }
  ]
}
```

### Rules

- `matchId` is unique within `records`.
- New captures start as `status: "pending"` with `actualWinner: null`.
- Verified records are never overwritten by capture (snapshot, prediction, and winner stay frozen).
- Confirming sets `actualWinner` to exactly `team1` or `team2`, `status: "verified"`, and confirmation metadata.
- Failed snapshot fetches may be omitted or stored with empty snapshot + `lastCaptureError`; successful re-capture may fill them **only if** still pending and snapshot is empty/missing.

---

## Components

### 1. `server/services/tossDatasetStore.js`

Responsibilities:

- Load / save dataset with an in-process mutex.
- Atomic write: write `toss_dataset.json.<tmp>` then `fs.rename` into place.
- `listRecords({ status, search, page, limit })`
- `upsertPendingCapture(record)` — insert if new; refuse overwrite of verified; allow fill-in of failed pending captures
- `confirmActualWinner({ matchId, actualWinner, admin })`
- `buildExport()` — return full file payload for download

### 2. `server/services/tossCapture.js`

Responsibilities:

- `getAllTossMatches()` → filter `status === 'ended'` and `(totalMatched || 0) > 0`
- Skip matchIds already present as verified or already successfully captured pending
- `getTossSnapshot(matchId)` → extract team names, store full snapshot
- Run current `predictTossWinner` (via existing shared path used by backtest) and store prediction fields
- Return summary: `{ scanned, captured, skipped, failed }`

### 3. `server/services/tossCaptureWorker.js`

Responsibilities:

- Start interval from `TOSS_CAPTURE_INTERVAL_MS` (default `60000`)
- Overlap guard (skip tick if previous run still active)
- `runTossCaptureNow()` for manual trigger
- Stop cleanly on SIGTERM/SIGINT (wired from `server/index.js`)

### 4. Admin APIs (`server/routes/admin.js`, `requireSuperAdmin`)

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/admin/toss-dataset` | Query: `status=pending\|verified\|all`, optional `search`, `page`, `limit` |
| PATCH | `/admin/toss-dataset/:matchId/actual-winner` | Body: `{ actualWinner }` — must equal team1 or team2 |
| POST | `/admin/toss-dataset/capture` | Run capture once, return summary |
| GET | `/admin/toss-dataset/export` | Download `toss_dataset.json` attachment |

On confirm: write an `AdminAuditLog` entry (action like `toss_dataset_confirm_winner`).

### 5. Frontend

- `frontend/src/api.js` — admin helpers for list / confirm / capture / export
- `frontend/src/utils/tossDatasetAdmin.js` — query string + small UI helpers
- `frontend/src/pages/admin/AdminTossDataset.jsx` — Superadmin UI
- `AdminPage.jsx` — add `toss_dataset` tab with `superadminOnly: true`

**UI behavior:**

- Pending tab: show match names (+ teams); Superadmin selects real winner (team1 or team2 button)
- Verified tab: show confirmed winner
- Actions: Capture now, Export JSON
- Search by match name
- Show capture summary toast/message after Capture now

---

## Capture eligibility

A toss match is eligible when **all** are true:

1. List item `status === 'ended'`
2. `(totalMatched || 0) > 0`
3. No existing **verified** record for `matchId`
4. No existing **pending** record with a successful snapshot (unless prior attempt failed and snapshot is empty)

Live and upcoming toss markets are **not** saved.

---

## Error handling

| Case | Behavior |
|------|----------|
| Upstream toss list/snapshot fails | Capture run reports failure count; worker continues next tick |
| Invalid `actualWinner` | 400 with clear message |
| Unknown `matchId` | 404 |
| Confirm already verified | 409 or idempotent success if same winner; reject if different winner |
| Concurrent write | Mutex serializes store operations |
| Corrupt/missing JSON file | Initialize empty `{ version: 1, updatedAt, records: [] }` |

Do not expose upstream hostnames (e.g. `tennisliveload.com`) in admin-facing errors; keep generic messages.

---

## Testing

- Store: atomic write, unique matchId, verify-protect, confirm validation
- Capture: ended filter, skip existing, failed snapshot handling
- Worker: overlap guard, run-now
- Admin route handlers with fake req/res + fake store
- Frontend query helper unit tests

---

## Out of scope

- Changing production `tossPredictor.js` rules from this dataset
- Postgres persistence for toss dataset records
- Capturing live/upcoming toss snapshots
- Auto-labeling winners from settled odds
- Public (non-superadmin) access to the dataset

---

## Success criteria

1. Ended tosses appear in Pending after worker tick or Capture now
2. Superadmin can see pending match names and select the real winner
3. Confirmed records persist in `server/data/toss_dataset.json` across restarts
4. Export downloads the full JSON dataset
5. Verified records are stable (not overwritten by later captures)
```
