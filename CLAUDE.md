# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

The app is **not** standalone — the frontend reads from a REST API, so opening `frontend/index.html` over `file://` fails on CORS. Bring up the whole stack instead:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Then open `http://localhost` (nginx, port 80). The API is on `http://localhost:3001`.

- `docker-compose.local.yml` — full local stack: mongo + redis + api + frontend
- `docker-compose.prod.yml` — api + frontend only; mongo and redis come from `.env.prod`
- `docker-compose.yml` — same services as local, without the api environment block

To see a frontend change, rebuild that one service — it only copies static files into nginx, so it is fast:

```bash
docker compose -f docker-compose.local.yml up -d --build frontend
```

`frontend/support.js` is a generated dc-runtime bundle and must not be edited by hand. Its TypeScript source is **not** in this repository, so there is no build step here to regenerate it. `frontend/Orbital.dc.html` is an empty scaffold, not the running page.

## Architecture

**Orbital** is an application health-monitoring dashboard. Applications appear as planets in a D3.js orbital visualization, colored green (`up`), amber (`degraded`, `--warn`), red (`down`) or grey (not yet checked). The UI is in Brazilian Portuguese.

```
frontend (nginx :80)  ──HTTP──▶  api (Express :3001)  ──▶  MongoDB
                                         └──▶ Redis (cache de /sync)
```

The browser never probes health check URLs itself. It calls `POST /applications/:env/sync`, and the API fetches each `healthCheckUrl` server-side (5s timeout, at most `HEALTH_CHECK_CONCURRENCY` — default 10 — in flight via `mapLimit()`) and returns `{ id, name, status, latencyMs }` per app. `status` is `healthy`, `degraded` (a 2xx slower than `DEGRADED_LATENCY_MS`, default 1000; these also carry `limitMs`) or `unhealthy` (non-2xx, network error or timeout — an error always wins over slowness).

### API (`api/`)

