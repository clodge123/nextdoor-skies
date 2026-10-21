# W1 WEATHER-PROXY — wave 2, run 2 metrics

Lane: r2w2/W1-weather (branch r2w2/W1-weather @ main tip f869035)
Brief: fix the Open-Meteo `/v1/batch` 404 — badges stuck on "awaiting feed".

## Timeline (CDT)

| metric | value |
| --- | --- |
| start | 11:11 |
| first survival commit | 11:47 (~36 active min) |
| wall-clock cap | 4h |

## Catches / findings

1. **`units=imperial` is a NO-OP on Open-Meteo `/v1/forecast`** (live probe
   2026-10-21): the API answers in °C and labels the unit in
   `current_units.temperature_2m`. The proxy TRUSTS THE RESPONSE LABEL
   (convert °C→°F, pass °F through, degrade on anything else) instead of
   believing the request param. This is the R19 honest-data law.
2. **Test bbox contained zero baked towns** — the geonames Springfield, IL
   sits at (39.8017, -89.6437); the original test window (39.77..39.79)
   missed it. Fixed coordinates in weather-proxy.test.ts.
3. **vitest/jsdom rewrites `import.meta.url`** for api/*.js — loadTowns falls
   back to `process.cwd()/data/towns/us-towns.json` (repo root in both vitest
   and Vercel serverless contexts).
4. **Contract deviation (documented):** brief says api/weather.js should
   "use lib/map/gazetteer helpers". Serverless runs plain .js;
   src/lib/map/gazetteer.ts is TS and can't be imported without a bundling
   step. Exact pure-function mirrors (slugify/townId/townsInBbox) live in
   api/weather.js, kept behavior-identical to MapPage.tsx.
5. **Playwright stubs retargeted**: badges.spec.ts + map.spec.ts stubbed the
   dead `/v1/batch` POST; now they stub GET `/api/weather?…` (S5 shape).
   badges.spec zoom clicks bumped 1→2 (MapView steps +3/click; zoom-9 grade
   needs 3→6→9). TOWN_BADGE_MIN_ZOOM untouched (already 9 on main).
6. **Stub must resolve real towns**: a fixed-id stub matched no baked slug →
   temps never applied. The spec stub now mirrors api/weather.js (bbox →
   townsInBbox over us-towns.json → slug-keyed F temps). Zoom-9 viewports are
   ~3.5° wide and the default center sits between baked towns, so MapPage
   gained a `?ndsCenter=` test hook (production default unchanged).
7. **Determinism scanner (check:determinism) flags COMMENT TEXT** containing
   the forbidden literals — pre-existing on main (exit 1 there too). All my
   source comments were reworded so my files contribute ZERO hits.
8. **e2e-setup.mjs replaces root node_modules with a symlink** to
   .e2e/node_modules, which breaks vitest/tsc. Restored via npm install;
   browser runs work with root node_modules + playwright browsers cache.

## Gate results

| gate | result |
| --- | --- |
| npm install | ok (node 24, engines note) |
| npx vitest run | 76/76 green, 11 files (baseline 56); 175/175 after merge-main integration check |
| tsc -b | exit 0 (pre- and post-merge) |
| npm run build | exit 0 (pre- and post-merge) |
| check:radius / check:no-cwc | OK (post-merge: 36 / 61 files) |
| check:determinism | my files 0 hits (main baseline exits 1 on comment text — pre-existing) |
| live-egress assertion | PASS — see below |
| Playwright (gated) | badges desktop+phone PASS, map desktop+tablet PASS, full suite 26/27 (1 flaky style-load timeout, passed on re-run) |

## Live-egress proof (Gate 1, mandatory)

```
$ node scripts/live-egress-check.mjs
live-egress: GET https://api.open-meteo.com/v1/forecast?latitude=39.7817&longitude=-89.6501&current=temperature_2m&units=imperial
live-egress: HTTP 200 (503 ms)
live-egress: PASS current.temperature_2m=22.8 °C -> 73.0 °F (Springfield, IL)
```
