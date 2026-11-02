# CricEdge performance changes

The changes are local and need deployment. No hosting region, production replica count, Redis service, production database schema, or telemetry account was changed.

## Frontend

- Accessible card skeletons replace initial list/route spinners. Motion stops when reduced motion is requested.
- The build emits a public navigation/loading shell in HTML, so a cold connection paints before React loads. Live markets and private account pages still render on the client; this is not full data SSR.
- Pages remain code-split. Login, Telegram verification, session detail, and charts now load independently. Recharts loads only after Chart/History is selected. MatchDetail's built JS fell from about 506 KB to 119 KB (before gzip); the deferred chart chunk is about 389 KB.
- Concurrent identical GETs share one request. The key includes authentication and Telegram headers. Results are not held in a stale response cache. Writes are not retried automatically.
- Cricket/toss searches, league filters, and admin user/subscription/toss searches debounce for 250 ms. Admin lists ignore older responses after a newer query starts.
- Initial HTTP recovery starts after 200 ms, rather than waiting six seconds for a socket feed. Pending HTTP results are discarded when the socket has already supplied fresher data.
- Price ladders render a maximum of 19 rows plus spacer rows, preserving their scroll height. Other live card lists currently contain a few dozen fixtures and remain fully searchable.
- Brand images use AVIF with WebP fallback and fixed dimensions. External team flags use native lazy loading, fixed dimensions, and async decoding; their upstream image format is not changed.
- System fonts avoid remote font requests entirely. Payment checkout code loads on demand with a 10-second deadline. Account logout updates immediately and sends one authenticated request.

## API and database

- Existing HTTP gzip and socket compression are retained. Hashed build assets cache for one year; HTML revalidates. Vercel/Render static-site configurations include CDN cache rules. An optional `VITE_ASSET_BASE=https://your-asset-host/` can point Vite-generated assets at another CDN. The asset host must contain the same build.
- Match-list HTTP endpoints accept optional `page`, `limit` (maximum 100), and `search`. Omit pagination for compatibility with full socket feeds. Example: `/api/cricket/matches?page=1&limit=25&search=india`. Admin lists already paginate and now reject invalid/negative page sizes. The user-detail history is bounded to 100 entries.
- Viewer-filtered match lists use private caching. Account/admin responses must never be cached publicly.
- Public plan data uses a 15-second Redis/memory cache and coalesces cache misses. Plan edits invalidate it. Live ingestion already uses Redis. Cache-specific connections fail open quickly instead of inheriting BullMQ's unlimited retries.
- Concurrent authentication checks for the same token coalesce into one DB query. User/admin list relations and purchase counts already use Prisma selections and a grouped query, rather than one query per displayed user.
- Cold API replicas fetch match bundles with Redis MGET batches instead of one round trip per card. Independent bundle and full-data reads run in parallel.
- The existing MariaDB pool remains shared. `DB_POOL_SIZE` defaults to 4, capped at 50 per process. Corrected MariaDB `idleTimeout` to 300 seconds. Choose the combined pool size across every replica below the database's connection cap.
- The committed migration `20261102090000_query_indexes` adds indexes for user creation/expiry, subscription history/purchase lookup, and audit action/time queries. Prisma schema validation passes. Apply it through the deployment migration workflow; it has not been applied to the remote DB.
- Existing CREX/TLL/Telegram HTTP deadlines remain. SMTP connection/greeting/socket deadlines are now bounded as well.
- Manual admin captures enqueue jobs and return HTTP 202. The UI polls authenticated job status. Redis uses BullMQ with one capture at a time; local development uses a bounded in-process queue. Jobs retain results for 15 minutes. A restarted local process loses in-memory jobs.

## Deploying multiple instances

Use the same `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `SESSION_SECRET`, and allowed origins on every API instance. Redis enables shared HTTP sessions and the Socket.IO adapter. Each API reads worker cache updates and emits locally, preventing duplicate cross-node feed deliveries. Ingestion gathers viewer demand across instances.

Keep exactly one ingestion/API instance with `INGESTION_ENABLED=true` (the default). On extra API instances set `INGESTION_ENABLED=false` so they do not start scraper/capture/Telegram pollers. Redis is required for this topology. The default single-process setup remains supported.

For separate manual-capture processing set `ADMIN_JOB_WORKER_ENABLED=false` on APIs and run `node scripts/admin-job-worker.js` as a worker with Redis and DB configuration. Otherwise captures process in the API process through the background queue.

`deploy/nginx.conf` is a reviewable two-instance load-balancer example with WebSocket support and session affinity. Adapt its addresses and existing TLS ingress before using it. This configuration has not been deployed. Managed hosts can provide equivalent load balancing. Polling transport needs sticky sessions; the Redis adapter alone is insufficient.

Choose the API, worker, Redis, and database regions together. The repository does not establish the database host's physical region; verify it with the database provider before moving services. Neither region nor capacity was guessed or changed.

## Monitoring

Set `OTEL_EXPORTER_OTLP_ENDPOINT` and optional `OTEL_EXPORTER_OTLP_HEADERS` for your OpenTelemetry collector. `OTEL_SERVICE_NAME` defaults to `cricedge-api`. HTTP/Express/Redis instrumentation and Prisma operation spans start before the app modules. DB spans record operation/model only, without SQL arguments. Telegram Bot API requests are excluded. Tracing stays off without a collector endpoint. Use `OTEL_TRACES_SAMPLER=parentbased_traceidratio` and `OTEL_TRACES_SAMPLER_ARG=0.1` for production sampling. Only traces are configured; metrics/log exporters are not enabled by this change.

Requests expose `Server-Timing` and `X-Request-ID`. Requests over one second emit structured `slow_request` logs. Web Vitals records LCP, INP, CLS, FCP and TTFB to the first-party `/api/performance` endpoint, emitting structured `web_vital` logs for your log monitoring tool. Default browser sampling is 20%; set `VITE_RUM_SAMPLE_RATE=0` to disable or `1` for testing. Do Not Track is respected. Metrics omit identity, search text and URL queries. No third-party RUM account was provisioned.

Predictions currently use local rules, not an external token-generating AI endpoint. There is no AI response stream to change; simulated token streaming was not added.

## Verification and remaining production checks

Frontend build and pre-render pass. All 186 frontend utility/request/windowing tests and 55 focused backend tests pass. Focused server checks cover queues, cache outage behavior, sessions, pagination, socket delivery, replica hydration, compression, and existing period/capture behavior. The broad legacy backend suite also contains failing historical prediction/100%-accuracy assertions; those algorithms were not changed by this performance work.

Browser verification covers search, on-demand chart rendering and a 390 px phone viewport, with no horizontal page overflow. Actual slow-phone CPU/Slow 4G and multi-host Redis/load-balancer tests still need a production-like environment. In Chrome DevTools, use a cold cache, Slow 4G and 4–6× CPU slowdown, then test cricket/toss first paint, search, match navigation and the first chart load. Check that duplicate GETs coalesce, Chart code is absent until selected, and long ladders remain responsive. Repeat on a physical budget Android phone. Target p75 LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1 using the collected Web Vitals rather than treating a local build-size reduction as a measured user-speed improvement.

Primary references: [Vercel cache headers](https://vercel.com/docs/caching/cache-control-headers), [Render static headers](https://render.com/docs/static-site-headers), [Socket.IO multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/), [OpenTelemetry Node.js](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/).
