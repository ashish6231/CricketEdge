# Public Browse + Controlled Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guests browse ended matches without a login wall; live data needs header Login; signup defaults to Superadmin-created users with a Settings enum (`admin_only` / `public` / `both`).

**Architecture:** Replace boolean `allowSignups` with `signupMode`. Switch match list/detail routes to `optionalAuth` and filter guests to `ended`. Make `App.jsx` render `MainLayout` for guests; add a real Login modal listening for `open-login-modal`. Superadmin gets `POST /admin/users` + Create User UI.

**Tech Stack:** Node.js, Express, Prisma `SiteSettings`, React (App / MainLayout / LoginPage / AdminSettings / AdminUsers), `node:test`

**Spec:** `docs/superpowers/specs/2026-08-17-public-browse-signup-modes-design.md`

## Global Constraints

- Do **not** create git commits unless the user explicitly asks
- Default `signupMode` = `admin_only`
- Valid modes only: `admin_only` | `public` | `both`
- Google **new** user blocked when public signup not allowed; existing Google users always login OK
- Guest security boundary is **server** filter (not frontend-only)
- Admin create user remains available in all modes (Superadmin)
- Logout must stay on site as guest (no force `/login`)
- Do not implement signup OTP in this plan

## File Structure

| File | Responsibility |
|------|----------------|
| `server/lib/siteSettings.js` | `signupMode` read/migrate helpers; wrap `areSignupsAllowed` |
| `server/lib/guestMatchAccess.js` | Pure helpers: filter ended matches; decide if snapshot needs login |
| `server/seedAdmin.js` | Seed `signupMode: admin_only` |
| `server/routes/auth.js` | `signup-status` returns mode; register gated |
| `server/config/passport.js` | Block Google new-user when not allowed |
| `server/routes/cricket.js` | `optionalAuth` + guest ended filter on lists/details |
| `server/routes/admin.js` | Validate `signupMode`; `POST /users` create |
| `frontend/src/utils/trialSettingsAdmin.js` | Hydrate/save `signupMode` (replace boolean UI helpers) |
| `frontend/src/pages/admin/AdminSettings.jsx` | 3-way signup mode control |
| `frontend/src/pages/admin/AdminUsers.jsx` | Create user modal (superadmin) |
| `frontend/src/api.js` | `adminCreateUser` |
| `frontend/src/App.jsx` | Public shell; protect admin/profile/subscription only |
| `frontend/src/components/MainLayout.jsx` | Login modal + top-right Login; logout stays |
| `frontend/src/pages/LoginPage.jsx` | Modal-friendly; signup tab from `signupMode` |
| `frontend/src/pages/CricketPage.jsx` / `TennisPage.jsx` | Guest banner (optional, light) |
| `server/tests/siteSettings.test.js` | Mode helpers |
| `server/tests/guestMatchAccess.test.js` | Filter / gate helpers |
| `frontend/src/utils/trialSettingsAdmin.test.js` | Signup mode hydrate/filter |

---

### Task 1: Signup mode helpers + seed

**Files:**
- Modify: `server/lib/siteSettings.js`
- Modify: `server/seedAdmin.js`
- Modify: `server/tests/siteSettings.test.js`

**Interfaces:**
- Produces:
  - `SIGNUP_MODE_KEY = 'signupMode'`
  - `SIGNUP_MODES = ['admin_only', 'public', 'both']`
  - `DEFAULT_SIGNUP_MODE = 'admin_only'`
  - `LEGACY_SIGNUP_KEY = 'allowSignups'` (keep export alias `SIGNUP_SETTING_KEY` pointing to legacy for one release OR re-export both)
  - `resolveSignupMode({ signupModeRow, allowSignupsRow }) → 'admin_only'|'public'|'both'`
  - `async getSignupMode(prisma) → mode`
  - `isPublicSignupAllowed(mode) → boolean` (`public` or `both`)
  - `async areSignupsAllowed(prisma)` → `isPublicSignupAllowed(await getSignupMode(prisma))`
  - `validateSignupModeValue(value) → { ok: true, value } | { ok: false, message }`

