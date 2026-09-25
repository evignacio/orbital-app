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
frontend (nginx :80)  ──HTTP──▶  api (Express :3001)  ──▶  MongoDB
                                         └──▶ Redis (cache de /sync)
```

The browser never probes health check URLs itself. It calls `POST /applications/:env/sync`, and the API fetches each `healthCheckUrl` server-side (`HEALTH_CHECK_TIMEOUT_MS` timeout, default 5000, at most `HEALTH_CHECK_CONCURRENCY` — default 10 — in flight via `mapLimit()`) and returns `{ id, name, status, latencyMs }` per app. `status` is `healthy`, `degraded` (a 2xx slower than `DEGRADED_LATENCY_MS`, default 3000; these also carry `limitMs`) or `unhealthy` (non-2xx, network error or timeout — an error always wins over slowness).

### API (`api/`)

Express, no framework beyond it. `api/src/app.js` builds the Express app (CORS, per-request logging, JSON body, routes) and `api/src/index.js` only validates the config, installs the process handlers and calls `listen`. `checkHealth()` and `mapLimit()` live in `api/src/health.js`. Routes live in `api/src/routes/applications.js`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/applications` | all apps, grouped by environment |
| POST | `/applications/:env/sync` | run health checks, return statuses |
| POST | `/applications/:env` | create an app |
| DELETE | `/applications/:env/:id` | remove an app |

There is **no update endpoint** — changing an existing app means editing Mongo directly.

`/sync` results are cached in Redis for `SYNC_CACHE_TTL` seconds (13 in local compose). Each environment's application list is cached too, under `apps:<env>` for `APPS_CACHE_TTL` seconds (default 7200 = 2h, `0` disables), and is the source for both `GET /applications` and the health check URLs `/sync` checks (`listApps()`). Create and delete invalidate `apps:<env>` and `sync:<env>` of that environment (`invalidateEnv()`); an edit made straight in Mongo only shows after `APPS_CACHE_TTL` — or delete the Redis key (`orbital:apps:<env>`) by hand. `api/src/cache.js` degrades gracefully: if Redis is unreachable the check just runs uncached. CORS in `api/src/app.js` reflects any origin.

Logging goes through `api/src/logger.js` (no dependency): `log.info/warn/error(msg, fields)` writes one JSON line per event (`info` → stdout, `warn`/`error` → stderr), `Error` fields are serialized with `cause` (and `stack` at `error`), and `LOG_LEVEL` (`info` default, `warn`, `error`) filters. Never use `console.*`. Inside a route use `req.log`, a child carrying the request's `reqId`; every request also gets one `request completed` line (4xx → warn, 5xx → error). Level rule: `info` for flow (boot, connections, sync summary, create/delete), `warn` for things that need attention but aren't API failures (invalid client input, unhealthy/degraded monitored apps, Redis down or cache op failed), `error` for API failures (500s, Mongo connection, uncaught). Redis errors log only on the up→down transition, and the sync summary only when checks actually run (cache miss or `?fresh=1`). Redact connection URLs with `log.redactUrl()`.

#### Tests

