# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

The app is **not** standalone — the frontend reads from a REST API, so opening `frontend/index.html` over `file://` fails on CORS. Bring up the whole stack instead:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Then open `http://localhost` (nginx, port 80). The API is on `http://localhost:3001`.

- `docker-compose.local.yml` — full local stack: mongo + redis + api + frontend
- `docker-compose.prod.yml` — api + frontend only; mongo and redis come from `api/.env.prod` (template: `api/.env.prod.example`)
- `docker-compose.yml` — same services as local, without the api environment block

To see a frontend change, rebuild that one service — it only copies static files into nginx, so it is fast:

```bash
docker compose -f docker-compose.local.yml up -d --build frontend
```

`frontend/support.js` is a generated dc-runtime bundle and must not be edited by hand. Its TypeScript source is **not** in this repository, so there is no build step here to regenerate it.

## Architecture

**Orbital** is an application health-monitoring dashboard. Applications appear as planets in a D3.js orbital visualization, colored green (`healthy`, `--up`), amber (`degraded`, `--warn`), red (`unhealthy`, `--down`) or grey (not yet checked). The frontend uses the API's status names and field names (`name`, `team`, `healthCheckUrl`, `swaggerUrl`) as is; the CSS color variables keep their short names. The UI is in Brazilian Portuguese.

```
frontend (nginx :80)  ──HTTP + SSE──▶  api (Express :3001)  ──▶  MongoDB
                                         └──▶ Redis (cache de apps e estado dos checks)
```

The browser never probes health check URLs itself, and has no timer. The **API schedules the checks** (`api/src/services/scheduler.service.js`): every `HEALTH_CHECK_INTERVAL_S` (default 30, min 5) it runs a cycle per environment, on a fixed grid `bootAt + offset + n·interval` with offsets production 0 s, staging 10 s, development 20 s, so the three never run together. A cycle fetches each `healthCheckUrl` server-side (`HEALTH_CHECK_TIMEOUT_MS` timeout, default 5000, at most `HEALTH_CHECK_CONCURRENCY` — default 10 — in flight via `mapLimit()`) and publishes each result over SSE as soon as that check ends. `status` is `healthy`, `degraded` (a 2xx slower than `DEGRADED_LATENCY_MS`, default 3000; these also carry `limitMs`) or `unhealthy` (non-2xx, network error or timeout — an error always wins over slowness). A cycle still running when the next slot arrives makes the slot be skipped with a warn. `POST /applications/:env/sync` forces a cycle: it answers **202** at once with `{ env, trigger, startedAt, nextCheckAt, joined }` (results come only through SSE), joins a cycle already running (`joined: true`, grid untouched), and otherwise drops just the next scheduled slot — the grid then goes back to its original phase. A newly created app is not checked at once; it enters the environment's next cycle. Each result is published before it is written to Redis (a slow Redis must not delay events or workers); `DELETE` calls `scheduler.forget()` so a check of that app already in flight is dropped. **Single API instance only**: scheduler and SSE fan-out are in-process, so several replicas would check twice.

### API (`api/`)

Express, no framework beyond it. Layout of `api/src/`:

```
config/        index.js (env vars, validated once), environments.js (env names + scheduler offsets, single source), database.js (Mongo connection)
controllers/   applications.controller.js, events.controller.js (SSE) — HTTP in/out only
middlewares/   cors, request-logger, error-handler, async-route, validate-env (*.middleware.js)
repositories/  applications.repository.js (Mongo + apps:<env> cache), status.repository.js (Redis status:/cycle:)
routes/        applications.routes.js — only maps method + path → middleware/controller
services/      scheduler.service.js, health-check.service.js, snapshot.service.js, events.service.js (SSE bus)
utils/         logger.js, cache.js (withCache/withRedis), map-limit.js
validators/    application.validator.js
app.js         mounts the middlewares and routes
server.js      validates the config, installs the process handlers, calls listen, starts the scheduler
```

