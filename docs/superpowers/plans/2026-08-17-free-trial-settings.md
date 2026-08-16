# Free Trial Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Superadmin can set flexible free-trial duration and enable/disable new trial grants from Admin → Settings, without revoking in-flight trials.

**Architecture:** Persist `trialEnabled`, `trialDurationValue`, and `trialDurationUnit` in existing `SiteSettings`. Centralize reads + expiry math in `subscriptionAccess.js` so signup, login, OAuth, and admin grant paths all honor one config. Add a dedicated Free Trial card on Admin Settings.

**Tech Stack:** Node.js, Express, Prisma `SiteSettings`, React Admin Settings UI, `node:test`

## Global Constraints

- Do **not** create git commits unless the user explicitly asks
- Disable = block **all new** grants (signup, login auto-grant, admin single, admin bulk); active trials keep running
- Duration changes apply only to **newly** granted trials
- Defaults: enabled=`true`, value=`30`, unit=`minutes`
- Units enum: `minutes` | `hours` | `days`
- Superadmin-only write (existing `PATCH /admin/settings/:key`)
- Soft max: duration must convert to ≤ `525600` minutes (365 days)

## File Structure

| File | Responsibility |
|------|----------------|
| `server/lib/trialConfig.js` | Pure helpers: defaults, parse SiteSettings rows, validate, minutes + label |
| `server/lib/subscriptionAccess.js` | `getTrialConfig`, gate grants, dynamic expiry |
| `server/seedAdmin.js` | Seed three trial settings |
| `server/routes/admin.js` | Validate trial keys on PATCH; `trial_disabled` message; dynamic grant label |
| `server/routes/auth.js` | Dynamic trial messages from config / grant result |
| `frontend/src/pages/admin/AdminSettings.jsx` | Free Trial card UI |
| `server/tests/trialConfig.test.js` | Unit tests for config helpers |
| `server/tests/subscriptionAccess.trial.test.js` | Grant gating + duration with fake prisma |

---

### Task 1: Trial config helpers (pure)

**Files:**
- Create: `server/lib/trialConfig.js`
- Test: `server/tests/trialConfig.test.js`

**Interfaces:**
- Produces:
  - `TRIAL_SETTING_KEYS = { enabled: 'trialEnabled', value: 'trialDurationValue', unit: 'trialDurationUnit' }`
  - `TRIAL_DEFAULTS = { enabled: true, value: 30, unit: 'minutes' }`
  - `TRIAL_UNITS = ['minutes', 'hours', 'days']`
  - `MAX_TRIAL_MINUTES = 525600`
  - `parseTrialConfig(rowsOrMap) → { enabled, value, unit, minutes, label }`
  - `validateTrialSetting(key, value) → { ok: true, value } | { ok: false, message }`
  - `getTrialExpiresAt(from, minutes) → Date`
  - `formatTrialLabel(value, unit) → string` (e.g. `30-minute`, `2-hour`, `1-day`)

- [ ] **Step 1: Write failing tests**

Create `server/tests/trialConfig.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTrialConfig,
  validateTrialSetting,
  formatTrialLabel,
  getTrialExpiresAt,
  TRIAL_DEFAULTS,
} = require('../lib/trialConfig');

test('parseTrialConfig falls back to defaults when rows missing', () => {
  const cfg = parseTrialConfig([]);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.value, 30);
  assert.equal(cfg.unit, 'minutes');
  assert.equal(cfg.minutes, 30);
  assert.equal(cfg.label, '30-minute');
});

test('parseTrialConfig reads SiteSettings-shaped rows', () => {
  const cfg = parseTrialConfig([
    { key: 'trialEnabled', value: false },
    { key: 'trialDurationValue', value: 2 },
    { key: 'trialDurationUnit', value: 'hours' },
  ]);
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.minutes, 120);
  assert.equal(cfg.label, '2-hour');
});

test('formatTrialLabel pluralizes when value !== 1', () => {
  assert.equal(formatTrialLabel(1, 'days'), '1-day');
  assert.equal(formatTrialLabel(3, 'days'), '3-day'); // keep short label style: N-day / N-hour / N-minute
});

test('validateTrialSetting rejects bad unit and non-positive value', () => {
  assert.equal(validateTrialSetting('trialDurationUnit', 'weeks').ok, false);
  assert.equal(validateTrialSetting('trialDurationValue', 0).ok, false);
  assert.equal(validateTrialSetting('trialDurationValue', 1).ok, true);
  assert.equal(validateTrialSetting('trialEnabled', true).ok, true);
  assert.equal(validateTrialSetting('trialEnabled', 'yes').ok, false);
});

test('validateTrialSetting rejects duration over 365 days', () => {
  assert.equal(validateTrialSetting('trialDurationValue', 366).ok, false); // when unit checked in pair — see note below
});

test('getTrialExpiresAt adds minutes', () => {
  const from = new Date('2026-08-17T00:00:00.000Z');
  const exp = getTrialExpiresAt(from, 90);
  assert.equal(exp.toISOString(), '2026-08-17T01:30:00.000Z');
});
```

