---
description: Restrictions around upstream authentication and session cookies for tennisliveload
---

# Authentication & Session Rule

**CRITICAL RULE FOR ALL AGENTS:**
NEVER call the upstream login functions or attempt to generate new session cookies dynamically in background scripts, scratch files, or API integrations. 

The upstream provider (`tennisliveload.com`) enforces a strict daily limit of exactly 2 logins per day per account. Hitting this limit causes a hard 429 block and invalidates the user's active session across the entire application, breaking the live site.

- **ALWAYS** rely exclusively on the environment variables (`TENNIS_SESSION_COOKIES` in `.env`) or the cached `tennis_cookies.json` for authentication.
- **NEVER** execute `await tennisLogin.login(...)` or make any POST request to `/api/auth/login` in your test scripts or analytical tasks.
- **ALWAYS** gracefully skip data processing if the cookie is expired rather than trying to refresh it.
