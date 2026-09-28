# CricEdge — Architecture & Flow

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, deployed on Vercel |
| Backend | Node.js + Express, deployed on Render (free tier) |
| Database | Neon PostgreSQL (serverless), pgBouncer pooler |
| ORM | Prisma 7 (`@prisma/adapter-pg`) |
| Realtime | Socket.IO (polling + websocket) |
| Auth | JWT (10yr expiry) + Google OAuth |
| Payments | Razorpay |
| Notifications | Telegram Bot API |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                 │
│  React + Vite → cricedge.in / www.cricedge.in        │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS REST + Socket.IO
                     ▼
┌─────────────────────────────────────────────────────┐
│                  BACKEND (Render)                    │
│  Node.js + Express → api.cricedge.in                 │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │  Routes  │  │ Services │  │  Scraper Workers   │ │
│  │ /api/auth│  │ Socket   │  │  scraper-crex      │ │
│  │ /api/    │  │ Normaliz │  │  scraper-tll       │ │
│  │ cricket  │  │ Predictn │  │  matchCapture      │ │
│  │ /api/    │  │ Telegram │  │  tossCapture       │ │
│  │ admin    │  └──────────┘  └────────────────────┘ │
│  └──────────┘                                        │
└────────────────────┬────────────────────────────────┘
                     │ Prisma + pg.Pool
                     ▼
┌─────────────────────────────────────────────────────┐
│              Neon PostgreSQL (Serverless)             │
│  pgBouncer Pooler URL (connection_limit=5)           │
└─────────────────────────────────────────────────────┘
```

---

## Backend Structure

```
server/
├── index.js                  # Entry point — Express setup, Socket.IO, workers start
├── db/prisma.js              # PrismaClient with PrismaPg adapter
├── prisma.config.ts          # Prisma 7 CLI config (url/directUrl for migrations)
├── prisma/schema.prisma      # DB schema
├── seedAdmin.js              # Seeds admin user + default plans on startup
│
├── routes/
│   ├── auth.js               # /api/auth/* — login, register, OTP, Google OAuth, /me
│   ├── cricket.js            # /api/cricket/* — matches, odds, bundle, crex
│   ├── subscription.js       # /api/subscription/* — plans, orders, verify payment
│   ├── admin.js              # /api/admin/* — users, plans, coupons, settings, audit
│   └── telegram.js           # /api/telegram/* — membership gate
│
├── middleware/
│   ├── auth.js               # verifyToken, optionalAuth, requireProSubscription
│   └── admin.js              # requireAdmin, requireSuperAdmin
│
├── services/
│   ├── socketService.js      # Socket.IO event emitter — broadcasts to rooms
│   ├── dataCache.js          # In-memory match/odds cache
│   ├── predictionEngine.js   # Toss + winner prediction logic
│   ├── matchPayloadService.js# Builds full match bundle payload
│   ├── crexService.js        # Crex API wrapper
│   ├── telegramService.js    # Telegram bot — membership check, OTP verify
│   │
│   ├── scraper-crex/         # Crex live scorecard scraper worker
│   ├── scraper-tennisliveload/ # Tennis live data scraper worker
│   ├── normalizer/           # Ingestion pipeline — raw data → normalized format
│   ├── api-broadcast/        # Redis pub/sub bridge → socketService
│   │
│   ├── matchCaptureWorker.js # Periodic match snapshot capture
│   └── tossCaptureWorker.js  # Periodic toss data capture
│
├── lib/
│   ├── subscriptionAccess.js # Trial logic, plan access checks, syncUserTrialState
│   ├── siteSettings.js       # getSiteMode, getSiteName, getSignupMode (DB cached)
│   ├── guestMatchAccess.js   # Which matches guests can see
│   └── publicUrl.js          # getFrontendUrl, getApiPublicUrl
│
└── utils/
    ├── tossPredictor.js       # Toss prediction algorithms
    ├── matchWinnerPredictor.js# Match winner prediction
    └── leagueAlgorithms.js    # League-specific toss algorithms
```

---

## Frontend Structure

```
frontend/src/
├── main.jsx                  # React root, BrowserRouter
├── App.jsx                   # Routes definition
├── api.js                    # All REST API calls (fetchAPI wrapper)
├── socket.js                 # Socket.IO client + sessionStorage match cache
│
├── pages/
│   ├── LoginPage.jsx         # Login + health polling (Render cold start fix)
│   ├── CricketPage.jsx       # Match list — loads from sessionStorage cache
│   ├── MatchDetail.jsx       # Single match — odds, crex scorecard, predictions
│   ├── TossPage.jsx          # Toss predictions list
│   ├── TossDetail.jsx        # Single toss detail
│   ├── SessionPage.jsx       # Session trading list
│   ├── SessionDetail.jsx     # Single session detail
│   ├── TennisPage.jsx        # Tennis matches
│   ├── LiveDesk.jsx          # Live desk view
│   ├── ProfilePage.jsx       # User profile + subscription info
│   ├── SubscriptionPage.jsx  # Plans + Razorpay payment
│   └── admin/                # Admin panel pages
│
├── components/
│   ├── MainLayout.jsx        # Header + nav + auth state (3 states: guest/skeleton/user)
│   ├── CrexLiveSection.jsx   # Live scorecard + ball-by-ball from Crex
│   ├── SessionPanel.jsx      # Session trading panel
│   ├── LoginModal.jsx        # Login popup
│   ├── TelegramGateModal.jsx # Telegram membership gate UI
│   ├── ToastProvider.jsx     # Global toast notifications
│   └── ...metrics components
│
└── utils/
    └── tossDatasetAdmin.js   # Admin toss dataset query builder