Express, no framework beyond it. Routes live in `api/src/routes/applications.js`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/applications` | all apps, grouped by environment |
| GET | `/applications/:env` | apps of one environment |
| POST | `/applications/:env/sync` | run health checks, return statuses |
| POST | `/applications/:env` | create an app |
| DELETE | `/applications/:env/:id` | remove an app |

There is **no update endpoint** — changing an existing app means editing Mongo directly.

`/sync` results are cached in Redis for `SYNC_CACHE_TTL` seconds (13 in local compose), so a health check URL change takes up to that long to show. `api/src/cache.js` degrades gracefully: if Redis is unreachable the check just runs uncached. CORS in `api/src/index.js` reflects any origin.

### Environments

The UI uses three short codes that map onto API/Mongo names — both directions live in `ENV_TO_API` / `API_TO_ENV` in `index.html`:

| UI | API path & Mongo collection |
|---|---|
| `dev` | `development` → `applications_development` |
| `hml` | `staging` → `applications_staging` |
| `prd` | `production` → `applications_production` |

The health-check ticker syncs **all three** environments every cycle, regardless of which tab is on screen.

### Seed data

`mongo-seed.js` seeds 10 sample applications across the three collections. It runs only on first boot of an empty `mongo_data` volume (it is mounted into `docker-entrypoint-initdb.d`), so re-seeding means dropping that volume.

### Frontend (`frontend/index.html`)

The project uses the **dc-runtime** system — a lightweight React-based template engine bundled into `support.js`. All application markup and logic lives in `index.html` inside an `<x-dc>` element.

#### dc-runtime template conventions

- `{{ expression }}` — interpolates a value from `renderVals()` into the template
- `<sc-if value="{{ condition }}">` — conditional rendering; there is no else branch, use two `sc-if`s
- `<sc-for list="{{ list }}" as="item">` — list rendering
- `ref="{{ refName }}"` — the bound value is a callback that receives the DOM element (`rootRef: el => { this.rootEl = el; }`)
- Events bind **camelCase**: `onClick`, `onChange`, `onSubmit`, `onFocus`, `onBlur`, `onMouseDown`. Arguments cannot be passed in markup — bind per item in JS instead.
- `style-hover="..."` / `style-focus="..."` — pseudo-state inline styles
- `<helmet>` — injects content into `<head>`
- `<script type="text/x-dc" data-dc-script>` — component logic; the class must extend `DCLogic`

State lives in `this.state = {}` and updates via `this.setState(nextState, callback?)`. Everything the template can reach is returned from a single flat object in `renderVals()`. Lifecycle hooks: `componentDidMount`, `componentDidUpdate`, `componentWillUnmount`.

### Data persistence

MongoDB is the source of truth. `localStorage` holds a local cache plus user preferences:

- `orbital-apps-v1` — cache of the last `GET /applications`
- `orbital-status-v1` — last known `{ [appId]: 'up' | 'degraded' | 'down' }` (the latency behind the degraded tooltip lives only in memory, `this.latency`)
- `orbital-counters-v1` — per-environment countdown to the next sync
- `orbital-theme-v1` — `'dark'` | `'light'`
- `orbital-rate-v1` — health-check interval in seconds
- `orbital-notify-v1` / `orbital-sound-v1` — `'1'` | `'0'`, down-alert toggles
- `orbital-lastok-v1` — timestamp (ms) of the last successful `/sync`, shown while the API is unreachable
- `orbital-comet-v1` — timestamps (ms) of the comets shown in the last hour

Every read and write is wrapped in an inline `try { … } catch (e) {}` — follow that pattern.

### Down alerts

When an application transitions to `down`, the app fires a browser notification (`{nome} saiu de Órbita`, with team and environment in the body) and a WebAudio beep — both **only** when the tab is out of focus (`document.hidden || !document.hasFocus()`). A counter stays in the page title while any application is down. `degraded` never alerts and is not counted in the title. `this.downSeen` dedupes, so a single fall notifies once, and simultaneous falls across environments are buffered to produce one beep.

### API unreachable — "tempestade"

Every API read goes through `apiFetch()` (10s timeout, throws on `!r.ok`). When the initial `GET /applications` or any `/sync` fails, `markApiDown()` sets `apiDown`: a storm covers the sky (`drawStorm()` — rain and lightning in both themes; dark clouds only in light, toggled by `--storm-clouds-opacity`), the orbit core turns into a storm cloud, planets and card badges go `--stale` grey (`ÚLTIMO: …`), and a banner shows the time of the last successful check. Status values are kept as last known, never cleared. The next successful sync clears it. Losing the API also notifies/beeps once when the tab is out of focus.

### Comets

A single comet crosses the sky as a rare, random event — dark theme only, independent of `apiDown`. `scheduleComet()` waits 20–60 min between attempts; `launchComet()` enforces a hard cap of `COMET_MAX` (2) per rolling hour using the timestamps in `orbital-comet-v1`, so reloading the page does not reset it. Attempts while the theme is light, the tab is away or reduced motion is on are skipped without consuming the quota. The layer's visibility is `--comet-opacity` (`1` dark / `0` light).

### Design system — Nocturne (`frontend/_ds/nocturne-*/`)

- `styles.css` is the only stylesheet; always link it and use its CSS variables — never hard-code hex values, font names, or raw px values the tokens already carry.
- `_ds_manifest.json` and `readme.md` document available components and tokens.
- Color tokens follow OKLCH tonal ramps (`--color-neutral-100`…`900`, `--color-accent-*`).
- **This page uses no CSS classes at all** — there is not a single `class=` attribute in `index.html`. Styling is 100% inline `style` attributes reading custom properties. The design system supplies tokens only; the `.btn` / `.card` / `.dialog` component classes are not used here. Match that, rather than introducing classes.
- App-level aliases (`--ink`, `--muted`, `--line`, `--surface`, `--dialog`, `--accent`, `--up`, `--down`, …) are defined in the `THEMES` object in `index.html` and applied imperatively by `applyTheme()`. **A new variable must be added to both the `dark` and `light` maps.**
- Icons: Phosphor (https://phosphoricons.com), pasted inline as `<svg viewBox="0 0 256 256" fill="currentColor">`. Copy real path data; do not hand-write it.
- Fonts: Inter (body/headings) + JetBrains Mono (monospaced labels).

### External dependencies (CDN)

- `d3@7` — orbital visualization (`drawStars`, `drawClouds`, `drawOrbits` methods)
- Google Fonts — Inter + JetBrains Mono