Naming: file names are lowercase dot-notation with the layer as suffix (`events.service.js`); controllers, services, repositories and validators hold a PascalCase class (`EventsService`) and the module exports **one instance** (`module.exports = new EventsService()`), so callers use `eventsService.publish(...)` — never destructure methods off an instance (they use `this`). Middlewares, utils and config stay plain functions/objects. Controller handlers are passed to Express unbound. `applicationsRepository.create()`/`remove()` invalidate `apps:<env>` themselves, so controllers only validate, call and respond. Async handlers go through `asyncRoute(failMessage, logFields, handler)`, which logs the failure with the route's context and forwards it to the error handler. Endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/applications` | all apps, grouped by environment |
| GET | `/applications/events` | SSE stream for the three environments (`?changes=true` → only `status` events whose status changed) |
| POST | `/applications/:env/sync` | force a health check cycle (202); results come through the SSE stream |
| POST | `/applications/:env` | create an app |
| DELETE | `/applications/:env/:id` | remove an app |

There is **no update endpoint** — changing an existing app means editing Mongo directly.

Input validation lives in `api/src/validators/application.validator.js` (no dependency). `applicationValidator.validate(body)` returns `{ value, errors }`: every field must be a **string** (that is what keeps Mongo operators like `{ "$gt": "" }` out), is trimmed, and control characters are rejected. `name` is 2–60 chars of `[A-Za-z0-9._-]` starting with a letter or digit; `team` is 2–60 letters (accents ok), digits, spaces, `._-`; `healthCheckUrl` (required) and `swaggerUrl` (optional, `""` when absent) are ≤ 2048 chars, `http:`/`https:` only (no `javascript:`, since `swaggerUrl` becomes a link href) and without user/password — hosts are **not** restricted, internal services are the point. Unknown fields are dropped. A rejected create answers 400 `{ error: "Invalid application", fields: { field: message } }` and logs only the field names, never the values. `DELETE` checks `applicationValidator.isValidObjectId()` (24 hex chars) before touching Mongo. `app.js` caps JSON bodies at 10kb and ends with the error handler (`middlewares/error-handler.middleware.js`) that always answers JSON: malformed JSON → 400, too large → 413, other body-parser 4xx → same status, anything else → 500 `Internal error` (the internal message never reaches the client; an error already logged by `asyncRoute` carries `err.logged` and is not logged again). The frontend mirrors these rules in `validateAppForm()` (messages in pt-BR, shown per field) and maps a 400's `fields` onto the form; keep both sides in sync.

