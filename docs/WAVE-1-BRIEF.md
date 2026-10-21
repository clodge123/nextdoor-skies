# NEXTDOOR SKIES — RUN 2 — WAVE 1 BRIEF (FOUNDATION)

Status: DRAFT FOR OWNER SIGN-OFF — no lanes launch until GO.
Owner: Gary Lodge. Orchestrator: main agent. Fleet: up to 7 agents + orchestrator.
Repo: github.com/clodge123/nextdoor-skies (private, run 2). Run 1 archived:
github.com/clodge123/nextdoor-skies-run1.

## Mission

Lay an unbreakable foundation so waves 2 and 3 never discover wave-1 problems.
Every requirement below is numbered (R#) and must be verifiable by a browser
test, a screenshot, or a deploy artifact. The requirements ledger IS the
source of truth for "what got lost along the way" — nothing closes without
its proof line.

## Requirements ledger (run 2, all waves)

| ID | Requirement | Wave | Proof required |
|----|-------------|------|----------------|
| R1 | Map renders a real production basemap (OpenFreeMap, keyless), zoom tiers country→state→city→town | 1 | Browser screenshot at 4 zoom tiers |
| R2 | US towns gazetteer: all US places ≥500 pop (GeoNames), zoom-graded labels | 1 | Count assertion + zoom-in screenshot showing a named town |
| R3 | Weather NUMBER visible per town badge when zoomed (Open-Meteo batch, keyless) | 1 | Browser asserts temp text on badge |
| R4 | Per-town feed pages = primary social surface; map is home | 2 | Browser: click town → popup latest comments → town page |
| R5 | Nextdoor-style feed: scrollable, infinite scroll, timestamps, author, reactions | 2 | Browser scroll-through test |
| R6 | Composer: post with location auto-set; NO user photo uploads | 2 | Browser post flow |
| R7 | AUTO map-snapshot image on every post: server-rendered map tile at post coords, stored Vercel Blob | 2 | Browser asserts <img> shows the location |
| R8 | One-level comments (post → replies) | 2 | Browser reply test |
| R9 | Reactions + flags + rate limiting (run-1 mechanics, hardened) | 2 | Browser + API tests |
| R10 | NWS alerts via SERVER PROXY (User-Agent header works server-side only) | 2 | Browser: banner renders real alerts, no 403 |
| R11 | Radar layer (RainViewer) opt-in, timeline scrubber | 3 | Browser toggle test |
| R12 | Weather-reactive NEON theme: rain→cyan/blue, storm→purple, snow→ice-white, clear→neon green, heat→orange/red. MUST visibly fire | 1 (engine) + 3 (polish) | Browser test: mock weather change → accent CSS var changes |
| R13 | Responsive EQUAL: desktop, tablet, phone. Mobile-first quality bar. | 1 (tokens) + all | Every gate runs 3 viewports |
| R14 | Demo data seeded per town (app is never empty) | 1 (infra) + 2 (content) | Fresh prod deploy shows seeded posts per town |
| R15 | Account-less identity: device-token proves authorship (edit/delete own posts) | 2 | Browser: post, edit, delete from same device |
| R16 | Deploy pipeline: commit-author preflight, function-count ≤12 check, auto-migration, env-var audit | 1 | CI gate runs all four checks |
| R17 | Determinism law: no Math.random / Date.now / new Date in render/logic paths | 1 | Static scan gate (CI) |
| R18 | Metrics infra: active-time-only accounting, per-lane rows, gate counters | 1 | Metrics file written per lane |
| R19 | Honest states: real data or explicit "awaiting feed" — never lookalike fallbacks | all | Code review + browser test per surface |
| R20 | Square geometry, zero border-radius, design tokens (anti-slop signature) | 1 | Static scan + screenshot review |

## Design laws (baked into architecture, not TODO items)

Run-1 autopsy fixes, promoted to law:
1. Production basemap only (no demotiles CDN).
2. Fetch per ~5-min window, NOT per pan (no refetch storms, no overlay flicker).
3. Last-data-wins loading: keep showing last result while polling; `loading`
   only on first-ever fetch (no banner flicker).
4. Tile errors = warnings (count, don't flip UI to error); map status resets.
5. Forbidden browser headers (User-Agent) never relied on client-side — proxy.
6. Canvas resize only when size actually changes.
7. Coordinate-key debouncing (~0.005°) so panning can't storm subscriptions.

## Wave 1 lanes (7 lanes, parallel, smaller scope each)

- **L1 SCAFFOLD** — Vite + React + TS + Router, ESLint/Prettier, vitest, CI
  (tsc/eslint/build/vitest), determinism + radius static scans (R17, R20).
- **L2 PLAYWRIGHT-HARNESS** — Playwright wired day 1: config, desktop+tablet+
  phone projects, console-error collector, screenshot archiving, CI job.
  Nothing merges after this lane without a browser test. (Gate foundation.)
- **L3 DEPLOY-PIPELINE** — Vercel project (CLI deploys; owner links GitHub
  app), author-preflight script, function-count check, Neon env-var audit,
  auto-migration in deploy lifecycle, preview+prod URLs recorded. (R16)
- **L4 DESIGN-TOKENS-THEME** — index.css tokens, square geometry, light/dark,
  `--current-accent` weather mapping + setAccent API + browser test asserting
  the accent visibly changes. (R12, R20)
- **L5 MAP-SHELL-GAZETTEER** — MapLibre + OpenFreeMap style, zoom-tier control,
  GeoNames US towns ≥500 pop pipeline (fetch→bake→tiles/geojson), town labels.
  (R1, R2, laws 1, 2, 4, 7)
- **L6 TOWN-WEATHER-BADGES** — Open-Meteo batch (1000-coord calls), temp-number
  badges on town labels, zoom-graded. (R3)
- **L7 SEED-DEMO-INFRA** — seed-once mechanism keyed to towns, demo posts per
  town, migration SQL, honest "Demo data" labeling. (R14, R16 migration part)

## Wave 1 close-out gates (all mandatory)

1. All 7 lanes merged, full CI green.
2. Integration browser suite on dev server: home map renders, zoom to town,
   badge shows temp, theme fires, 3 viewports, zero console errors.
3. Deploy to production (new Vercel project).
4. Production smoke in real browser (Playwright + hands-on OpenClaw browser
   session): screenshots desktop/tablet/phone, console clean.
5. Ledger audit: every wave-1 R# has its proof line.
6. Retro doc + metrics rollup.
7. Owner review between waves (steering window).

## Constraints

- Free/keyless only (OpenFreeMap, GeoNames, Open-Meteo, RainViewer, NWS,
  Neon, Vercel Hobby). No paid services.
- ≤12 serverless functions (Hobby) — function-count gate enforces.
- Commit author: `clodge123 <clodge123@users.noreply.github.com>` (verified
  working credential; owner links GitHub→Vercel manually).
- No imports from crypto-weather-central.
- 4h cap per lane; survival commit ≤10 min then ≤15 min cadence.
- No OpenClaw auto-updates during waves (owner-enforced).