```

---

## Data Flow

### 1. Live Cricket Data Pipeline

```
Crex API / TennisLiveLoad
        │
        ▼
  scraper-crex / scraper-tll   (polling workers, every few seconds)
        │
        ▼
  normalizer/queue.js          (raw events queued)
        │
        ▼
  normalizer/normalizer.js     (raw → standard match format)
        │
        ▼
  dataCache.js                 (in-memory store)
        │
        ├──▶ api-broadcast     (Redis pub/sub if multi-instance)
        │         │
        └─────────▼
              socketService.js
                    │
                    ▼
           Socket.IO rooms      (match:{matchId}, cricket:matches)
                    │
                    ▼
           Frontend socket.js   (receives events)
                    │
                    ▼
           sessionStorage cache (_cx_b_{matchId}, _cx_matches)
                    │
                    ▼
           CricketPage / MatchDetail (React state update)
```

### 2. Login Flow

```
User submits form
      │
      ▼
LoginPage polls /api/health every 2s (Render cold start)
      │ serverReady = true
      ▼
api.js login() → POST /api/auth/login
      │
      ▼
auth.js route:
  1. prisma.user.findUnique()       ← only sync DB call
  2. bcrypt.compare()               ← CPU bound, ~100ms
  3. generateToken()                ← sync
  4. res.json({ token, user })      ← response sent immediately
      │
      ▼ (background, fire-and-forget)
  prisma.user.update(activeToken)
  syncUserTrialState()
  socketService.notifySessionReplaced()
      │
      ▼
Frontend: localStorage.setItem('auth_token', token)
      │
      ▼
MainLayout: getAuthStatus() → GET /api/auth/me
  (20s in-memory cache, served stale on DB error)
```

### 3. Auth State in Header (3 states)

```
No token in localStorage
      → Show "Login" button immediately

Token exists, authUser not loaded yet
      → Show avatar skeleton

Token + authUser loaded
      → Show profile dropdown (name, plan, logout)
```

### 4. Subscription / Access Control Flow

```
User requests protected data
      │
      ▼
middleware/auth.js → verifyToken
  → prisma.user.findUnique (45s in-memory cache)
      │
      ▼
lib/subscriptionAccess.js → hasProAccess()
  checks: subPlanSlug, subStatus, subExpiresAt, isTrial
      │
      ├── free mode (siteMode=free) → allow all
      ├── admin/superadmin → allow all
      ├── pro + active → allow
      └── free user → 403 SUBSCRIPTION_REQUIRED
```

### 5. Razorpay Payment Flow

```
User clicks "Subscribe"
      │
      ▼
POST /api/subscription/create-order
  → Razorpay order created
  → DB: UserSubscription record (status=pending)
      │
      ▼
Frontend: Razorpay checkout modal opens
      │
      ▼ (on payment success)
POST /api/subscription/verify-payment
  → Razorpay signature verified
  → DB: user.subPlanSlug=pro, subStatus=active
  → clearAuthCache()
      │
      ▼
Frontend: getAuthStatus() refresh → updated plan shown
```

---

## Database Schema (Key Models)

| Model | Purpose |
|---|---|
| `User` | Auth, subscription state (flat columns), Telegram link |
| `SubscriptionPlan` | Pro/Free plan definitions, pricing |
| `UserSubscription` | Payment history, per-user subscription records |
| `Match` | Captured match snapshots (Betfair market data) |
| `SiteSettings` | Key-value store — siteMode, siteName, signupMode, trialConfig |
| `PromoCode` | Discount coupons |
| `AdminAuditLog` | Admin action history |

---

## Key Configs & Limits

| Config | Value |
|---|---|
| Neon free tier max connections | 5 |
| pg.Pool max | 5 |
| connectionTimeoutMillis | 10000ms |
| JWT expiry | 3650 days (never expires) |
| Auth cache TTL | 45s |
| /auth/me cache TTL | 20s |
| DB keep-warm ping | every 4 minutes |
| Render cold start health poll | every 2s on LoginPage mount |
| sessionStorage match bundles cap | 30 |
| Rate limit (login) | 30 req / 15min per IP |
| Rate limit (OTP) | 10 req / 10min per IP |

---

## Deployment

| Service | Platform | URL |
|---|---|---|
| Frontend | Vercel (static) | cricedge.in |
| Backend | Render (free web service) | api.cricedge.in |
| Database | Neon PostgreSQL | ep-*-pooler.neon.tech |

**Render free tier caveat**: Server sleeps after 15min inactivity. `LoginPage` polls `/api/health` every 2s on mount to wake server before user submits login form.

**Prisma 7 config pattern**:
- `schema.prisma` — only `provider`, no `url`/`directUrl`
- `prisma.config.ts` — `datasource.url` + `datasource.directUrl` (CLI/migrations only)
- `db/prisma.js` — `PrismaPg` adapter with `pg.Pool` (runtime connection)