Note for the soft-max test: either validate value+unit together via `validateTrialDuration(value, unit)` or only check minutes inside `validateTrialSetting` when both are known. Prefer exporting:

```js
function validateTrialDuration(value, unit) { ... }
```

and test that `validateTrialDuration(366, 'days').ok === false` while `validateTrialDuration(24, 'hours').ok === true`.

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

Run: `cd server && node --test tests/trialConfig.test.js`  
Expected: `Cannot find module '../lib/trialConfig'`

- [ ] **Step 3: Implement `server/lib/trialConfig.js`**

```js
const TRIAL_SETTING_KEYS = {
  enabled: 'trialEnabled',
  value: 'trialDurationValue',
  unit: 'trialDurationUnit',
};
const TRIAL_DEFAULTS = { enabled: true, value: 30, unit: 'minutes' };
const TRIAL_UNITS = ['minutes', 'hours', 'days'];
const MAX_TRIAL_MINUTES = 525600; // 365 days

function singularUnit(unit) {
  if (unit === 'minutes') return 'minute';
  if (unit === 'hours') return 'hour';
  return 'day';
}

function formatTrialLabel(value, unit) {
  return `${value}-${singularUnit(unit)}`;
}

function toMinutes(value, unit) {
  const n = Number(value);
  if (unit === 'hours') return n * 60;
  if (unit === 'days') return n * 60 * 24;
  return n;
}

function parseTrialConfig(rows = []) {
  const map = {};
  for (const row of rows) {
    if (row && row.key != null) map[row.key] = row.value;
  }
  const enabled = map.trialEnabled == null ? TRIAL_DEFAULTS.enabled : Boolean(map.trialEnabled);
  const valueRaw = map.trialDurationValue == null ? TRIAL_DEFAULTS.value : Number(map.trialDurationValue);
  const value = Number.isFinite(valueRaw) && valueRaw >= 1 ? Math.floor(valueRaw) : TRIAL_DEFAULTS.value;
  const unit = TRIAL_UNITS.includes(map.trialDurationUnit) ? map.trialDurationUnit : TRIAL_DEFAULTS.unit;
  const minutes = toMinutes(value, unit);
  return { enabled, value, unit, minutes, label: formatTrialLabel(value, unit) };
}

function validateTrialDuration(value, unit) {
  if (!TRIAL_UNITS.includes(unit)) return { ok: false, message: 'Invalid trialDurationUnit' };
  const n = Number(value);
  if (!Number.isInteger(n) && !(Number.isFinite(n) && Math.floor(n) === n)) {
    // accept number that is whole
  }
  const whole = Math.floor(Number(value));
  if (!Number.isFinite(whole) || whole < 1 || whole !== Number(value)) {
    return { ok: false, message: 'trialDurationValue must be an integer >= 1' };
  }
  const minutes = toMinutes(whole, unit);
  if (minutes > MAX_TRIAL_MINUTES) {
    return { ok: false, message: 'Trial duration cannot exceed 365 days' };
  }
  return { ok: true, value: whole, unit, minutes };
}

function validateTrialSetting(key, value) {
  if (key === 'trialEnabled') {
    if (typeof value !== 'boolean') return { ok: false, message: 'trialEnabled must be boolean' };
    return { ok: true, value };
  }
  if (key === 'trialDurationUnit') {
    if (!TRIAL_UNITS.includes(value)) return { ok: false, message: 'Invalid trialDurationUnit' };
    return { ok: true, value };
  }
  if (key === 'trialDurationValue') {
    const whole = Math.floor(Number(value));
    if (!Number.isFinite(whole) || whole < 1 || Number(value) !== whole) {
      return { ok: false, message: 'trialDurationValue must be an integer >= 1' };
    }
    // Soft max assuming worst unit (days) so single-key PATCH stays safe
    if (toMinutes(whole, 'days') > MAX_TRIAL_MINUTES) {
      return { ok: false, message: 'Trial duration cannot exceed 365 days' };
    }
    return { ok: true, value: whole };
  }
  return { ok: true, value };
}

function getTrialExpiresAt(from = new Date(), minutes = TRIAL_DEFAULTS.value) {
  const expires = new Date(from);
  expires.setMinutes(expires.getMinutes() + minutes);
  return expires;
}

module.exports = {
  TRIAL_SETTING_KEYS,
  TRIAL_DEFAULTS,
  TRIAL_UNITS,
  MAX_TRIAL_MINUTES,
  parseTrialConfig,
  validateTrialSetting,
  validateTrialDuration,
  formatTrialLabel,
  getTrialExpiresAt,
  toMinutes,
};
```

