# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

Open `index.html` directly in a browser — no build step or server required. The app runs entirely client-side.

`support.js` is generated from `dc-runtime/src/*.ts` and must not be edited by hand. To rebuild it: `cd dc-runtime && bun run build`.

## Architecture

**Orbital** is an application health-monitoring dashboard. Applications appear as planets in a D3.js orbital visualization; planet brightness reflects the most recent health check result. The UI is in Brazilian Portuguese.

The project uses the **dc-runtime** system — a lightweight React-based template engine bundled into `support.js`. All application markup and logic lives in `index.html` inside an `<x-dc>` element.

### dc-runtime template conventions

- `{{ expression }}` — interpolates a state value or method reference in the template
- `<sc-if value="{{ condition }}">` — conditional rendering
- `<sc-for list="{{ list }}" as="item">` — list rendering
- `ref="{{ refName }}"` — exposes a DOM element as `this.refNameEl` on the component class
- `style-hover="..."` / `style-focus="..."` — pseudo-state inline styles
- `<helmet>` — injects content into `<head>`
- `<script type="text/x-dc" data-dc-script>` — component logic; the class must extend `DCLogic`

Component state lives in `this.state = {}` and updates via `this.setState(nextState, callback?)`.

### Data persistence

State is saved to `localStorage`:
- `orbital-apps-v1` — application registry
- `orbital-theme-v1` — `'dark'` | `'light'`
- `orbital-rate-v1` — health-check interval in seconds

Seed data (10 sample apps) loads only when `localStorage` is empty.

### Design system — Nocturne (`_ds/nocturne-*/`)

- `styles.css` is the only stylesheet; always link it and use its CSS variables — never hard-code hex values, font names, or raw px values the tokens already carry.
- `_ds_bundle.js` activates the design system's React components.
- `_ds_manifest.json` and `readme.md` document available components and tokens.
- Color tokens follow OKLCH tonal ramps (`--color-neutral-100`…`900`, `--color-accent-*`). On the dark ground use steps 700–900 for fills and 100–300 for text on those fills.
- Component classes: `.btn`, `.tag`, `.field`, `.card`, `.nav`, `.table`, `.dialog`, `.lighten` (image blend wrapper).
- Icons: Phosphor (https://phosphoricons.com).
- Fonts: Inter (body/headings) + JetBrains Mono (monospaced labels).

### External dependencies (CDN)

- `d3@7` — orbital visualization (`drawStars`, `drawClouds`, `drawOrbits` methods)
- Google Fonts — Inter + JetBrains Mono