Unit tests use **Jest + Supertest** and live in `api/test/*.test.js` (outside `src/`, so the Docker image doesn't ship them). No Mongo, Redis or network is needed: `mongodb`, `ioredis`, `fetch` and the logger are mocked.

```bash
cd api && npm test
cd api && npm run test:coverage
```

- Every `describe`/`it` description is in Brazilian Portuguese and states the behavior under test.
- `config`, `logger`, `cache` and `db` keep state at module level; load them with `loadFresh(env, loader)` from `test/helpers.js`, which runs `loader` in a fresh module registry with exactly `env` set. Require mocked modules inside `loader` to get the instances the code sees.
- Mock `dotenv` (`jest.mock("dotenv", () => ({ config: jest.fn() }))`) in any test that loads `config`, so `api/.env` doesn't leak in.
- Route tests go through `src/app.js` with Supertest, mocking `src/db`, `src/cache` and `checkHealth`.

### Environments

The UI uses three short codes that map onto API/Mongo names. The single source is the `ENVS` table in `index.html` (`{ code, api, label, startDelay }`); `ENV_CODES`, the `ENV_TO_API` / `API_TO_ENV` / `ENV_START_DELAY` lookups and `envLabel()` are derived from it, so a new environment is one entry there:

| UI | API path & Mongo collection |
|---|---|
| `dev` | `development` → `applications_development` |
| `hml` | `staging` → `applications_staging` |
| `prd` | `production` → `applications_production` |

The health-check ticker syncs **all three** environments, regardless of which tab is on screen, each on its **own** cycle and interval (the interval picker changes only the environment on screen). Cycles are kept apart so the API never gets the three `/sync` at once: with no saved countdown (or one that expired while the page was closed) an environment starts at its `startDelay` (dev 15s, hml 10s, prd 5s) instead of syncing on load; every cycle restart (`restartCycle()` — end of cycle, "Sincronizar", interval change) is pushed to stay at least `SYNC_GAP_S` (2s) from the others; and when several expire in the same tick (background tab), only the most overdue syncs, the rest wait `SYNC_GAP_S` each. A reload never syncs by itself: countdowns are restored from `orbital-counters-v1`.

### Seed data

`mongo-seed.js` seeds 10 sample applications across the three collections. It runs only on first boot of an empty `mongo_data` volume (it is mounted into `docker-entrypoint-initdb.d`, and `MONGO_INITDB_DATABASE=orbital` makes the entrypoint run it against `orbital`), so re-seeding means dropping that volume.

### Frontend (`frontend/index.html`)

The project uses the **dc-runtime** system — a lightweight React-based template engine bundled into `support.js`. All application markup and logic lives in `index.html` inside an `<x-dc>` element.

#### dc-runtime template conventions

- `{{ expression }}` — interpolates a value from `renderVals()` into the template
- `<sc-if value="{{ condition }}">` — conditional rendering; there is no else branch, use two `sc-if`s
- `<sc-for list="{{ list }}" as="item">` — list rendering; items can carry their own handlers and styles (`onClick="{{ item.onClick }}" style="{{ item.style }}"`), which is how the env tabs, filter chips and rate options are built
- `ref="{{ refName }}"` — the bound value is a callback that receives the DOM element (`rootRef: el => { this.rootEl = el; }`)
- Events bind **camelCase**: `onClick`, `onChange`, `onSubmit`, `onFocus`, `onBlur`, `onMouseDown`. Arguments cannot be passed in markup — bind per item in JS instead.
- `style-hover="..."` / `style-focus="..."` — pseudo-state inline styles
- `<helmet>` — injects content into `<head>`
- `<script type="text/x-dc" data-dc-script>` — component logic; the class must extend `DCLogic`

State lives in `this.state = {}` and updates via `this.setState(nextState, callback?)`. Everything the template can reach is returned from a single flat object in `renderVals()`, which spreads smaller per-region methods (`skyVals()`, `toolbarVals()`, `headerVals()`, `listVals()`, `removeVals()`, `formVals()`, `teamVals()`); style factories that don't need `this` (`envTab`, `chip`, `swTrack`, …) live at module level. Lifecycle hooks: `componentDidMount`, `componentDidUpdate`, `componentWillUnmount`.

### Data persistence

MongoDB is the source of truth. `localStorage` holds a local cache plus user preferences:

- `orbital-apps-v1` — cache of the last `GET /applications`, as `{ id, env, name, team, healthCheckUrl, swaggerUrl }` (`env` is the short code). Entries in the old `{ nome, time, health, swagger }` shape are converted on read by `migrateApp()` and rewritten in the new shape on the next save. The list is reloaded (`loadApps()`) on mount, when the storm ends, and whenever a `/sync` returns IDs that don't match the environment's list
- `orbital-status-v1` — `{ status: { [appId]: 'healthy' | 'degraded' | 'unhealthy' }, ts }`, `ts` being the last successful `/sync` (ms) — but it only advances once no environment is still showing statuses from load, so it always dates the oldest status in the map. The old bare-map format is still read, as `ts = 0`, and the old values `up`/`down` are mapped to `healthy`/`unhealthy` on read by `migrateStatus()` (unknown values are dropped). If `ts` is older than `STATUS_STALE_MS` (5 min) on load, statuses show as "último conhecido" with the storm's `--stale` look, per environment (`staleEnvs`), until that environment's first successful sync. IDs not in the app list are dropped. The latency behind the degraded tooltip lives only in memory, `this.latency`
- `orbital-counters-v1` — per-environment countdown to the next sync, `{ [env]: { val, ts } }` (seconds left at `ts`); written whenever a cycle restarts, including on load
- `orbital-theme-v1` — `'dark'` | `'light'`
- `orbital-rate-v1` — health-check interval in seconds per environment, `{ dev, hml, prd }` (missing → `DEFAULT_RATE`). The old single number is read by `parseRates()` as the value of all three
- `orbital-notify-v1` / `orbital-sound-v1` — `'1'` | `'0'`, down-alert toggles
- `orbital-lastok-v1` — timestamp (ms) of the last successful `/sync`, shown while the API is unreachable
- `orbital-comet-v1` — timestamps (ms) of the comets shown in the last hour

Every read and write is wrapped in an inline `try { … } catch (e) {}` — follow that pattern.

### Down alerts

When an application transitions to `unhealthy`, the app fires a browser notification (`{name} saiu de órbita`, with team and environment in the body) and a WebAudio beep — both **only** when the tab is out of focus (`document.hidden || !document.hasFocus()`). A counter stays in the page title while any application is `unhealthy`. `degraded` never alerts and is not counted in the title. `this.downSeen` dedupes, so a single fall notifies once, and falls arriving within `ALERT_BATCH_MS` (400ms) are buffered to produce one beep. Since the environments' `/sync` calls are kept at least `SYNC_GAP_S` apart, falls in different environments normally beep separately.

### API unreachable — "tempestade"

Every API read goes through `apiFetch()` (10s timeout, throws on `!r.ok`). When the initial `GET /applications` or any `/sync` fails, `markApiDown()` sets `apiDown`: a storm covers the sky (`drawStorm()` — rain and lightning in both themes; dark clouds only in light, toggled by `--storm-clouds-opacity`), the orbit core turns into a storm cloud, planets and card badges go `--stale` grey (`ÚLTIMO: …`), and a banner shows the time of the last successful check. Status values are kept as last known, never cleared. The next successful sync clears it. Losing the API also notifies/beeps once when the tab is out of focus.

### Comets

A single comet crosses the sky as a rare, random event — dark theme only, independent of `apiDown`. `scheduleComet()` waits 20–60 min between attempts; `launchComet()` enforces a hard cap of `COMET_MAX` (2) per rolling hour using the timestamps in `orbital-comet-v1`, so reloading the page does not reset it. Attempts while the theme is light, the tab is away or reduced motion is on are skipped without consuming the quota. The layer's visibility is `--comet-opacity` (`1` dark / `0` light).

### Design system — Nocturne (`frontend/_ds/nocturne-*/`)

- `styles.css` is the only stylesheet; always link it and use its CSS variables — never hard-code hex values, font names, or raw px values the tokens already carry.
- `_ds_manifest.json` and `readme.md` document available components and tokens.
- Color tokens follow OKLCH tonal ramps (`--color-neutral-100`…`900`, `--color-accent-*`).
- **This page uses no CSS classes at all** — there is not a single `class=` attribute in `index.html`. Styling is 100% inline `style` attributes reading custom properties. The design system supplies tokens only; the `.btn` / `.card` / `.dialog` component classes are not used here. Match that, rather than introducing classes.
- App-level aliases (`--ink`, `--muted`, `--line`, `--surface`, `--dialog`, `--accent`, `--up`, `--down`, `--mono`, …) are defined in the `THEMES` object in `index.html` and applied imperatively by `applyTheme()`. **A new variable must be added to both the `dark` and `light` maps.**
- Icons: Phosphor (https://phosphoricons.com), pasted inline as `<svg viewBox="0 0 256 256" fill="currentColor">`. Copy real path data; do not hand-write it.
- Fonts: Inter (body/headings) + JetBrains Mono (monospaced labels), always through `font-family:var(--mono)`. The repeated mono label styles are the `MONO_CONTROL`, `MONO_SMALL`, `MONO_STAT` and `MONO_EYEBROW` constants, used in the template as `style="{{ monoEyebrow }} color:…"`.

### External dependencies (CDN)

- `d3@7` — orbital visualization (`drawStars`, `drawClouds`, `drawOrbits` methods)
- Google Fonts — Inter + JetBrains Mono
