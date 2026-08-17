# Public Browse + Controlled Signup — Design Spec

**Date:** 2026-08-17  
**Status:** Approved for planning  
**Goal:** Let guests browse the site and see only ended matches; require login (top-right) for live/upcoming; remove public self-signup by default; Superadmin creates users; Settings control who can create accounts (`admin_only` / `public` / `both`).

---

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Site entry | No forced `/login`; open Crickeť/Tennis shell as guest |
| Login UX | Top-right **Login** opens modal (not a full-page gate) |
| Guest match list | Only `status === 'ended'` |
| Guest live/upcoming detail | Locked + Login CTA |
| Guest ended detail | Allowed |
| Public signup UI | Hidden when mode is `admin_only` |
| Google first-time (new user) | **Blocked** when public signup is not allowed |
| Google existing user | Always allowed to log in |
| Default signup mode | `admin_only` |
| Who creates users under `admin_only` | Superadmin only |
| Approach | Public shell + `optionalAuth` APIs (not frontend-only filter) |

---

## Problem

Today the whole app sits behind `PrivateRoute`: unauthenticated users are redirected to `/login`. Anyone can also self-register via `/auth/register` (when `allowSignups` is true), including fake emails. Product wants:

1. Guests can land on the site and browse **ended** matches only  
2. Live data requires login via header button  
3. New accounts are created by Superadmin (for now), with a Settings knob to reopen public signup later  

---

## Architecture overview

```
Guest visits /
        │
        ▼
 MainLayout (public shell)
   ├─ no token → list/detail APIs with optionalAuth
   │              └─ server filters to ended only
   └─ Login (top-right) → modal → token → full live access
        │
        ▼
 SiteSettings.signupMode
   admin_only | public | both
        │
        ├─ /auth/register + Google new-user  (public | both)
        └─ POST /admin/users (create)        (admin_only | both)
```

---

## Settings

### Replace boolean with enum

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `signupMode` | string | `"admin_only"` | One of: `admin_only`, `public`, `both` |

- Seed / migrate: if old `allowSignups: true` → `both` (or `public`); if `false` / missing → `admin_only`  
- Keep reading legacy `allowSignups` only for one-release migration fallback; new UI writes `signupMode` only  
- `isPublic: true` (or expose via `/auth/signup-status`) so Login modal knows whether to show Signup tab  

### Mode matrix

| Mode | Public `/register` | Google **new** user | Superadmin create user | Signup tab in UI |
|------|--------------------|---------------------|------------------------|------------------|
| `admin_only` | ❌ 403 | ❌ block | ✅ | Hidden |
| `public` | ✅ | ✅ | ✅ (keep admin create) | Shown |
| `both` | ✅ | ✅ | ✅ | Shown |

Notes:
- Existing Google users can always sign in regardless of mode.  
- Admin create remains available in all modes (Superadmin convenience).  
- `public` vs `both` is reserved for future tightening; for v1 both behave the same for public paths; `both` documents intent that admin create is first-class.

### Helpers

`server/lib/siteSettings.js`:

- `getSignupMode(prisma)` → `'admin_only' | 'public' | 'both'`  
- `isPublicSignupAllowed(mode)` → mode is `public` or `both`  
- Deprecate / wrap `areSignupsAllowed` to call `isPublicSignupAllowed(getSignupMode(...))`

Admin Settings UI: radio or segmented control for the three modes (Superadmin only), replace the current boolean toggle.

---

## Auth / routing (frontend)

### App shell

- Remove “must be logged in to see MainLayout” gate for cricket/tennis browse.  
- `PrivateRoute` → become optional auth shell: always render `MainLayout`; attach `isLoggedIn` / `user` from token if present.  
- Protect only: `/admin`, `/profile`, `/subscription` (redirect or open login modal if guest).  
- `/login` route: redirect to `/cricket` and dispatch `open-login-modal` (or render modal once).  
- Catch-all `*` → `/cricket` (not `/login`).

### Header

- Logged out: top-right **Login** button → `open-login-modal`.  
- Logged in: existing avatar / plan / logout (logout stays on site as guest, does **not** force `/login`).

### Login modal

- Reuse `LoginPage` content as modal (or extract shared form).  
- Signup tab / link only if `signupMode` is `public` or `both`.  
- Google button: always shown for login; server blocks **new** Google accounts when public signup disallowed.

---

## Match access (server + client)

### List endpoints

Apply to cricket / tennis / toss / session match lists as applicable:

- Middleware: `optionalAuth` (not hard `verifyToken`).  
- If `!req.user`: return only matches with `status === 'ended'`.  
- If `req.user`: return full list (existing Pro gating on detail stays).

### Detail / snapshot endpoints

- **Ended**: allow without token (or optionalAuth).  
- **Not ended** (live / upcoming): require token; if missing → `401` / `{ error: 'login_required' }` (existing UI already opens login modal).  
- Pro subscription checks for live remain as today for logged-in free users.

### Frontend lists

- Guest: show ended-only list (server already filtered; UI may still badge ENDED).  
- Optional banner: “Login to see live matches” when guest.  
- Do not rely on client-only filtering as the security boundary.

---

## Superadmin create user

New endpoint (example): `POST /api/admin/users` (`requireSuperAdmin`)

Body: `{ name, email, password, role?: 'user' }`  
- Default role `user`  
- Same password rules as register / create admin  
- `authProvider: 'local'`, `isVerified: true`  
- Respect trial settings via existing `grantTrialToNewUser` when enabled  
- Audit log: `user_create`

Admin Users UI: **Create user** form/modal for Superadmin.

Existing `POST /admins` unchanged (creates `admin` role).

---

## Public register / Google

- `POST /auth/register`: allow only if `isPublicSignupAllowed`; else 403 `SIGNUPS_DISABLED`.  
- Passport Google + `/google/verify`: if no existing user and public signup not allowed → fail with clear message (no account created).  
- `/auth/signup-status`: return `{ signupMode, allowSignups: isPublicSignupAllowed }` for backward-compatible clients.

---

## Out of scope

- Email OTP verification for signup (revisit when `public` mode is turned on)  
- Changing Pro / trial pricing rules  
- Forcing Google-only auth  
- Hiding Tennis/Cricket nav from guests  

---

## Test plan (high level)

- Guest opens `/` → sees ended matches only; no redirect to login  
- Guest opens live match URL → login required UI  
- Guest sees ended match detail  
- Login via header → live matches appear  
- Logout → back to guest ended-only; stay on site  
- `admin_only`: `/register` 403; Google new user blocked; Superadmin create user works  
- `public` / `both`: register + Google new user work; Signup tab visible  
- Settings PATCH rejects invalid `signupMode`

---

## Migration notes

1. Seed `signupMode: admin_only`.  
2. On read: if `signupMode` missing and `allowSignups === true`, treat as `both`; if false/missing, `admin_only`.  
3. Settings UI stops writing `allowSignups` after deploy (optional one-time write of both keys during migration).