`GET /applications/events` sends `text/event-stream` (headers `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; `retry: 3000`, a `: ping` comment every 15 s). On connect, one `snapshot` event per environment (application list from `applicationsRepository.list()` crossed with the stored status — `status: null` for never-checked apps — plus the last `cycle` and `nextCheckAt`); afterwards a `status` event per checked app (`id, name, env, status, latencyMs, limitMs` only when degraded, `checkedAt`) and one `cycle` event at the end of each cycle (`env, trigger, checked, changed, healthy, degraded, unhealthy, startedAt, checkedAt, durationMs, nextCheckAt`). `?changes=true` filters only the `status` events; any value other than `true`/`false` is a 400. There is no `Last-Event-ID` replay — a reconnect gets a fresh snapshot. The route subscribes (held) before it builds the three snapshots in parallel (`snapshotService.build()`/`empty()` in `api/src/services/snapshot.service.js`), then releases the queue right after them, so nothing published meanwhile is lost. `api/src/services/events.service.js` is the in-memory subscriber bus (`subscribe()` returns `{ release, unsubscribe }`); `server.js` calls `eventsService.closeAll()` on shutdown, or `server.close()` would wait for the streams forever. `app.js` does not start the scheduler (route tests load it without timers); `server.js` does.

Redis holds: the application list of each environment under `apps:<env>` for `APPS_CACHE_TTL` seconds (default 7200 = 2h, `0` disables), the source for `GET /applications`, the scheduler and the SSE snapshot (`applicationsRepository.list()` in `api/src/repositories/applications.repository.js`); and, with **no TTL**, the state kept by `api/src/repositories/status.repository.js`: hash `status:<env>` (`id → { status, latencyMs, limitMs?, checkedAt }`) and string `cycle:<env>` (the last `cycle` event). Create invalidates `apps:<env>`; delete also removes the app from `status:<env>`; an edit made straight in Mongo only shows after `APPS_CACHE_TTL` — or delete the Redis key (`orbital:apps:<env>`) by hand. Change detection compares only `status` against the stored one; with no stored status it counts as a change. `api/src/utils/cache.js` degrades gracefully: if Redis is unreachable `withCache` just runs uncached, and `withRedis()` (used by the status store) returns its fallback — the checks keep running, every result counts as a change and the snapshot comes out without statuses. CORS (`middlewares/cors.middleware.js`) reflects any origin.

Logging goes through `api/src/utils/logger.js` (no dependency): `log.info/warn/error(msg, fields)` writes one JSON line per event (`info` → stdout, `warn`/`error` → stderr), `Error` fields are serialized with `cause` (and `stack` at `error`), and `LOG_LEVEL` (`info` default, `warn`, `error`) filters. Never use `console.*`. Inside a route use `req.log`, a child carrying the request's `reqId`; every request also gets one `request completed` line (4xx → warn, 5xx → error), logged on the response's `close` event (not `finish`, which never fires for an SSE stream the client drops; there `durationMs` is the connection time). Level rule: `info` for flow (boot, connections, the `sync completed` summary of every cycle with its `trigger`, create/delete), `warn` for things that need attention but aren't API failures (invalid client input, unhealthy/degraded monitored apps, Redis down or cache op failed), `error` for API failures (500s, Mongo connection, uncaught). Redis errors log only on the up→down transition. Scheduler problems: `warn` `scheduled sync skipped: previous cycle still running`, `error` `sync failed` (e.g. Mongo down with `apps:<env>` expired — no `cycle` is published) and `events snapshot failed` (that environment's snapshot goes out empty). Redact connection URLs with `log.redactUrl()`.

#### Tests

Unit tests use **Jest + Supertest** and live in `api/test/*.test.js` (outside `src/`, so the Docker image doesn't ship them). No Mongo, Redis or network is needed: `mongodb`, `ioredis`, `fetch` and the logger are mocked.

```bash
cd api && npm test
cd api && npm run test:coverage
```

- Every `describe`/`it` description is in Brazilian Portuguese and states the behavior under test.
- `config`, `logger`, `cache`, `database` and the scheduler service keep state at module level (or in their exported instance); load them with `loadFresh(env, loader)` from `test/helpers.js`, which runs `loader` in a fresh module registry with exactly `env` set. Require mocked modules inside `loader` to get the instances the code sees.
- Mock `dotenv` (`jest.mock("dotenv", () => ({ config: jest.fn() }))`) in any test that loads `config`, so `api/.env` doesn't leak in.
- Test files are named after the module they cover (`scheduler.service.test.js`, `application.validator.test.js`…). Route tests (`applications.routes.test.js`) go through `src/app.js` with Supertest, mocking `config/database`, `utils/cache`, `repositories/status.repository` and `services/scheduler.service`. A mock factory must not spread `jest.requireActual()` of a class instance — spreading does not copy prototype methods. The scheduler tests use Jest fake timers (they control `Date.now()` and `setTimeout` together) with applications repository, status repository, events service and health-check service doubles. The SSE tests (`events.controller.test.js`) use a real `http` server and `fetch`, since Supertest does not read streams well; only the route's 15 s heartbeat `setInterval` is spied on, because faking all timers would also freeze the fetch client.

### Environments

The UI uses three short codes that map onto API/Mongo names. The single source is the `ENVS` table in `script.js` (`{ code, api, label }`); `ENV_CODES`, the `ENV_TO_API` / `API_TO_ENV` lookups and `envLabel()` are derived from it, so a new environment is one entry there:

| UI | API path & Mongo collection |
|---|---|
| `dev` | `development` → `applications_development` |
| `hml` | `staging` → `applications_staging` |
| `prd` | `production` → `applications_production` |

The frontend has **no health-check timer**: `connectEvents()` opens one `EventSource` on `/api/applications/events?changes=true` (after the snapshots only status changes arrive; `cycle` always does — the UI only needs the `status` field) and the three environments' results arrive on their own, 10 s apart. The toolbar shows a clock icon with the displayed environment's `hh:mm:ss` (the label "Última verificação" is only in its tooltip) — the `checkedAt` of its last cycle (`cycleLabel()`, from `state.cycles`, `{ [envCode]: ms | null }`, updated only by events); the next scheduled check is not shown, although the API still sends `nextCheckAt`. "Sincronizar" calls `POST …/sync` and stays "Sincronizando…" until that environment's `cycle` event arrives (or `SCAN_MAX_MS`, 30 s). A reload never triggers a check: it just receives the snapshots.

### Seed data

`mongo-seed.js` seeds 10 sample applications across the three collections. It runs only on first boot of an empty `mongo_data` volume (it is mounted into `docker-entrypoint-initdb.d`, and `MONGO_INITDB_DATABASE=orbital` makes the entrypoint run it against `orbital`), so re-seeding means dropping that volume.

### Frontend (`frontend/index.html` + `frontend/script.js`)

The project uses the **dc-runtime** system — a lightweight React-based template engine bundled into `support.js`. The markup lives in `index.html` inside an `<x-dc>` element; the logic lives in `script.js`. The runtime only reads the **text** of the `<script data-dc-script>` tag and evaluates it with `new Function("DCLogic", …)` (it ignores `src`), so `script.js` is a plain script loaded right after `support.js` — before the runtime boots — that defines the module-level constants/helpers and a factory `createComponent(DCLogic)` returning the class; the `data-dc-script` tag holds only `const Component = createComponent(DCLogic);`. `script.js` is served `no-cache` like `index.html`, and the frontend `Dockerfile` copies it explicitly.

#### dc-runtime template conventions

- `{{ expression }}` — interpolates a value from `renderVals()` into the template
- `<sc-if value="{{ condition }}">` — conditional rendering; there is no else branch, use two `sc-if`s
- `<sc-for list="{{ list }}" as="item">` — list rendering; items can carry their own handlers and styles (`onClick="{{ item.onClick }}" style="{{ item.style }}"`), which is how the env tabs, filter chips and status counters are built
- `ref="{{ refName }}"` — the bound value is a callback that receives the DOM element (`rootRef: el => { this.rootEl = el; }`)
- Events bind **camelCase**: `onClick`, `onChange`, `onSubmit`, `onFocus`, `onBlur`, `onMouseDown`. Arguments cannot be passed in markup — bind per item in JS instead.
- `style-hover="..."` / `style-focus="..."` — pseudo-state inline styles
- `<helmet>` — injects content into `<head>`
- `<script type="text/x-dc" data-dc-script>` — must define `Component` extending `DCLogic`; here it just calls `createComponent(DCLogic)` from `script.js`

State lives in `this.state = {}` and updates via `this.setState(nextState, callback?)`. Everything the template can reach is returned from a single flat object in `renderVals()`, which spreads smaller per-region methods (`skyVals()`, `toolbarVals()`, `headerVals()`, `listVals()` with `cardVals()` per card, `removeVals()`, `formVals()`, `teamVals()`); the form fields are exposed as `fields.<name>.{err, has, style, invalid}` (the template resolves dotted paths anywhere). Status colors and labels have a single source, the `STATUS_META` table in `script.js` (`STATUSES`, `FILTERS`, `statusColor()` and `statusText()` derive from it), like `ENVS` for environments; style factories that don't need `this` (`envTab`, `chip`, `swTrack`, …) live at module level. Lifecycle hooks: `componentDidMount`, `componentDidUpdate`, `componentWillUnmount`.

### Data persistence

MongoDB is the source of truth. `localStorage` holds a local cache plus user preferences:

- `orbital-apps-v1` — cache of the last `GET /applications`, as `{ id, env, name, team, healthCheckUrl, swaggerUrl }` (`env` is the short code). Entries in the old `{ nome, time, health, swagger }` shape are converted on read by `migrateApp()` and rewritten in the new shape on the next save. Every change to the app list (load, create, delete) goes through `commitApps()`, which also drops orphan statuses and saves both keys. The list is reloaded (`loadApps()`) on mount, when the storm ends, and whenever a `snapshot`, `status` or `cycle` event shows IDs or a count that doesn't match the environment's list
- `orbital-status-v1` — `{ status: { [appId]: 'healthy' | 'degraded' | 'unhealthy' }, ts }`, `ts` being the `checkedAt` of the last `cycle` (ms) — but it only advances once no environment is still showing statuses from load, so it always dates the oldest status in the map. The old bare-map format is still read, as `ts = 0`, and the old values `up`/`down` are mapped to `healthy`/`unhealthy` on read by `migrateStatus()` (unknown values are dropped). If `ts` is older than `STATUS_STALE_MS` (5 min) on load, statuses show as "último conhecido" with the storm's `--stale` look, per environment (`staleEnvs`), until that environment's first `snapshot` (with a cycle) or `cycle` event. IDs not in the app list are dropped. The degraded badge's tooltip is a fixed text ("Tempo de resposta acima do limite"); latency is not kept on the client
- `orbital-theme-v1` — `'dark'` | `'light'`
- `orbital-counters-v1` and `orbital-rate-v1` no longer exist: the browser has no timer or interval picker, and `componentDidMount` removes both keys left by older versions
- `orbital-notify-v1` / `orbital-sound-v1` — `'1'` | `'0'`, down-alert toggles
- `orbital-lastok-v1` — the `checkedAt` (ms) of the last `cycle` event, shown while the API is unreachable
- `orbital-comet-v1` — timestamps (ms) of the comets shown in the last hour

Every read and write is wrapped in an inline `try { … } catch (e) {}` — follow that pattern.

### Down alerts

When an application transitions to `unhealthy`, the app fires a browser notification (`{name} saiu de órbita`, with team and environment in the body) and a WebAudio beep — both **only** when the tab is out of focus (`document.hidden || !document.hasFocus()`). A counter stays in the page title while any application is `unhealthy`. `degraded` never alerts and is not counted in the title. `this.downSeen` dedupes, so a single fall notifies once, and falls arriving within `ALERT_BATCH_MS` (400ms) are buffered to produce one beep. Since the server's cycles of the three environments are 10 s apart, falls in different environments normally beep separately. Falls that happened while the stream was down arrive in the reconnect's `snapshot` and alert through the same `downSeen` logic.

### API unreachable — "tempestade"

Every API read goes through `apiFetch()` (10s timeout, throws on `!r.ok`). When the initial `GET /applications` or a `POST …/sync` fails, or the SSE stream stays disconnected for more than `SSE_DOWN_GRACE_MS` (5 s; the `EventSource` reconnects by itself, and when it gives up — e.g. a 502 from nginx — `connectEvents()` is retried every `SSE_RETRY_MS`), `markApiDown()` sets `apiDown`: a storm covers the sky (`drawStorm()` — rain and lightning in both themes; dark clouds only in light, toggled by `--storm-clouds-opacity`), the orbit core turns into a storm cloud, planets and card badges go `--stale` grey (`ÚLTIMO: …`), and a banner shows the time of the last successful check. Status values are kept as last known, never cleared. The next event received from the server (the reconnect's `snapshot`) clears it, with no page reload. Losing the API also notifies/beeps once when the tab is out of focus.

### Comets

A single comet crosses the sky as a rare, random event — dark theme only, independent of `apiDown`. `scheduleComet()` waits 20–60 min between attempts; `launchComet()` enforces a hard cap of `COMET_MAX` (2) per rolling hour using the timestamps in `orbital-comet-v1`, so reloading the page does not reset it. Attempts while the theme is light, the tab is away or reduced motion is on are skipped without consuming the quota. The layer's visibility is `--comet-opacity` (`1` dark / `0` light).

### Design system — Nocturne (`frontend/_ds/nocturne-*/`)

- `styles.css` is the only stylesheet; always link it and use its CSS variables — never hard-code hex values, font names, or raw px values the tokens already carry.
- `_ds_manifest.json` and `readme.md` document available components and tokens.
- Color tokens follow OKLCH tonal ramps (`--color-neutral-100`…`900`, `--color-accent-*`).
- **This page uses no CSS classes at all** — there is not a single `class=` attribute in `index.html`. Styling is 100% inline `style` attributes reading custom properties. The design system supplies tokens only; the `.btn` / `.card` / `.dialog` component classes are not used here. Match that, rather than introducing classes.
- App-level aliases (`--ink`, `--muted`, `--line`, `--surface`, `--dialog`, `--accent`, `--up`, `--down`, `--mono`, …) are defined in the `THEMES` object in `script.js` and applied imperatively by `applyTheme()`. **A new variable must be added to both the `dark` and `light` maps.**
- Icons: Phosphor (https://phosphoricons.com), pasted inline as `<svg viewBox="0 0 256 256" fill="currentColor">`. Copy real path data; do not hand-write it.
- Fonts: Inter (body/headings) + JetBrains Mono (monospaced labels), always through `font-family:var(--mono)`. The repeated mono label styles are the `MONO_CONTROL`, `MONO_SMALL`, `MONO_STAT` and `MONO_EYEBROW` constants, used in the template as `style="{{ monoEyebrow }} color:…"`.

### External dependencies (CDN)

- `d3-selection@3` + `d3-timer@3` (only these two modules, with SRI) — orbital visualization (`drawStars`, `drawClouds`, `drawStorm`, `drawOrbits` methods); if they do not load within `D3_TIMEOUT` the orbit shows a warning instead
- Google Fonts — Inter + JetBrains Mono
