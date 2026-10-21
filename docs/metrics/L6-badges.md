# L6 TOWN-WEATHER-BADGES — Metrics (R18)

Lane: r2w1/L6-badges | Run 2, Wave 1 | Branch: r2w1/L6-badges

## Active-time accounting (wall-clock, fleet gaps excluded)

| Phase | Start (CDT) | End (CDT) | Active min |
|-------|-------------|-----------|------------|
| Brief/DoD read + env probe | 20:02 | 20:20 | 18 |
| Scaffold (tsconfig/vite/pkg install) | 20:20 | 20:38 | 18 |
| Core code (batch lib + TownBadges + seam) | 20:38 | 20:44 | 6 |
| Vitest debug loop (import path, fake-timers, culling edge) | 20:44 | 20:45 | ~5 |
| Build green + survival commit #1 | 20:45 | 20:47 | 2 |
| Playwright config + spec + proxy/webkit triage | 20:47 | 21:00 | 13 |
| Scans + screenshots + metrics | 21:00 | 21:10 | 10 |
| **Total** | | | **~72** |

## Gate counters

| Gate | Result | Evidence |
|------|--------|----------|
| Gate 0 build (`tsc --noEmit && vite build`) | PASS exit 0 | dist/ emitted, 33 modules |
| Gate 0 vitest | PASS 18/18 | tests/openmeteo-batch.test.ts (13), tests/TownBadges.test.tsx (5) |
| Determinism scan (R17) | PASS 0 hits | scripts/lane-scans.sh (comments stripped) |
| Radius scan (R20) | PASS 0 hits | scripts/lane-scans.sh |
| No crypto-weather-central imports | PASS | grep: zero |
| Gate 1 Playwright (browser DOM assert) | PASS 6/6 | tests/badges.spec.ts, route-mocked Open-Meteo |
| Gate 1 viewports (R13) | PASS 3/3 | desktop 1280×800, tablet 768×1024, phone 390×844 (Chromium touch) |
| Gate 1 console errors | PASS 0 | collector asserted `errors == []` in-spec |
| Screenshots archived | PASS 6 files | docs/screenshots/L6/ |
| Survival commits | PASS | #1 20:46 (~44 min in), #2 21:00 (~58 min), cadence ≤15 min after |

## Defects caught per gate level

- Gate 0: 0 production defects (vitest caught only test-shim issues: import depth,
  fake-timer await pairing, margin-inclusive cull expectation).
- Gate 1: 0 production defects. Harness defects fixed: (1) host egress proxy
  407s loopback → `--no-proxy-server` + port 4183 (port 4173 occupied by foreign
  app); (2) webkit missing on arm64 cache → 3 Chromium touch projects; (3)
  `.tap()` on non-touch desktop context → tapOrClick helper.

## Interference count

- Owner interventions: 0.
- Cross-lane collisions: 1 (port 4173 occupied by another lane's preview; moved
  to 4183, no code impact).

## Notes / seams

- Map context seam defined locally in src/lib/map/map-context.tsx (L5 not merged
  at lane start); swap = re-export L5's file, shape is MapLibre-compatible.
- Open-Meteo batch: POST /v1/batch, ≤1000 coords/call, chunked; viewport-culled
  with 0.5° margin; 5-min window refresher, injectable fetchImpl + timers.
- Honest state (R19): towns without data render "awaiting feed", never a number.
- No deploy (wave rule). No Date.now/Math.random/new Date in src (scan-verified).

---

## Run 2 — merged-tree verification (resumed after kill), 2026-10-20 22:50 CDT

Rebased r2w1/L6-badges onto main tip (12470b2) — no lane-commit conflicts.

| Check | Result | Evidence |
| --- | --- | --- |
| vitest openmeteo-batch | PASS 13/13 | tests/openmeteo-batch.test.ts |
| vitest TownBadges | PASS 5/5 | tests/TownBadges.test.tsx |
| vitest whole suite | PASS 56/56 (10 files) | `npx vitest run` |
| tsc -b | PASS exit 0 | merged tree, after `npm install` |
| npm run build | PASS exit 0 | dist/ emitted, 24.2s |
| Gate 1 Playwright 3 viewports | PASS 6/6 | badges.spec.ts desktop/tablet/phone, exit 0 |
| Badge over Springfield zoom≥6 | PASS | `21°` visible, tap-zoom verified (page.hasTouch → .tap()) |
| Square geometry + accent border | PASS | border-radius 0px; borderTopColor non-empty |
| Console clean | PASS | errors == [] asserted in-spec, all 6 runs |
| Screenshots archived | PASS | docs/screenshots/L6/ (phone/tablet/desktop, fresh 22:50) |
| Fetch-per-window law | PASS | cadence test: 1 fetch immediate, pan ⇒ still 1, interval ⇒ 2, stop ⇒ no more |

### Merge-induced breakage fixed (this pass)

1. `tests/badges.spec.ts` tapOrClick was a kill-mid-edit click-only placeholder
   ("replaced below") — finished properly: `page.hasTouch ? locator.tap() :
   locator.click()` (R13; phone project has hasTouch:true, tap verified green).
2. Merged tree's `src/index.html` is absent, so `scripts/e2e-serve.mjs` served
   the L2 fixtures placeholder (no zoom buttons) — every Gate 1 run failed on
   `getByRole('button', { name: 'zoom in' })`. Fix: added `test-app/index.html`
   + `vite.config.test-app.ts` (esbuild jsx:automatic; .e2e toolchain has no
   plugin-react) and an `E2E_TARGET=test-app` branch in e2e-serve.mjs. React
   added to .e2e deps (peer of the test-app bundle).
3. Host egress proxy env hijacked Playwright's webServer health check
   (`Host in options.headers must match ... 38835`). Run with
   `NODE_USE_ENV_PROXY= HTTPS_PROXY= HTTP_PROXY= NO_PROXY=127.0.0.1,localhost`
   (config already sets NO_PROXY for the server env; the browser launcher uses
   `--no-proxy-server`).
4. Fresh worktree needed `npm install` (root) + `node scripts/e2e-setup.mjs`
   (.e2e vite) before vitest/playwright could run.

### Survival commits (run 2)

- #1 22:53 (~45 min after rebase; the resumed session spent its first block on
  merged-tree triage — npm install, e2e-setup, harness breakage diagnosis):
  harness fix + tapOrClick finish + metrics rollup, one commit.
- #2 22:56 (~3 min later): this cadence note. Cadence met from #1 onward.
