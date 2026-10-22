# CLAUDE.md — API

Backend-specific guidance. The architecture, the HTTP/SSE contract with the frontend and the environments are in the root `CLAUDE.md`; this file covers how the API is built.

Express, no framework beyond it. Run the tests with `npm test` from this folder; run the API itself through the root docker compose (it needs Mongo and Redis). The image (`Dockerfile`, `node:24-alpine`, `NODE_ENV=production`, prod deps only) runs as the unprivileged `node` user (uid 1000; the code stays root-owned and read-only) and has a `HEALTHCHECK` that calls `GET /health` (busybox `wget`).

`GET /health` answers `200 { "status": "UP" }` (`Cache-Control: no-store`) whenever the process is up. It is liveness only: it doesn't touch Mongo or Redis on purpose — with a single instance, failing it on a dependency outage would restart or deregister the only pod. It is mounted before the request logger, so probes don't log. On EKS it is the path for the liveness/readiness probes.

## Layout of `src/`

```
config/        index.js (env vars, validated once), environments.js (env names + scheduler offsets, single source), database.js (Mongo connection)
controllers/   applications.controller.js, events.controller.js (SSE), health.controller.js — HTTP in/out only
middlewares/   cors, request-logger, error-handler, async-route, validate-env (*.middleware.js)
repositories/  applications.repository.js (Mongo + apps:<env> cache), status.repository.js (Redis status:/cycle:)
routes/        applications.routes.js, health.routes.js — only map method + path → middleware/controller
services/      scheduler.service.js, health-check.service.js, snapshot.service.js, events.service.js (SSE bus)
utils/         logger.js, cache.js (withCache/withRedis), map-limit.js
validators/    application.validator.js
app.js         mounts the middlewares and routes
server.js      validates the config, installs the process handlers, calls listen, starts the scheduler
```

## Conventions

Naming: file names are lowercase dot-notation with the layer as suffix (`events.service.js`); controllers, services, repositories and validators hold a PascalCase class (`EventsService`) and the module exports **one instance** (`module.exports = new EventsService()`), so callers use `eventsService.publish(...)` — never destructure methods off an instance (they use `this`). Middlewares, utils and config stay plain functions/objects. Controller handlers are passed to Express unbound. `applicationsRepository.create()`/`remove()` invalidate `apps:<env>` themselves, so controllers only validate, call and respond. Async handlers go through `asyncRoute(failMessage, logFields, handler)`, which logs the failure with the route's context and forwards it to the error handler.

`PUT` validates the body with the same rules as create (400 `{ error, fields }`), answers 200 with the updated app or 404, and invalidates `apps:<env>`. When `healthCheckUrl` changes it calls `scheduler.forget()` and removes the app from `status:<env>`, so the app goes back to "not checked yet" until the next cycle. `DELETE` calls `scheduler.forget()` too, so a check of that app already in flight is dropped.

## Scheduler

`services/scheduler.service.js`: every `HEALTH_CHECK_INTERVAL_S` (default 30, min 5) it runs a cycle per environment, on a fixed grid `bootAt + offset + n·interval` (offsets in `config/environments.js`). A cycle fetches each `healthCheckUrl` server-side (`HEALTH_CHECK_TIMEOUT_MS` timeout, default 5000, at most `HEALTH_CHECK_CONCURRENCY` — default 10 — in flight via `mapLimit()`) and publishes each result over SSE as soon as that check ends. A 2xx slower than `DEGRADED_LATENCY_MS` (default 3000) is `degraded`. A cycle still running when the next slot arrives makes the slot be skipped with a warn. A forced sync joins a cycle already running (grid untouched) or otherwise drops just the next scheduled slot — the grid then goes back to its original phase. A newly created app is not checked at once; it enters the environment's next cycle. Each result is published before it is written to Redis (a slow Redis must not delay events or workers).

## Validation and errors

Input validation lives in `src/validators/application.validator.js` (no dependency). `applicationValidator.validate(body)` returns `{ value, errors }`: every field must be a **string** (that is what keeps Mongo operators like `{ "$gt": "" }` out), is trimmed, and control characters are rejected. `name` is 2–60 chars of `[A-Za-z0-9._-]` starting with a letter or digit; `team` is 2–60 letters (accents ok), digits, spaces, `._-`; `orbits` (required) is an array of 1–10 strings, each one with the `team` rules but 2–40 chars, deduplicated by `orbitKey()` keeping the first spelling (`LIMITS.orbitsMax/orbitMin/orbitMax`); `healthCheckUrl` (required) and `swaggerUrl` (optional, `""` when absent) are ≤ 2048 chars, `http:`/`https:` only (no `javascript:`, since `swaggerUrl` becomes a link href) and without user/password — hosts are **not** restricted, internal services are the point. Unknown fields are dropped. A rejected create or update answers 400 `{ error: "Invalid application", fields: { field: message } }` and logs only the field names, never the values. `PUT` and `DELETE` check `applicationValidator.isValidObjectId()` (24 hex chars) before touching Mongo. Any change to these rules must be mirrored in the frontend's `validateAppForm()`.

`app.js` caps JSON bodies at 10kb and ends with the error handler (`middlewares/error-handler.middleware.js`) that always answers JSON: malformed JSON → 400, too large → 413, other body-parser 4xx → same status, anything else → 500 `Internal error` (the internal message never reaches the client; an error already logged by `asyncRoute` carries `err.logged` and is not logged again).

