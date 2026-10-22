# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It holds what both sides share — architecture, the API ↔ frontend contract, environments and data. Each application has its own file with the details:

- `api/CLAUDE.md` — backend: layers and naming, validation, scheduler, SSE, Redis, logging, tests
- `frontend/CLAUDE.md` — frontend: React + TypeScript SPA (Vite), layers, stores, galaxy and panel, local storage, alerts, design system, tests

## Overview

**Orbital** is an application health-monitoring dashboard. Applications appear as planets in a D3.js orbital visualization, colored green (`healthy`, `--up`), amber (`degraded`, `--warn`), red (`unhealthy`, `--down`) or grey (not yet checked). Applications are also grouped into **orbits**: each application document carries `orbits`, a list of names, and an app can be in several. There is no orbit collection — the set of orbits is the union of those lists, and an orbit's identity is `orbitKey(name)` (no accents, lowercase, spaces → `-`; the same function on both sides). The home page is a **galaxy** where each orbit is a planet; clicking one opens the panel filtered by it (`/painel?orbita=<key>`). The frontend uses the API's status names and field names (`name`, `team`, `healthCheckUrl`, `swaggerUrl`, `orbits`) as is; the CSS color variables keep their short names. The UI is in Brazilian Portuguese.

## Repository layout

| Path | What |
|---|---|
| `api/` | Express REST API + SSE, health-check scheduler (Node 24) |
| `frontend/` | React + TypeScript SPA built with Vite and served by nginx: galaxy (`/`) and panel (`/painel`) |
| `site/` | static presentation page published on GitHub Pages (not part of the app) |
| `mongo-seed.js` | Mongo seed script |
| `CHANGELOG.md` | release history (Keep a Changelog, pt-BR); the release workflow reads it |
| `docker-compose.local.yml`, `docker-compose.prod.yml` | how the stack runs |
| `docker-compose.tls.yml`, `caddy/Caddyfile` | optional HTTPS front (Caddy, HSTS) layered on either compose file |

## Running the app

The app is **not** standalone — the frontend reads from a REST API under `/api/…`, so it needs either nginx or the Vite dev server in front of the API. Bring up the whole stack:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Then open `http://localhost` (nginx listens on 8080 as a non-root user; compose publishes it as `80:8080`). The API is on `http://localhost:3001`.

- `docker-compose.local.yml` — full local stack: mongo + redis + api + frontend; mongo and redis are published on `127.0.0.1` only
- `docker-compose.prod.yml` — api + frontend only; mongo and redis come from `api/.env.prod` (template: `api/.env.prod.example`)
- `docker-compose.tls.yml` — override adding Caddy on 80/443 for `ORBITAL_DOMAIN`; the frontend then publishes no port

Both images run as non-root and have a `HEALTHCHECK`. The nginx config is a template (`frontend/nginx/default.conf.template`): `API_UPSTREAM` (default `http://api:3001`) sets the proxy target and the resolver comes from the container's `/etc/resolv.conf`. CORS is closed by default (`CORS_ORIGINS` empty), since the browser reaches the API same-origin through nginx or Vite.

The frontend image builds the SPA (`npm run build`) and serves `dist/` with nginx; rebuild it with `docker compose -f docker-compose.local.yml up -d --build frontend`. For frontend work with hot reload, run `npm run dev` in `frontend/` (Vite on `http://localhost:5173`, proxying `/api` to the API on `:3001`) with the stack still up — see `frontend/CLAUDE.md`.

## Architecture

```
frontend (nginx :8080) ──HTTP + SSE──▶  api (Express :3001)  ──▶  MongoDB
                                          └──▶ Redis (cache de apps e estado dos checks)
```