Adjust the integer check in tests/impl to be consistent (prefer `Number.isInteger(Number(value))` after coercing only when value is already integer-like).

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd server && node --test tests/trialConfig.test.js`  
Expected: all pass

---

### Task 2: Wire config into subscriptionAccess grants

**Files:**
- Modify: `server/lib/subscriptionAccess.js`
- Test: `server/tests/subscriptionAccess.trial.test.js`

**Interfaces:**
- Consumes: `parseTrialConfig`, `getTrialExpiresAt` from `trialConfig.js`
- Produces:
  - `async function getTrialConfig(prisma) → { enabled, value, unit, minutes, label }`
  - `grantTrial` / `grantTrialToNewUser` / `grantTrialIfEligible` respect `enabled` and dynamic minutes
  - `grantTrialIfEligible` reason `'trial_disabled'` when disabled
  - `grantTrialToNewUser` returns `{ granted: false, user, reason: 'trial_disabled' }` shape **or** keep returning user but no-op — prefer same pattern as `grantTrialIfEligible`: change `grantTrialToNewUser` to return `{ granted, user, reason }` and update auth/passport callers in Task 3

**Preferred grant API (lock this):**

```js
async function grantTrialToNewUser(prisma, userId, now = new Date()) {
  return grantTrialIfEligible(prisma, userId, { force: false, now, skipUsedCheck: true });
}
```

Actually new users have never used trial, so `grantTrialIfEligible` already works. Prefer:

```js
async function grantTrialToNewUser(prisma, userId, now = new Date()) {
  const result = await grantTrialIfEligible(prisma, userId, { force: false });
  return result; // { granted, user, reason }
}
```

And update callers that currently ignore return / expect User — Task 3.

- [ ] **Step 1: Write failing grant tests with fake prisma**

Create `server/tests/subscriptionAccess.trial.test.js` that stubs a minimal in-memory prisma for `siteSettings.findMany`, `user.findUnique`, `user.update`, `userSubscription.create/count/updateMany`, `subscriptionPlan.findFirst`. Keep the fake small enough to cover:

1. Disabled → `grantTrialIfEligible` → `granted: false`, `reason: 'trial_disabled'`
2. Enabled 2 hours → after grant, `user.subExpiresAt` ≈ now + 120 minutes
3. Missing settings rows → defaults 30 minutes

If full prisma fake is too heavy, test only exported helpers by injecting:

```js
async function getTrialConfig(prisma) {
  const rows = await prisma.siteSettings.findMany({
    where: { key: { in: ['trialEnabled', 'trialDurationValue', 'trialDurationUnit'] } },
  });
  return parseTrialConfig(rows);
}
```

and unit-test `getTrialConfig` + a thin `assertTrialEnabled(cfg)` path. Minimum bar from spec: disabled gate + dynamic minutes must be covered.

- [ ] **Step 2: Run — FAIL until implementation**

Run: `cd server && node --test tests/subscriptionAccess.trial.test.js`

- [ ] **Step 3: Implement in `subscriptionAccess.js`**

Changes:

1. Import trial config helpers
2. Add `getTrialConfig(prisma)`
3. At start of `grantTrialIfEligible`, after user eligibility checks (or before grant):

```js
const cfg = await getTrialConfig(prisma);
if (!cfg.enabled) return { granted: false, user, reason: 'trial_disabled' };
```

4. Replace `getTrialExpiresAt(now)` hardcoded minutes with:

```js
async function grantTrial(prisma, userId, now = new Date()) {
  const cfg = await getTrialConfig(prisma);
  const trialExpires = getTrialExpiresAt(now, cfg.minutes);
  // ... rest unchanged
}
```

5. Export `getTrialConfig` (and keep exporting `TRIAL_LABEL` as default label for backward compat, or deprecate in favor of config.label)

6. `grantTrialToNewUser`: delegate to `grantTrialIfEligible` so disable is honored (new users are free + unused trial)

- [ ] **Step 4: Run tests — PASS**

Run: `cd server && node --test tests/trialConfig.test.js tests/subscriptionAccess.trial.test.js`

---

### Task 3: Auth + admin routes honor config + messages

**Files:**
- Modify: `server/routes/auth.js`
- Modify: `server/config/passport.js`
- Modify: `server/routes/admin.js`
- Modify: `server/seedAdmin.js`

**Interfaces:**
- Consumes: `getTrialConfig`, `grantTrialIfEligible` / updated `grantTrialToNewUser`
- Produces: validated PATCH for trial keys; `trial_disabled` admin message; dynamic auth messages

- [ ] **Step 1: Seed defaults in `seedAdmin.js`**

Add to `DEFAULT_SETTINGS`:

```js
{ key: 'trialEnabled', value: true, category: 'trial', description: 'Allow granting free trials to new/eligible users', isPublic: false },
{ key: 'trialDurationValue', value: 30, category: 'trial', description: 'Free trial duration magnitude', isPublic: false },
{ key: 'trialDurationUnit', value: 'minutes', category: 'trial', description: 'Free trial duration unit: minutes | hours | days', isPublic: false },
```

- [ ] **Step 2: Validate trial keys on PATCH in `admin.js`**

Near `router.patch('/settings/:key', ...)`:

```js
const { validateTrialSetting, TRIAL_SETTING_KEYS } = require('../lib/trialConfig');
const trialKeys = new Set(Object.values(TRIAL_SETTING_KEYS));

