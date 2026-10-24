# Research: map clutter + snapshot fidelity (owner bug-fix round, 2026-10-23)

Two problems from the demo screenshots: (1) ~100 "awaiting feed" badges cover
the US view; (2) feed snapshots look like continental blobs, not the town the
post is about. How do shipping apps solve these?

## A. Weather/map clutter — who does what

1. **Windy** — the entire viewport is a *color field* (wind/temp gradient);
   "almost no chrome", every control floats over the data. No per-city temp
   labels at low zoom at all.
   <https://swipefile.design/ref/windy-map/>
2. **Weather Underground WunderMap** — interactive map + radar/overlay
   layers; point data appears as station dots, not text badges, at
   country scale. <https://www.wunderground.com/wundermap>
3. **Mapbox/MapLibre (the engine we already run)** — the platform answer is
   *collision detection*: symbol layers place labels with anchors tried in
   order and DROP labels that collide; layers carry per-zoom `minzoom`
   visibility. "Optimize map label placement" is a first-class feature, not
   custom code.
   <https://docs.mapbox.com/help/dive-deeper/optimize-map-label-placement/>
   <https://docs.mapbox.com/style-spec/reference/layers/>
4. **Google Maps pattern** — zoom-dependent density: country view shows
   ~15 city names, each zoom tier adds points, clusters collapse the rest;
   you never see hundreds of pins at once. (Standard slippy-map tiering,
   mirrored in our `tiers.ts`.)
5. **Common law across all of them**: *data density tracks zoom*, and
   *nothing renders without data* — a label/temperature is drawn when it has
   a value, not a "loading…" placeholder.

### Our root causes (code, not vibes)

- **Clutter**: `badgesForZoom` (W4-B2 zoom-match) renders a badge for EVERY
  town whose *label* band contains the zoom. State tier = z4-6 = 341 towns,
  city tier = z7-9 = 4,328 towns. At z5 over the US, hundreds of state-tier
  towns qualify → no cap, no collision check.
- **"Awaiting feed" forever**: the weather refresher only supplies towns
  when `zoom >= 9` (MapPage), and the server gate is `MIN_ZOOM = 9`
  (api/weather.js) — but badges render from z4. Every badge between z4 and
  z9 can never receive data. The two gates disagree.

### Fix (mirrors the research)

- One gate, not two: refresher + server supply weather for exactly the
  towns whose badges are visible (zoom-match), floor z4. No badge without a
  possible feed.
- Population cap per frame (`MAX_VISIBLE_BADGES = 40`): the map shows the
  biggest towns at any zoom, like Google's tiering — the zoom-match law
  stays, density gets bounded.
- Badges render ONLY when data exists (fade-in law already exists; drop the
  "awaiting feed" text render for towns with no data — the chip is hidden
  until live, so the map stays clean while loading).

## B. Snapshot fidelity — who does what

1. **CARTO Static/raster** — the canonical "take a picture of this exact
   map view" service: raster tiles to z14+, free tier 5M tiles/mo, ToS
   explicitly permits static images *with legible attribution in the image*.
   <https://carto.com/basemaps/>
   <https://carto.com/legal/basemap-terms/>
2. **Static Maps APIs** (CARTO/Google) — same shape we need: center + zoom
   in, PNG/JPEG out.
   <https://cartodb.github.io/developers/maps-api/guides/static-maps-API/>

### Our root cause

`api/snapshot.js` fetches `tiles.openfreemap.org/natural_earth/ne2sr`, whose
pyramid ends at **z6**. A z11 capture request is clamped to z6 → the JPEG is
a continental view, not the town. (Verified live: z11 ne2sr = 404,
basemaps.cartocdn.com/light_all z11 = 200 PNG.)

### Fix

- Tile source → `https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`
  (256px tiles, z-cap 12), center EXACT, zoom honored.
- Attribution burned into the strip per CARTO ToS: "© CARTO © OpenStreetMap".
- Variance gate + loud-502 law unchanged (no black images ever).

## VERDICT

Copy, don't invent: single zoom-match weather gate + pop cap (Google/Mapbox
model), CARTO raster tiles z12 + burned attribution (CARTO Static Maps
model). Both fixes touch 6 files; laws preserved (zoom-match, variance gate,
honest states, square geometry).