- [ ] **Step 1: Write failing tests** in `server/tests/siteSettings.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveSignupMode,
  isPublicSignupAllowed,
  validateSignupModeValue,
  DEFAULT_SIGNUP_MODE,
} = require('../lib/siteSettings');

test('resolveSignupMode prefers signupMode when present', () => {
  assert.equal(
    resolveSignupMode({ signupModeRow: { value: 'admin_only' }, allowSignupsRow: { value: true } }),
    'admin_only',
  );
});

test('resolveSignupMode migrates legacy allowSignups true → both', () => {
  assert.equal(
    resolveSignupMode({ signupModeRow: null, allowSignupsRow: { value: true } }),
    'both',
  );
});

test('resolveSignupMode migrates legacy false/missing → admin_only', () => {
  assert.equal(resolveSignupMode({ signupModeRow: null, allowSignupsRow: { value: false } }), 'admin_only');
  assert.equal(resolveSignupMode({ signupModeRow: null, allowSignupsRow: null }), DEFAULT_SIGNUP_MODE);
});

test('isPublicSignupAllowed', () => {
  assert.equal(isPublicSignupAllowed('admin_only'), false);
  assert.equal(isPublicSignupAllowed('public'), true);
  assert.equal(isPublicSignupAllowed('both'), true);
});

test('validateSignupModeValue rejects junk', () => {
  assert.equal(validateSignupModeValue('nope').ok, false);
  assert.equal(validateSignupModeValue('admin_only').ok, true);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test server/tests/siteSettings.test.js
```

- [ ] **Step 3: Implement helpers** in `server/lib/siteSettings.js`

```js
const SIGNUP_MODE_KEY = 'signupMode';
const LEGACY_SIGNUP_KEY = 'allowSignups';
const SIGNUP_SETTING_KEY = LEGACY_SIGNUP_KEY; // backward compat export
const SIGNUP_MODES = ['admin_only', 'public', 'both'];
const DEFAULT_SIGNUP_MODE = 'admin_only';

function resolveSignupMode({ signupModeRow, allowSignupsRow } = {}) {
  const raw = signupModeRow?.value;
  if (typeof raw === 'string' && SIGNUP_MODES.includes(raw)) return raw;
  if (allowSignupsRow && allowSignupsRow.value != null) {
    return Boolean(allowSignupsRow.value) ? 'both' : 'admin_only';
  }
  return DEFAULT_SIGNUP_MODE;
}

function isPublicSignupAllowed(mode) {
  return mode === 'public' || mode === 'both';
}

function validateSignupModeValue(value) {
  if (typeof value !== 'string' || !SIGNUP_MODES.includes(value)) {
    return { ok: false, message: 'signupMode must be admin_only, public, or both' };
  }
  return { ok: true, value };
}

async function getSignupMode(prisma) {
  const rows = await prisma.siteSettings.findMany({
    where: { key: { in: [SIGNUP_MODE_KEY, LEGACY_SIGNUP_KEY] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r]));
  return resolveSignupMode({
    signupModeRow: map[SIGNUP_MODE_KEY] || null,
    allowSignupsRow: map[LEGACY_SIGNUP_KEY] || null,
  });
}

async function areSignupsAllowed(prisma) {
  return isPublicSignupAllowed(await getSignupMode(prisma));
}

module.exports = {
  SIGNUP_MODE_KEY,
  LEGACY_SIGNUP_KEY,
  SIGNUP_SETTING_KEY,
  SIGNUP_MODES,
  DEFAULT_SIGNUP_MODE,
  resolveSignupMode,
  isPublicSignupAllowed,
  validateSignupModeValue,
  getSignupMode,
  areSignupsAllowed,
};
```

- [ ] **Step 4: Seed** — in `server/seedAdmin.js` `DEFAULT_SETTINGS`, add:

```js
{ key: 'signupMode', value: 'admin_only', category: 'general', description: 'Who can create accounts: admin_only | public | both', isPublic: true },
```

