# Free Trial Settings — Design Spec

**Date:** 2026-08-17  
**Status:** Approved — implementation plan ready  
**Goal:** Let Superadmin control free-trial duration (flexible units) and enable/disable granting of new trials from Admin → Settings, without revoking trials already in progress.

---

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Duration unit | Flexible: number + unit (`minutes` / `hours` / `days`) |
| Disable scope | Stop **new** trial grants only; active trials keep running until natural expiry |
| Manual / bulk grant when disabled | Also blocked (no new trials of any kind) |
| UI | Dedicated Free Trial card on Admin → Settings (Approach B) |
| Storage | Existing `SiteSettings` JSON keys |
| Who can edit | Superadmin only (same as other settings PATCH) |

---

## Problem

Trial length is hardcoded (`TRIAL_MINUTES = 30`) in `server/lib/subscriptionAccess.js`. There is no way to turn off auto-trial for new users without a deploy. Superadmin needs runtime control: how long new trials last, and whether new trials are granted at all.

---

## Architecture overview

```
Superadmin Settings UI (Free Trial card)
        │
        ▼
 PATCH /admin/settings/:key  (existing)
        │
        ▼
 SiteSettings
   trialEnabled
   trialDurationValue
   trialDurationUnit
        │
        ▼
 subscriptionAccess.readTrialConfig(prisma)
        │
        ├─ grantTrial / grantTrialToNewUser
        ├─ grantTrialIfEligible (admin single + bulk)
        └─ signup / login / OAuth grant paths
```

---

## Settings keys

Seed via `server/seedAdmin.js` `DEFAULT_SETTINGS` (upsert on seed). Category: `trial`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `trialEnabled` | boolean | `true` | When false, no new trials are granted |
| `trialDurationValue` | number | `30` | Positive integer duration magnitude |
| `trialDurationUnit` | string | `"minutes"` | One of: `minutes`, `hours`, `days` |

`isPublic`: `false` for all three (not exposed on public config APIs).

### Validation (on PATCH)

- `trialEnabled`: must be boolean
- `trialDurationValue`: integer ≥ 1; soft max (e.g. 365 days equivalent) to prevent abuse — reject absurd values with 400
- `trialDurationUnit`: enum `minutes` | `hours` | `days`

Invalid updates return 400 and do not write.

---

## Server behavior

### Config reader

Add `getTrialConfig(prisma)` in `subscriptionAccess.js` (or small helper used by it):

- Load the three keys from `SiteSettings`
- Fall back to defaults if a key is missing (safe for envs not yet re-seeded)
- Compute `trialMinutes` and human `trialLabel` (e.g. `30-minute`, `2-hour`, `1-day`)

### Grant paths (all must respect config)

When `trialEnabled === false`:

| Path | Behavior |
|------|----------|
| Signup (`auth` + passport OAuth new user) | Create user on **free** plan; do **not** call `grantTrialToNewUser` |
| Login `syncUserTrialState` | Do not auto-grant; expire existing trials as today |
| `POST /admin/users/:id/grant-trial` | `{ granted: false, reason: 'trial_disabled' }` → 400/403 with clear message |
| `POST /admin/grant-trial-all` | Grant 0; message that trials are disabled |

When `trialEnabled === true`:

- All grant paths use **current** `trialDurationValue` + `trialDurationUnit` for `subExpiresAt`
- Changing duration does **not** rewrite expiry on already-active trials

### Labels / messages

Auth success messages and admin grant messages use dynamic `trialLabel` from config (replace hardcoded `TRIAL_LABEL` / `TRIAL_MINUTES` constants for runtime paths). Keep exported fallbacks for tests if needed.

### Existing active trials

- Disable does **not** call revoke
- Expiry worker / `expireTrialIfNeeded` unchanged
- Existing `revoke_all_trials.js` script remains a separate ops tool (out of scope for this UI)

---

## Frontend

### Admin → Settings

Above or beside the generic key/value settings list, Superadmin sees a **Free Trial** card:

1. Toggle: **Enable free trial for new grants** (bound to `trialEnabled`)
2. Duration: number input + unit select (`minutes` / `hours` / `days`)
3. Helper text: “Applies only to newly granted trials. Active trials keep their current end time. When disabled, signup, login auto-grant, and admin Grant trial are all blocked.”
4. **Save** — writes the three keys via existing `adminUpdateSetting` (or one batched save if we add a tiny helper; either is fine)
5. Non-superadmin: read-only / no edit (same as today)

### Copy elsewhere

- Login/signup toast strings that hardcode “30-minute” should come from server response `message` (already mostly dynamic via `TRIAL_LABEL`) — ensure server message uses config label.
- Admin Users “Grant trial” failure should surface `trial_disabled` clearly.

---

## Out of scope

- Revoking or shortening in-flight trials from this card
- Per-user custom trial lengths
- Public marketing pages advertising trial length (unless already driven by API)
- Changing Pro pricing / plans

---

## Test plan

1. Seed / upsert settings → defaults: enabled, 30 minutes
2. Grant trial with unit hours → expiry ≈ now + N hours
3. Disable → signup user stays free; no trial subscription row
4. Disable → login eligible free user does not get trial
5. Disable → admin grant-trial and grant-trial-all fail with `trial_disabled`
6. Re-enable → new signup gets trial with current duration
7. Change duration while user has active trial → that user’s `subExpiresAt` unchanged
8. Superadmin Settings card Save persists and reloads correctly
9. Invalid unit / value ≤ 0 rejected

---

## Implementation notes

- Prefer reading config inside `grantTrial` / `grantTrialIfEligible` / `grantTrialToNewUser` so every caller is covered once.
- Cache is optional; settings change rarely — DB read per grant is acceptable.
- Audit: existing `settings_update` audit on PATCH covers changes.