The browser never probes health check URLs itself, and has no timer. The **API schedules the checks**: every `HEALTH_CHECK_INTERVAL_S` (default 30) it runs a cycle per environment, with offsets production 0 s, staging 10 s, development 20 s, so the three never run together. A cycle fetches each `healthCheckUrl` server-side and publishes each result over SSE as soon as that check ends. `status` is `healthy`, `degraded` (a 2xx slower than `DEGRADED_LATENCY_MS`, default 3000; these also carry `limitMs`) or `unhealthy` (non-2xx, network error or timeout — an error always wins over slowness). **Single API instance only**: scheduler and SSE fan-out are in-process, so several replicas would check twice.

MongoDB is the source of truth. Redis caches each environment's app list and keeps the last status of every app and the last cycle; the API keeps working (uncached, without stored statuses) if Redis is down. The browser keeps its own `localStorage` cache so it can show last-known state while the API is unreachable.

## API ↔ frontend contract

| Method | Path | Purpose |
|---|---|---|
| GET | `/applications` | all apps, grouped by environment |
| GET | `/applications/events` | SSE stream for the three environments (`?changes=true` → only `status` events whose status changed) |
| POST | `/applications/:env/sync` | force a health check cycle (202); results come through the SSE stream |
| POST | `/applications/:env` | create an app |
| PUT | `/applications/:env/:id` | edit an app (full replacement of its fields; the env cannot change) |
| DELETE | `/applications/:env/:id` | remove an app |
| GET | `/health` | liveness: `200 { status: "UP" }` while the process is up (no Mongo/Redis check) |

The frontend reaches the API through nginx under `/api/…`.

- `POST …/sync` answers **202** at once with `{ env, trigger, startedAt, nextCheckAt, joined }`; it joins a cycle already running (`joined: true`). Results come only through SSE.
- Create/update answer 400 `{ error: "Invalid application", fields: { field: message } }` on invalid input; `PUT`/`DELETE` answer 404 for an unknown id. Errors are always JSON.
- **SSE events.** On connect, one `snapshot` event per environment (`id, name, env, orbits` (`[]` when the document has none), `status: null` for never-checked apps — plus the last `cycle` and `nextCheckAt`); afterwards a `status` event per checked app (`id, name, env, status, latencyMs, limitMs` only when degraded, `checkedAt`) and one `cycle` event at the end of each cycle (`env, trigger, checked, changed, healthy, degraded, unhealthy, startedAt, checkedAt, durationMs, nextCheckAt`). There is no `Last-Event-ID` replay — a reconnect gets a fresh snapshot. The stream carries ids, not app fields, so edits only show elsewhere after a new `GET /applications`.
- **Validation is mirrored.** The API validator (`api/src/validators/application.validator.js`) is authoritative; the frontend repeats the same rules in `validateAppForm()` (`frontend/src/domain/application-form.ts`, messages in pt-BR) and maps a 400's `fields` onto the form. Summary: every field a string; `name` 2–60 `[A-Za-z0-9._-]`; `team` 2–60; `orbits` 1–10 names of 2–40, deduplicated by `orbitKey()`; `healthCheckUrl` required and `swaggerUrl` optional, http(s) only, no credentials. **Change both sides together.**

## Environments

The UI uses three short codes that map onto API/Mongo names. The frontend's single source is the `ENVS` table in `frontend/src/domain/environments.ts` (`{ code, api, label }`; `ENV_CODES`, `ENV_TO_API` / `API_TO_ENV` and `envLabel()` derive from it); the API's is `api/src/config/environments.js` (names + scheduler offsets). A new environment is one entry in each.

| UI | API path & Mongo collection |
|---|---|
| `dev` | `development` → `applications_development` |
| `hml` | `staging` → `applications_staging` |
| `prd` | `production` → `applications_production` |

## Seed data

`mongo-seed.js` seeds 10 sample applications across the three collections, all in the `Dream team` orbit. It runs only on first boot of an empty `mongo_data` volume (it is mounted into `docker-entrypoint-initdb.d`, and `MONGO_INITDB_DATABASE=orbital` makes the entrypoint run it against `orbital`), so re-seeding means dropping that volume.