// inside handler, before upsert:
if (trialKeys.has(req.params.key)) {
  const checked = validateTrialSetting(req.params.key, req.body.value);
  if (!checked.ok) return res.status(400).json({ success: false, message: checked.message });
  req.body.value = checked.value;
}
```

When saving `trialDurationValue` alone, also optionally load current unit and call `validateTrialDuration` for accurate max — recommended:

```js
if (req.params.key === 'trialDurationValue' || req.params.key === 'trialDurationUnit') {
  const rows = await prisma.siteSettings.findMany({
    where: { key: { in: ['trialDurationValue', 'trialDurationUnit'] } },
  });
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const nextValue = req.params.key === 'trialDurationValue' ? checked.value : (map.trialDurationValue ?? 30);
  const nextUnit = req.params.key === 'trialDurationUnit' ? checked.value : (map.trialDurationUnit ?? 'minutes');
  const dur = validateTrialDuration(nextValue, nextUnit);
  if (!dur.ok) return res.status(400).json({ success: false, message: dur.message });
}
```

- [ ] **Step 3: Admin grant messages**

Add to reason map:

```js
trial_disabled: 'Free trial is disabled in Settings. Enable it to grant trials.',
```

For success message, use config label:

```js
const cfg = await getTrialConfig(prisma);
message: `${cfg.label} trial granted`,
```

For `grant-trial-all`, if disabled return early:

```js
const cfg = await getTrialConfig(prisma);
if (!cfg.enabled) {
  return res.status(400).json({
    success: false,
    message: 'Free trial is disabled in Settings',
    reason: 'trial_disabled',
    data: { eligible: 0, granted: 0 },
  });
}
```

(Alternatively let loop grant 0 via `grantTrialIfEligible` — early return is clearer.)

- [ ] **Step 4: Auth register/login messages**

After grant / sync:

```js
const cfg = await getTrialConfig(prisma);
// register:
const result = await grantTrialToNewUser(prisma, user.id, now);
const freshUser = result.user || await prisma.user.findUnique({ where: { id: user.id } });
message: result.granted
  ? `Account created! ${cfg.label} free trial activated.`
  : 'Account created!',