## SSE implementation

`GET /applications/events` sends `text/event-stream` (headers `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; `retry: 3000`, a `: ping` comment every 15 s). The snapshot of each environment is built from `applicationsRepository.list()` crossed with the stored status. `?changes=true` filters only the `status` events; any value other than `true`/`false` is a 400. The route subscribes (held) before it builds the three snapshots in parallel (`snapshotService.build()`/`empty()` in `src/services/snapshot.service.js`), then releases the queue right after them, so nothing published meanwhile is lost. `src/services/events.service.js` is the in-memory subscriber bus (`subscribe()` returns `{ release, unsubscribe }`); `server.js` calls `eventsService.closeAll()` on shutdown, or `server.close()` would wait for the streams forever. `app.js` does not start the scheduler (route tests load it without timers); `server.js` does.

## Redis

Redis holds: the application list of each environment under `apps:<env>` for `APPS_CACHE_TTL` seconds (default 7200 = 2h, `0` disables), the source for `GET /applications`, the scheduler and the SSE snapshot (`applicationsRepository.list()` in `src/repositories/applications.repository.js`); and, with **no TTL**, the state kept by `src/repositories/status.repository.js`: hash `status:<env>` (`id → { status, latencyMs, limitMs?, checkedAt }`) and string `cycle:<env>` (the last `cycle` event). Create and update invalidate `apps:<env>`; update with a new `healthCheckUrl` and delete also remove the app from `status:<env>`; an edit made straight in Mongo only shows after `APPS_CACHE_TTL` — or delete the Redis key (`orbital:apps:<env>`) by hand. Change detection compares only `status` against the stored one; with no stored status it counts as a change. `src/utils/cache.js` degrades gracefully: if Redis is unreachable `withCache` just runs uncached, and `withRedis()` (used by the status store) returns its fallback — the checks keep running, every result counts as a change and the snapshot comes out without statuses. CORS (`middlewares/cors.middleware.js`) is set by `CORS_ORIGINS` (comma-separated). Unset/empty (the default) allows **no** origin — the browser reaches the API same-origin through nginx or Vite's proxy, so no `Access-Control-Allow-*` header is ever sent; with a list, only those origins are reflected; `*` reflects any origin but only when set explicitly (discouraged). `Vary: Origin` and `X-Content-Type-Options: nosniff` always go out, and preflights (`OPTIONS`) are answered 204 here either way.

## Logging

Logging goes through `src/utils/logger.js` (no dependency): `log.info/warn/error(msg, fields)` writes one JSON line per event (`info` → stdout, `warn`/`error` → stderr), `Error` fields are serialized with `cause` (and `stack` at `error`), and `LOG_LEVEL` (`info` default, `warn`, `error`) filters. Never use `console.*`. Inside a route use `req.log`, a child carrying the request's `reqId`; every request also gets one `request completed` line (4xx → warn, 5xx → error), logged on the response's `close` event (not `finish`, which never fires for an SSE stream the client drops; there `durationMs` is the connection time).

Level rule: `info` for flow (boot, connections, the `sync completed` summary of every cycle with its `trigger`, create/delete), `warn` for things that need attention but aren't API failures (invalid client input, unhealthy/degraded monitored apps, Redis down or cache op failed), `error` for API failures (500s, Mongo connection, uncaught). Redis errors log only on the up→down transition. Scheduler problems: `warn` `scheduled sync skipped: previous cycle still running`, `error` `sync failed` (e.g. Mongo down with `apps:<env>` expired — no `cycle` is published) and `events snapshot failed` (that environment's snapshot goes out empty). Redact connection URLs with `log.redactUrl()`.

## Tests

Unit tests use **Jest + Supertest** and live in `test/`, mirroring the folders of `src/` (`src/services/scheduler.service.js` → `test/services/scheduler.service.test.js`; `src/config/index.js` → `test/config/index.test.js`), outside `src/` so the Docker image doesn't ship them. No Mongo, Redis or network is needed: `mongodb`, `ioredis`, `fetch` and the logger are mocked.

```bash
npm test
npm run test:coverage
```

- Every `describe`/`it` description is in Brazilian Portuguese and states the behavior under test.
- `config`, `logger`, `cache`, `database` and the scheduler service keep state at module level (or in their exported instance); load them with `loadFresh(env, loader)` from `test/helpers.js`, which runs `loader` in a fresh module registry with exactly `env` set. Require mocked modules inside `loader` to get the instances the code sees.
- Mock `dotenv` (`jest.mock("dotenv", () => ({ config: jest.fn() }))`) in any test that loads `config`, so `.env` doesn't leak in.
- Test files are named after the module they cover (`scheduler.service.test.js`, `application.validator.test.js`…). Route tests (`routes/applications.routes.test.js`) go through `src/app.js` with Supertest, mocking `config/database`, `utils/cache`, `repositories/status.repository` and `services/scheduler.service`. A mock factory must not spread `jest.requireActual()` of a class instance — spreading does not copy prototype methods.
- The scheduler tests use Jest fake timers (they control `Date.now()` and `setTimeout` together) with applications repository, status repository, events service and health-check service doubles.
- The SSE tests (`controllers/events.controller.test.js`) use a real `http` server and `fetch`, since Supertest does not read streams well; only the route's 15 s heartbeat `setInterval` is spied on, because faking all timers would also freeze the fetch client.