Keep legacy `allowSignups` row for migration reads (can leave as `false` going forward or stop upserting — prefer stop writing true; if row still upserted, set `value: false` so legacy alone does not reopen public signup when `signupMode` exists).

- [ ] **Step 5: Run tests — expect PASS**

```bash
node --test server/tests/siteSettings.test.js
```

---

### Task 2: Guest match access helpers + cricket/tennis routes

**Files:**
- Create: `server/lib/guestMatchAccess.js`
- Create: `server/tests/guestMatchAccess.test.js`
- Modify: `server/routes/cricket.js`

**Interfaces:**
- Produces:
  - `isEndedMatch(match) → boolean` (`match?.status === 'ended'`)
  - `filterMatchesForViewer(matches, user) → matches` (if `!user` filter ended)
  - `guestMayViewMatch(matchInfo, user) → boolean` (ended OR user present)

- [ ] **Step 1: Failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterMatchesForViewer, guestMayViewMatch } = require('../lib/guestMatchAccess');

test('guest only gets ended matches', () => {
  const all = [
    { matchId: '1', status: 'ended' },
    { matchId: '2', status: 'open' },
    { matchId: '3', inPlay: true, status: 'suspended' },
  ];
  assert.deepEqual(filterMatchesForViewer(all, null).map((m) => m.matchId), ['1']);
});

test('logged-in user gets full list', () => {
  const all = [{ matchId: '1', status: 'ended' }, { matchId: '2', status: 'open' }];
  assert.equal(filterMatchesForViewer(all, { userId: 1 }).length, 2);
});

test('guestMayViewMatch', () => {
  assert.equal(guestMayViewMatch({ status: 'ended' }, null), true);
  assert.equal(guestMayViewMatch({ status: 'open' }, null), false);
  assert.equal(guestMayViewMatch({ status: 'open' }, { userId: 1 }), true);
});
```

- [ ] **Step 2: Implement** `server/lib/guestMatchAccess.js`

```js
function isEndedMatch(match) {
  return match?.status === 'ended';
}

function filterMatchesForViewer(matches, user) {
  const list = Array.isArray(matches) ? matches : [];
  if (user) return list;
  return list.filter(isEndedMatch);
}

function guestMayViewMatch(matchInfo, user) {
  if (user) return true;
  return isEndedMatch(matchInfo);
}

module.exports = { isEndedMatch, filterMatchesForViewer, guestMayViewMatch };
```

- [ ] **Step 3: Update routes** in `server/routes/cricket.js`

Import `optionalAuth` from middleware and helpers.

Change these to `optionalAuth`:
- `GET /cricket/matches`
- `GET /tennis/matches`
- `GET /toss/matches`
- `GET /session/matches`

After fetching matches array, before `res.json`:

```js
const filtered = filterMatchesForViewer(matches, req.user);
res.json({ total: filtered.length, matches: filtered });
```

(Adapt toss response shape: if body is `{ matches: data }` and `data` is array, filter the array.)

For `GET /cricket/match/:matchId` and `GET /tennis/match/:matchId`:
- Use `optionalAuth` instead of `verifyToken`
- Resolve `matchInfo` from list as today
- If `!guestMayViewMatch(matchInfo, req.user)` → `return res.status(401).json({ error: 'login_required', message: 'Live/upcoming match data requires login.', matchId })`
- If user present and match not ended → keep existing Pro gate (`hasProAccess`) as today
- If ended and no user → allow snapshot through

Toss/session **detail** that currently use `requireProSubscription` can stay Pro-gated for logged-in users; guests hitting them should get login_required (401) rather than subscription error. Prefer: `optionalAuth` then if `!req.user` → `login_required`; if user → existing Pro check. (If toss/session have no reliable ended flag on list entry, require login for all non-list detail — acceptable.)

Odds bulk (`requireProSubscription`) stays auth+Pro only (live list odds); guests won't call it if list is ended-only.

- [ ] **Step 4: Run**

```bash
node --test server/tests/guestMatchAccess.test.js
```

---

### Task 3: Auth register / Google / signup-status + admin PATCH validation

**Files:**
- Modify: `server/routes/auth.js`
- Modify: `server/config/passport.js`
- Modify: `server/routes/admin.js` (signupMode PATCH validation; keep legacy allowSignups validation or map writes)

**Interfaces:**
- Consumes: `getSignupMode`, `isPublicSignupAllowed`, `areSignupsAllowed`, `validateSignupModeValue`, `SIGNUP_MODE_KEY`
- `GET /auth/signup-status` → `{ success, data: { signupMode, allowSignups } }` where `allowSignups === isPublicSignupAllowed(signupMode)`

- [ ] **Step 1: Update signup-status**

```js
const mode = await getSignupMode(prisma);
res.json({
  success: true,
  data: {
    signupMode: mode,
    allowSignups: isPublicSignupAllowed(mode),
  },
});
```

- [ ] **Step 2: Keep register gated via `areSignupsAllowed`** (already wraps mode) — confirm message `SIGNUPS_DISABLED`.

- [ ] **Step 3: Google paths** — in `passport.js` and `auth.js` `/google/verify`, when creating a **new** user, call `areSignupsAllowed`; if false, fail with message like `New signups are currently disabled` / `SIGNUPS_DISABLED`. Do not create the row.

- [ ] **Step 4: Admin PATCH** — when `req.params.key === SIGNUP_MODE_KEY`:

```js
const v = validateSignupModeValue(req.body.value);
if (!v.ok) return res.status(400).json({ success: false, message: v.message });
```

If someone PATCHes legacy `allowSignups`, either reject with “use signupMode” or map `true→both`, `false→admin_only` and write `signupMode` (prefer map for one release).

---

### Task 4: Superadmin create user API + Admin Users UI

**Files:**
- Modify: `server/routes/admin.js`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/pages/admin/AdminUsers.jsx`

