# CLAUDE.md — Frontend

Frontend-specific guidance. The architecture, the HTTP/SSE contract with the API and the environments are in the root `CLAUDE.md`; this file covers how the SPA is built.

## Build and serve

The frontend is a **React 19 + TypeScript SPA built with Vite**, routed by React Router and with state in Zustand. It needs the API, so keep the stack up (root `CLAUDE.md`). Commands, from this folder:

```bash
npm run dev         # Vite dev server (http://localhost:5173) with hot reload; proxies /api → http://localhost:3001 (prefix stripped)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint . (typed rules, a11y, hooks, layer boundaries)
npm test            # vitest run   (npm run test:watch to watch)
npm run build       # tsc --noEmit && vite build → dist/
npm run format      # prettier --write .
```

To see a change in the real app on port 80, rebuild just this service (then hard-refresh the browser):

```bash
docker compose -f docker-compose.local.yml up -d --build frontend
```

- The `Dockerfile` is multi-stage: `node:24-alpine` runs `npm ci` + `npm run build`, and `nginxinc/nginx-unprivileged:1.28-alpine` serves `dist/` as uid 101 on port **8080** (compose publishes `80:8080`), with a `HEALTHCHECK` (busybox `wget` on `http://127.0.0.1:8080/`). Vite copies `public/` (the Nocturne `_ds/` folder, `favicon.svg`, `theme-boot.js`, `theme-boot.css`) into `dist/`.
- nginx config lives in `nginx/`: `default.conf.template` is rendered by the image's entrypoint (envsubst) into `/etc/nginx/conf.d/default.conf` at startup. Only `API_UPSTREAM` (default `http://api:3001`, set in the Dockerfile) and `NGINX_LOCAL_RESOLVERS` (filled from `/etc/resolv.conf` because `NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1` — `127.0.0.11` in Docker, the cluster DNS in Kubernetes) are substituted (`NGINX_ENVSUBST_FILTER`); nginx's own `$vars` are untouched. To point at another API: `docker run -e API_UPSTREAM=http://host:port …`.
- Routing: any path that is not a file falls back to `index.html` (SPA routes), served `no-cache`; `/assets/` (hashed by Vite) is cached a year as `immutable` with no fallback (a missing asset is a 404, not the HTML); `favicon.svg`, `theme-boot.*` and `_ds/` are cached one day; `/api/` is proxied to `API_UPSTREAM` with the prefix stripped, and `/api/applications/events` unbuffered with a 1 h read timeout.
- **Security headers** (`nginx/security-headers.conf`) are `include`d in **every** location — a location with its own `add_header` drops the server-level ones — with `always`: CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. On `/api/` the API's own copies are dropped (`proxy-hide-security-headers.conf`) so each header appears once. No HSTS here (plain HTTP); the optional TLS front (`docker-compose.tls.yml` + `caddy/Caddyfile`) adds it.
- **CSP**: `script-src 'self'` and `style-src 'self'` — so **no inline `<script>`/`<style>` in `index.html`** and nothing from a third-party host (no CDN, no Google Fonts). The one exception is `style-src-attr 'unsafe-inline'`, because `viz/comet.ts` and `viz/clouds.ts` build markup with `style="…"` through `.html()`; styles set through the CSSOM (d3 `.style()`, React's `style` prop) are not affected by CSP. Replacing those `style="…"` with SVG attributes / CSSOM would let it go. A new external origin (API on another host, images, etc.) must be added to the CSP.
- `index.html` loads `/theme-boot.js` as a classic blocking script (no `defer`/`async`) that sets `data-theme` from `orbital-theme-v1` before first paint (the module would flash the wrong theme), `/theme-boot.css` (dark background before the bundle CSS), the Nocturne stylesheet, and `src/main.tsx`.
- `prototipos/` (when present) holds local design prototypes; it is git-ignored, not shipped, and ignored by lint.

## Layout of `src/`

```
main.tsx      clears obsolete storage keys, hydrates the stores from localStorage, then createRoot + RouterProvider
app/          router.tsx (routes), AppShell.tsx (per-app singletons), MessagePage.tsx (404 / route error)
domain/       pure TS, no React and no DOM: types, environments, status, orbits, application-form,
              migrations, status-diff, format, random, constants, comet-quota
api/          http.ts (apiFetch, ApiError, apiErrorMsg), applications.ts (list/create/update/remove/sync),
              events.ts (parseEvent + openEventStream)
storage/      keys.ts (orbital-*-v1), local-storage.ts (read/write with the try/catch built in),
              cache.ts (apps + status cache), preferences.ts, comet-log.ts
store/        Zustand: apps.store, status.store, connection.store, preferences.store, hydrate.ts, selectors.ts
hooks/        useEventStream, useDownAlerts (+ alerts/beep, alerts/notify), useTheme, useDocumentTitle,
              useComets, useReducedMotion, useResize, EventStreamContext
theme/        themes.css (tokens per theme and storm), base.css (global rules), mono.module.css
viz/          imperative drawing with d3-selection, d3-timer and canvas: orbit-core, orbit-geometry, stars,
              clouds, storm, comet, panel-orbits, galaxy-sky, galaxy-rocks, galaxy-layout, galaxy-orbits,
              galaxy-orbit-label, galaxy-fx (+ the keyframes CSS they use)
components/   generic UI that knows nothing of the domain: Icon, Switch, Chip, Modal, Banner, ThemeSwitch
features/     app-form/ (AppFormDialog, AppForm, EnvTabs, TeamField, OrbitCombobox, useAppForm, app-form-model),
              panel/ (PanelPage and its regions, panel.store, usePanelFilters, useSync, useAppMutations, …),
              galaxy/ (GalaxyPage and its layers, useEnterOrbit, useGalaxyStale)
```

`@/` is an alias for `src/`. Tests live in `test/`, mirroring `src/` (`src/features/panel/AppCard.tsx` → `test/features/panel/AppCard.test.tsx`) and importing the code through `@/`; `test/setup.ts` is the global setup. `src/` holds only shipped code.

**Layer rules** are enforced by lint (`import-x/no-restricted-paths` in `eslint.config.js`) — a layer imports only from itself and from:

```
features   → components, hooks, store, viz, api, domain, storage
hooks      → store, api, domain, storage
store      → api, domain, storage
viz        → domain
api        → domain
components → domain
domain     → (nothing)
```

`app/` sits on top and may import anything. So `viz/` never imports React or a store, `components/` never import a store, and `domain/` stays pure.

## Routes

`app/router.tsx` (`createBrowserRouter`), all children of `AppShell`:

| Path | Page |
|---|---|
| `/` | `GalaxyPage` — the galaxy |
| `/painel` | `PanelPage` — the panel; `?orbita=<key>` filters it by orbit |
| `*` | `NotFoundPage` — a pt-BR 404 over the panel's sky (`SkyLayers`: stars in dark, clouds in light), left-aligned: a large "ERRO 404", "Página não encontrada" and a link back to the galaxy; there is no redirect, so old URLs like `/painel.html` land here |

A route that throws renders `RouteError` (same `MessagePage`), instead of React Router's developer screen.

## AppShell and startup

`main.tsx` runs `clearObsoleteKeys()` and `hydrateStores()` **before** `createRoot`, so every component already sees the stored theme, environment, app list, statuses, `lastOk` and alert toggles on its first render (a later hydration made the form open in the wrong env). `hydrateStores()` only reads; the saved notify flag is kept only if `Notification.permission` is still `granted`.

`AppShell` is the layout of every route and owns what exists once per tab: `useTheme()`, `useDocumentTitle()`, `useDownAlerts()`, the **single SSE connection** (`useEventStream()`) and the initial `loadApps()`. The stream stays open while navigating between `/` and `/painel`; its `reconnectIfClosed` control reaches pages through `EventStreamContext` (`useEventStreamControls()`). **Down alerts only fire with `/painel` active** (`useMatch('/painel')`), as before the migration, when the galaxy never alerted; `downSeen` is updated on every route, so a fall seen on the galaxy does not alert again when the panel opens.

## State — Zustand stores

| Store | Holds |
|---|---|
| `apps.store` | `apps` (every environment); `loadApps()` (`GET /applications`, concurrent calls share one request, returns `false` if the API failed); `commitApps()` |
| `status.store` | `status` map, `ts`, `staleEnvs`, `cycles` (`{ [envCode]: ms \| null }`), `downSeen`, `synced`; `applySnapshot/applyStatus/applyCycle` return `{ fell, needsReload }`; `pruneTo`, `forget` |
| `connection.store` | `apiDown` (the storm), `lastOk`, `scanning` + `scanEnv` (one "Sincronizando…" at a time) |
| `preferences.store` | `theme`, `env`, `notify`, `sound` (each setter persists) and `notifyBlocked` (not persisted) |
| `features/panel/panel.store` | panel screen state: query, filter, page, selection, pending removal, form open/editing; reset when the panel unmounts (`usePanelLifecycle`) |

- The business rules (stale-list detection, `diffStatuses`, `ts` advance, `staleEnvs`) are pure functions in `domain/status-diff.ts`; the stores call them, store the result, persist and notify. Timers belong to hooks, not stores.
- Components read **by selector, per item** — `useStatusStore((s) => s.status[app.id])` in `AppCard` — so a `status` event re-renders only the affected card and planet. `usePanelFilters` only subscribes to the status map while a status filter is on.
- Outside React, read and act through `useXStore.getState()` (event handlers, callbacks, other stores).

## Pages

**App form** (`features/app-form/`). `AppFormDialog` (a `Modal`) is shared by both pages; `useAppForm` holds the draft, validates with `validateAppForm()` (`domain/application-form.ts`, mirroring the API validator, messages in pt-BR, shown per field) and maps a 400's `fields` onto the form — keep both sides in sync. With `editing` set it submits a `PUT` with the env tabs locked to the app's env; only the panel offers it, through the pencil on each card. The **Órbitas** field is a combobox (`OrbitCombobox`): chips, search over `collectOrbits()` of all apps, "Criar órbita “x”" on Enter, arrows/Esc/Backspace; a typed but unconfirmed orbit is added on submit (`withPendingOrbit()`); the filtered orbit is pre-selected. The dialog stays mounted, so a closed unsent draft comes back; focus goes to the dialog container, and Esc closes it.

**Galaxy** (`features/galaxy/`, `viz/galaxy-*`). Uses the shared app list and status stores (only statuses matter here). Orbits come from `orbitsByBirth()`: ordered by the oldest app id in each (Mongo ids grow with time), so a new orbit is appended and neither the color (`orbitColors()`, by that order, 8 cool tones that never use the status hues) nor the layout of the others moves. `layout()` picks each position from candidates seeded by `hashId(key)` in a fixed 1280×800 reference space (rescaled to the window), avoiding earlier planets, the title, the top bar, the + button and the galaxy core. Each orbit is drawn as a small version of the panel's orbit: the same core (`appendOrbitCore()` in `viz/orbit-core.ts` — moon in dark, sun in light — also used by the panel), dashed rings in the orbit color and small planets in status colors. The small planets are a sample, not the count (`systemTones()`: 0–5 by orbit size, colored in proportion to the real statuses, with at least one for any down/degraded app). Under it: the name, `N APLICAÇÕES` (every app in every environment) and a health line (`TODAS NO AR` / `x FORA` with `y DEGRADADO` on a second line below it, `VERIFICANDO`, or `ÚLTIMO: …` while stale — `useGalaxyStale()`: API down, or old statuses at load and no event received yet). The sky is a canvas spiral galaxy, asteroids can be thrown with the pointer and collide, and clicking a planet runs a canvas "suction" + `--veil` fade (`useEnterOrbit`, `viz/galaxy-fx.ts`) before navigating with the router to `/painel?orbita=<key>`. `smoothClosedPath()`, `color-mix()` gradient stops, CSS transitions and inline easing replace the other d3 modules; canvas code reads colors resolved by `getComputedStyle`, since `var()` does not work there. The + button opens the same form in place, always starting in `DEFAULT_ENV` (`prd`) and without changing the saved env; a new orbit becomes a planet as soon as the app is created.

**Panel** (`features/panel/`). `usePanelFilters()` reads `?orbita=` (through `orbitKey()`), and `envApps` (screen env ∩ orbit: stats, orbit, list, remove modal) and `visibleApps` (plus search and status filter: list and planets) derive from the stores; the stale-list checks use the whole environment (`appsIn(env)`). Down alerts and the title counter stay global. The header gets a "← Galáxia" link and the orbit name as title. Creating an app switches the screen to its env (`useAppMutations`); an edit with a new `healthCheckUrl` forgets the app's status, since the API drops it.

## Live updates

The frontend has **no health-check timer**: `useEventStream()` opens one `EventSource` on `/api/applications/events?changes=true` (after the snapshots only status changes arrive; `cycle` always does — the UI only needs the `status` field) and the three environments' results arrive on their own, 10 s apart. Each parsed event (`parseEvent()`) goes to the status store; `fell` feeds the alerts and `needsReload` calls `loadApps()`. The toolbar shows a clock icon with the displayed environment's `hh:mm:ss` (the label "Última verificação" is only in its tooltip) — the `checkedAt` of its last cycle (`cycles[env]`, updated only by events); the next scheduled check is not shown, although the API still sends `nextCheckAt`. "Sincronizar" (`useSync`) calls `POST …/sync` and stays "Sincronizando…" until that environment's `cycle` event arrives (or `SCAN_MAX_MS`, 30 s; the timer is cleared whenever `scanning` goes back to false). A reload never triggers a check: it just receives the snapshots. Other open tabs only see edited app fields after their next `GET /applications` (the SSE stream carries ids, not app fields).

## Visualization (`viz/`)

Drawing stays imperative: `d3-selection` + `d3-timer` (npm dependencies, bundled — no CDN) and canvas. A `viz/` module receives an element plus ready data and options (`drawOrbits(el, scene, planets)`, `drawStorm(el, opts)`, `drawStars(el)`) and returns a cleanup function (or an object with `update()`/`destroy()`). Components call them inside `useEffect` and return that cleanup, so the StrictMode double mount leaves nothing behind. The panel's `OrbitView` only rebuilds the skeleton when what it draws changes (theme, storm, env, size, reduced motion); statuses, search, filter and selection go through `update()`. With `prefers-reduced-motion` (`useReducedMotion()`) the panel orbit stands still (no timer), as does the galaxy.

**Animation pauses behind a modal.** The overlay's `backdrop-filter: blur()` would be recomputed on every frame of the animated background, which stutters on weaker machines, so everything behind an open modal pauses. `components/modal-stack.ts` keeps the open-modal stack, sets `data-modal="open"` on `<html>` and exposes `useModalOpen()`. The d3 timers read time from a `MotionClock` (`domain/motion-clock.ts`, one per component via `useMotionClock(paused)`), which stops while paused and resumes where it left off, so nothing jumps. CSS animations pause through `themes.css` (`--stars-play`, `--clouds-play`, `--storm-play` and `--backdrop-play`). A new infinite animation in a background layer must use `animation-play-state: var(--backdrop-play, running)`.

## Styling — CSS Modules and tokens

- Each component has its CSS Module next to it (`AppCard.module.css`). Global rules are only `theme/base.css`; the repeated mono labels are classes in `theme/mono.module.css` (`control`, `small`, `stat`, `eyebrow`).
- `theme/themes.css` holds the app-level tokens (`--ink`, `--muted`, `--line`, `--surface`, `--dialog`, `--accent`, `--up`, `--warn`, `--down`, `--stale`, `--mono`, …) under `:root[data-theme='dark']` and `:root[data-theme='light']`; **a new variable must be added to both**. `useTheme()` (AppShell) sets on `<html>`: `data-theme`; `data-storm="on"` while `apiDown` (switches `--calm`/`--storm-on` and darkens light-theme accents); and `data-storm-play`, which only goes to `paused` `STORM_FADE_MS` after the storm ends, so the rain doesn't freeze while the sky clears.
- Use only CSS variables (Nocturne + theme) — never hard-code hex values, font names or raw px values a token already carries.

## Data persistence

MongoDB is the source of truth. `localStorage` holds a local cache plus user preferences, always through `storage/` (`local-storage.ts` wraps every read and write in `try/catch`; key names in `storage/keys.ts`):

- `orbital-apps-v1` — cache of the last `GET /applications`, as `{ id, env, name, team, healthCheckUrl, swaggerUrl, orbits }` (`env` is the short code; `orbits` is always an array — `fromApi()`/`migrateApp()` turn anything else into `[]`). Entries in the old `{ nome, time, health, swagger }` shape are converted on read by `migrateApp()` and rewritten in the new shape on the next save. Every change to the app list (load, create, edit, delete) goes through `commitApps()`, which also drops orphan statuses and saves both keys. The list is reloaded (`loadApps()`) on startup, when the storm ends, and whenever a `snapshot`, `status` or `cycle` event shows IDs or a count that doesn't match the environment's list
- `orbital-status-v1` — `{ status: { [appId]: 'healthy' | 'degraded' | 'unhealthy' }, ts }`, `ts` being the `checkedAt` of the last `cycle` (ms) — but it only advances once no environment is still showing statuses from load, so it always dates the oldest status in the map. The old bare-map format is still read, as `ts = 0`, and the old values `up`/`down` are mapped to `healthy`/`unhealthy` on read by `migrateStatus()` (unknown values are dropped). If `ts` is older than `STATUS_STALE_MS` (5 min) on load, statuses show as "último conhecido" with the storm's `--stale` look, per environment (`staleEnvs`), until that environment's first `snapshot` (with a cycle) or `cycle` event. IDs not in the app list are dropped. The degraded badge's tooltip is a fixed text ("Tempo de resposta acima do limite"); latency is not kept on the client
- `orbital-theme-v1` — `'dark'` | `'light'`
- `orbital-env-v1` — the panel's selected environment code (`dev` | `hml` | `prd`), saved when the env tab changes and when a create on the panel switches the screen to the new app's env; read at hydration (an unknown code falls back to `DEFAULT_ENV`)
- `orbital-counters-v1` and `orbital-rate-v1` no longer exist: the browser has no timer or interval picker, and `clearObsoleteKeys()` (in `main.tsx`) removes both keys left by older versions
- `orbital-notify-v1` / `orbital-sound-v1` — `'1'` | `'0'`, down-alert toggles
- `orbital-lastok-v1` — the `checkedAt` (ms) of the last `cycle` event, shown while the API is unreachable
- `orbital-comet-v1` — timestamps (ms) of the comets shown in the last hour

## Down alerts

When an application transitions to `unhealthy` with the panel open, the app fires a browser notification (`{name} saiu de órbita`, with team and environment in the body) and a WebAudio beep — both **only** when the tab is out of focus (`document.hidden || !document.hasFocus()`). A counter stays in the page title (`useDocumentTitle`, on every route) while any application is `unhealthy`. `degraded` never alerts and is not counted in the title. `downSeen` (status store) dedupes, so a single fall notifies once, and falls arriving within `ALERT_BATCH_MS` (400ms) are buffered to produce one beep (a batch is dropped if the panel was left meanwhile). Since the server's cycles of the three environments are 10 s apart, falls in different environments normally beep separately. Falls that happened while the stream was down arrive in the reconnect's `snapshot` and alert through the same `downSeen` logic. Returning to the tab clears pending alerts and closes open notifications.

## API unreachable — "tempestade"

Every API call goes through `apiFetch()` (`API_TIMEOUT` 10 s, throws `ApiError` on `!r.ok`). When the initial `GET /applications` or a `POST …/sync` fails, or the SSE stream stays disconnected for more than `SSE_DOWN_GRACE_MS` (5 s; the `EventSource` reconnects by itself, and when it gives up — e.g. a 502 from nginx — the stream is reopened every `SSE_RETRY_MS`), `markApiDown()` sets `apiDown`: a storm covers the sky (`drawStorm()` — rain and lightning in both themes; dark clouds only in light, toggled by `--storm-clouds-opacity`), the orbit core turns into a storm cloud, planets and card badges go `--stale` grey (`ÚLTIMO: …`), and a banner shows the time of the last successful check, with "Tentar agora". Status values are kept as last known, never cleared. The next event received from the server (the reconnect's `snapshot`) clears it, with no page reload. Losing the API also notifies/beeps once when the tab is out of focus (panel only).

## Comets

A single comet crosses the panel's sky as a rare, random event — dark theme only, independent of `apiDown`. `useComets()` waits 20–60 min between attempts and enforces a hard cap of `COMET_MAX` (2) per rolling hour using the timestamps in `orbital-comet-v1` (`domain/comet-quota.ts`), so reloading the page does not reset it. Attempts while the theme is light, the tab is away or reduced motion is on are skipped without consuming the quota. The layer's visibility is `--comet-opacity` (`1` dark / `0` light).

## Design system — Nocturne (`public/_ds/nocturne-*/`)

- `styles.css` is linked from `index.html`; use its CSS variables. The design system supplies tokens only; its `.btn` / `.card` / `.dialog` component classes are not used — styles live in CSS Modules.
- `_ds_manifest.json` and `readme.md` document available components and tokens.
- Color tokens follow OKLCH tonal ramps (`--color-neutral-100`…`900`, `--color-accent-*`).
- Icons: Phosphor (https://phosphoricons.com), through the typed `Icon` component (`components/Icon.tsx`, `<Icon name="clock" />`): a new icon is a new entry in its `PATHS` map. Copy real path data; do not hand-write it.
- Fonts: Inter (body/headings) + JetBrains Mono (monospaced labels, via `var(--mono)` or the `mono.module.css` classes), self-hosted through `@fontsource/inter` and `@fontsource/jetbrains-mono`: `main.tsx` imports only the weights used (Inter 400/500/600/700, Mono 400/500) and only the `latin` subset (covers pt-BR), and Vite bundles the woff2 into `/assets/`. A new weight is a new import there. The `@import` of Google Fonts at the top of the Nocturne `styles.css` was removed — keep it out if that file is ever re-exported.

## Tests

**Vitest + Testing Library** on jsdom (`vite.config.ts` → `test`; CSS Module class names are not scoped in tests, so `styles.x` is `x`). `test/setup.ts` adds jest-dom, clears `localStorage` before each test and installs `FakeEventSource` as the global `EventSource` (`FakeEventSource.last()`, `emitOpen()`, `emit(type, data)`, `emitError()`), so the stream hooks are tested without a server.

- Every `describe`/`it` description is in Brazilian Portuguese and states the behavior under test.
- Pure modules (`domain/`, `viz/` geometry, `storage/`) are tested directly; hooks and components through Testing Library (`render`, `renderHook`, `user-event`).
- The gate before a commit is `npm run typecheck && npm run lint && npm test` (and `npm run build`).

## Conventions

- **Names:** components and types in `PascalCase` (`AppCard.tsx`), hooks `useX.ts`, domain and viz modules in `kebab-case.ts`, the CSS Module next to its component.
- **Small, single-purpose components.** Screen logic goes in the feature's hooks (`usePanelFilters`, `useSync`), not in JSX. A file past ~200 lines is a sign to split it.
- **No `any`.** External data (API, SSE, localStorage) comes in through parse functions that check the shape (`fromApi`, `migrateApp`, `parseEvent`) and return domain types.
- **Effects always clean up** (timers, `EventSource`, `d3-timer`, `requestAnimationFrame`, listeners) and are safe under the StrictMode double mount.
- **Texts** are pt-BR; there is no i18n.
- **localStorage** only through `storage/`.
- **Commits** in Portuguese, in the gerund ("Adicionando store de status"), one subject per commit.

## Clean code

Adapted from [clean-code-javascript](https://github.com/ryanmcdermott/clean-code-javascript) to this codebase. Where a rule clashes with a project convention, the convention wins (noted inline).

**Names**
- Meaningful, pronounceable, searchable names; no single letters outside short callbacks and math (`x`, `y`, `t` in canvas code are fine).
- One word per concept, matching the API (`name`, `team`, `orbits`, `env`, `status`) — don't mix `app`/`item`/`entry` for the same thing.
- No magic numbers: timings, limits and sizes go in named constants (`domain/constants.ts`, or exported next to their only user: `SSE_DOWN_GRACE_MS`, `COMET_MAX`, `SCAN_MAX_MS`, …).
- No redundant context (`app.name`, not `app.appName`). Store intermediate results in explanatory variables.
- Predicates read positively (`isStale`, `hasOrbit`), never double negatives.

**Functions**
- One thing, one level of abstraction. A page composes regions, each its own component; extract a hook or helper when a component mixes drawing, state and I/O.
- Two arguments or fewer; past that, take one object and destructure it (props already are one).
- No boolean flag parameters that switch behavior — write two named functions.
- Name complex conditions with a function or a `const` (`const isDown = …`).
- Prefer table lookups over `switch`/`if` chains on a type: `STATUS_META`, `ENVS`, the `Icon` `PATHS` are the model — add a row, not a branch.
- Defaults through default parameters or `{ ...defaults, ...opts }`, never by mutating the input.
- Prefer `map`/`filter`/`reduce` over loops with mutable counters, except in per-frame canvas/d3 code, where plain loops are fine.
- Don't over-optimize; measure first. Per-frame code (`d3-timer`, canvas) is the one place where allocations matter; elsewhere, prefer narrow store selectors to `useMemo` tricks.

**Side effects and state**
- Never mutate store state, props, arguments or arrays in place — build copies and go through the store's `set`/actions.
- Keep side effects in one place: app-list changes only through `commitApps()`, network only through `apiFetch()` (via `api/`), storage only through `storage/`.
- No globals beyond module-level constants and helpers; never extend built-in prototypes.
- Callers sit above their callees, so a file reads top to bottom.

**Async and errors**
- `async`/`await` with `try`/`catch`, not `.then()` chains or callbacks (a `.then(ok, fail)` pair is fine where a hook must not await).
- Don't swallow errors: every `catch` sets visible state (`markApiDown()`, form errors) or is deliberate. Exception: `localStorage` (already handled in `storage/`), `Notification` and WebAudio, which may legitimately be unavailable.
- Every promise is awaited or explicitly handled (`void` only when the result truly doesn't matter); no fire-and-forget without a `catch`.

**Dead code and comments**
- Delete dead code and commented-out code; git keeps the history.
- Comments (in pt-BR, like the existing ones) explain *why* — runtime constraints, ordering, protocol quirks — never *what* the code already says.
- No changelog comments and no banner/section-divider comments.