```

Login already uses `trialGranted` — swap `TRIAL_LABEL` for `(await getTrialConfig(prisma)).label`.

Passport + Google verify: `grantTrialToNewUser` already no-ops when disabled if Task 2 wires it; ensure return value handling does not throw if shape changed.

- [ ] **Step 5: Manual verification script (optional smoke)**

If DB available: run seed, flip `trialEnabled` false via prisma studio or API, register a throwaway user, confirm `subPlanSlug === 'free'`.

---

### Task 4: Admin Settings Free Trial card

**Files:**
- Modify: `frontend/src/pages/admin/AdminSettings.jsx`
- Uses existing: `frontend/src/api.js` `adminGetSettings`, `adminUpdateSetting`

**Interfaces:**
- Consumes settings rows with keys `trialEnabled`, `trialDurationValue`, `trialDurationUnit`
- Produces Save that PATCHes all three keys

- [ ] **Step 1: Add Free Trial card above grouped list**

State:

```js
const [trialEnabled, setTrialEnabled] = useState(true)
const [trialValue, setTrialValue] = useState(30)
const [trialUnit, setTrialUnit] = useState('minutes')
const [trialSaving, setTrialSaving] = useState(false)
```

On `load()` success, hydrate from `res.data` (find by key; keep defaults if missing).

UI (match existing AdminSettings glass-card styling):

- Title: Free Trial
- Toggle checkbox / switch for Enable free trial for new grants
- Number input + select (`minutes` | `hours` | `days`)
- Helper: “Applies only to newly granted trials. Active trials keep their current end time. When disabled, signup, login auto-grant, and admin Grant trial are all blocked.”
- Save button (superadmin only) that:

```js
await adminUpdateSetting('trialEnabled', trialEnabled, 'Update free trial settings')
await adminUpdateSetting('trialDurationValue', Number(trialValue), 'Update free trial settings')
await adminUpdateSetting('trialDurationUnit', trialUnit, 'Update free trial settings')
```

Show error if any PATCH fails; on success toast + `load()`.

- [ ] **Step 2: Hide trial keys from generic list (optional polish)**

When rendering generic grouped settings, filter out the three trial keys so they are not duplicated under category `trial`.

```js
const TRIAL_KEYS = new Set(['trialEnabled', 'trialDurationValue', 'trialDurationUnit'])
const settingsForList = settings.filter(s => !TRIAL_KEYS.has(s.key))
```

- [ ] **Step 3: Manual UI check**

1. Login as superadmin → Admin → Settings  
2. See Free Trial card  
3. Set 2 hours, Save, grant trial to a free test user → expiry ~2h  
4. Disable, Save → Grant trial fails with disabled message; new register stays free  
5. Re-enable → works again  

---

### Task 5: End-to-end verification

- [ ] **Step 1: Run all related unit tests**

```bash
cd server && node --test tests/trialConfig.test.js tests/subscriptionAccess.trial.test.js
```

Expected: all pass

- [ ] **Step 2: Ensure seed upserts trial keys**

```bash
cd server && node seedAdmin.js
```

Expected: settings seeded including trial keys (or confirm via GET `/api/admin/settings`)

- [ ] **Step 3: Spec checklist**

Confirm each row from design Test plan:

1. Defaults enabled 30 minutes  
2. Hours unit expiry  
3. Disable → signup free  
4. Disable → login no auto-grant  
5. Disable → admin grant + bulk fail  
6. Re-enable works  
7. Duration change does not rewrite active trial expiry  
8. Settings card persists  
9. Invalid unit/value rejected  

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Flexible duration value+unit | 1, 4 |
| trialEnabled gate | 2, 3 |
| Existing trials untouched on disable | 2 (no revoke calls) |
| Manual + bulk blocked when disabled | 2, 3 |
| SiteSettings storage + seed | 3 |
| Dedicated Settings card | 4 |
| Dynamic labels in auth/admin | 3 |
| Validation + 365d max | 1, 3 |
| Audit via existing settings_update | 3 (unchanged PATCH) |

No placeholders remaining. Commit steps omitted per Global Constraints (user must ask).