**Interfaces:**
- `POST /api/admin/users` (`requireSuperAdmin`)
  - Body: `{ name, email, password }`
  - Creates `role: 'user'`, `authProvider: 'local'`, `isVerified: true`, free plan fields like create-admin
  - Calls `grantTrialToNewUser` when trial enabled (same as register)
  - Audit: `user_create`
  - 409 if email exists

- [ ] **Step 1: Add route** after existing users GET block (mirror `POST /admins` but `role: 'user'` + trial grant):

```js
router.post('/users', requireSuperAdmin, async (req, res) => {
  // validate name/email/password
  // create user role user
  // grantTrialToNewUser(prisma, user.id, now)
  // auditLog(..., 'user_create', ...)
  // return sanitize
});
```

- [ ] **Step 2: `adminCreateUser` in `frontend/src/api.js`**

```js
export function adminCreateUser({ name, email, password }) {
  return fetchAPI('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  })
}
```

- [ ] **Step 3: AdminUsers UI** — Superadmin-only “Create user” button → small modal/form (name, email, password) → call API → toast → reload list. Match existing glass-card / admin button styles.

---

### Task 5: Admin Settings signupMode UI

**Files:**
- Modify: `frontend/src/utils/trialSettingsAdmin.js`
- Modify: `frontend/src/utils/trialSettingsAdmin.test.js`
- Modify: `frontend/src/pages/admin/AdminSettings.jsx`

**Interfaces:**
- `SIGNUP_MODE_KEY = 'signupMode'`
- `SIGNUP_MODES = ['admin_only', 'public', 'both']`
- `hydrateSignupMode(rows) → mode` (prefer `signupMode`; else legacy boolean → `both`/`admin_only`; default `admin_only`)
- `formatSignupModeMessage(mode) → string`
- `CARD_SETTING_KEYS` includes `signupMode` and legacy `allowSignups`

- [ ] **Step 1: Tests** for hydrate + message

```js
test('hydrateSignupMode reads signupMode', () => {
  assert.equal(hydrateSignupMode([{ key: 'signupMode', value: 'public' }]), 'public')
})
test('hydrateSignupMode defaults admin_only', () => {
  assert.equal(hydrateSignupMode([]), 'admin_only')
})
```

- [ ] **Step 2: Replace boolean toggle** in AdminSettings with 3 segmented buttons / radios:

- Admin only — Superadmin creates accounts  
- Public — anyone can register  
- Both — public register + admin create  

Save via `adminUpdateSetting(SIGNUP_MODE_KEY, signupMode, 'Update signup mode')`.

- [ ] **Step 3: Run**

```bash
node --test frontend/src/utils/trialSettingsAdmin.test.js
```

---

### Task 6: Public App shell + Login modal

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/MainLayout.jsx`
- Modify: `frontend/src/pages/LoginPage.jsx`

**Interfaces:**
- App always mounts browse routes inside optional-auth layout
- MainLayout listens `open-login-modal` / exposes Login button that opens modal
- LoginPage works as full page **and** as `embedded` / `modal` variant (`isModal` prop): on success call `onLoginSuccess` and close

- [ ] **Step 1: Rewrite App routing**

```jsx
function AppShell() {
  // optional auth: load token → user; never Navigate to /login for missing token
  return <MainLayout />
}

function RequireAuth({ children }) {
  const { isLoggedIn } = useOutletContext()
  useEffect(() => {
    if (!isLoggedIn) window.dispatchEvent(new CustomEvent('open-login-modal'))
  }, [isLoggedIn])
  if (!isLoggedIn) return null // or soft placeholder
  return children
}

// Routes:
// /login → Navigate to /cricket + open modal (small effect component)
// AppShell wraps cricket/tennis
// /admin, /profile, /subscription wrapped in RequireAuth (+ AdminRoute for admin)
// * → /cricket
```

Pass `isLoggedIn` / `user` via MainLayout outlet (already does). Ensure AppShell does not use old `PrivateRoute` fail→`/login`.

- [ ] **Step 2: MainLayout Login modal**

- State: `loginOpen`
- `useEffect` listen `open-login-modal` → `setLoginOpen(true)`
- Replace `<Link to="/login">` with `<button onClick={() => setLoginOpen(true)}>Login</button>`
- Overlay: dark backdrop + panel rendering `<LoginPage isModal onLoginSuccess={(email, user) => { handleLoginSuccess(email, user); setLoginOpen(false) }} onClose={() => setLoginOpen(false)} />`
- `handleLogout`: clear auth, `navigate('/cricket')` (or current path) — **not** `/login`

- [ ] **Step 3: LoginPage**

- Read `signup-status`: use `allowSignups` (compat) **or** `signupMode` with `isPublicSignupAllowed`
- Hide signup tab when `!allowSignups`
- Support `isModal` / `onClose` (X button)
- On success in modal: don't `navigate` away hard; parent handles

- [ ] **Step 4: Manual check**
  - Incognito `/` → cricket ended list, no login redirect  
  - Header Login opens modal  
  - Live match → login_required UI → modal  

---

### Task 7: Guest UX polish on list pages

**Files:**
- Modify: `frontend/src/pages/CricketPage.jsx`
- Modify: `frontend/src/pages/TennisPage.jsx` (same pattern)

- [ ] **Step 1:** When `!isLoggedIn`, show a slim banner under header content:

“Login to see live & upcoming matches” + button dispatching `open-login-modal`.

- [ ] **Step 2:** After login, reload matches (`useEffect` dep on `isLoggedIn` or call load again) so live rows appear without full page refresh.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Public shell / no forced login | 6 |
| Top-right Login modal | 6 |
| Guest list ended-only (server) | 2 |
| Guest live detail login_required | 2 |
| Guest ended detail OK | 2 |
| `signupMode` enum + default admin_only | 1, 3, 5 |
| Legacy allowSignups migrate | 1 |
| Register / Google new blocked | 3 |
| Superadmin create user | 4 |
| Settings 3-way UI | 5 |
| Logout stays as guest | 6 |
| Guest banner + refresh after login | 7 |
| OTP out of scope | — |

## Self-review notes

- No OTP tasks included  
- `public` vs `both` identical for public paths; admin create always on — matches spec  
- Toss/session detail: prefer login gate for guests if ended detection unreliable  

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-08-17-public-browse-signup-modes.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — same session, batch with checkpoints  

Which approach?
