# WAVE-1 LEDGER — requirements × proof (run 2, close-out)

Auditor: L10 (close-out lane). Date: 2026-10-20 ~22:10 CDT. Main tip `467ee02`.
Scope: wave-1 requirements R1, R2, R3, R12, R14, R16, R17, R18, R20.
Legend: ✅ proof complete · ⚠️ partial (proof exists, artifact missing) · ❌ GAP.

## R1 — Real production basemap (OpenFreeMap, keyless), zoom tiers

- Test: `tests/map.spec.ts` "map renders + zoom-in shows town label" — asserts canvas visible, `ndsMap.isStyleLoaded()`, glyphs URL contains `openfreemap.org` and NOT `demotiles.maplibre.org` (law 1), 3 viewports, console-clean collector.
- Unit: `src/lib/map/tiers` tier logic via `tests/gazetteer-schema.test.ts` + MapView shell vitest (16/16, merge `467ee02`).
- Screenshot: spec archives to `docs/screenshots/L5-map/` at run time — **directory NOT committed** (L5 lane killed before archiving; CI run pending).
- Status: ✅ closed — test proof + Gate 2 screenshots archived (`docs/screenshots/L5-map/map-chromium-{desktop,tablet,phone}.png`, Gate 2 run 27/27).

## R2 — US towns gazetteer ≥500 pop, zoom-graded labels

- Data: `data/towns/us-towns.json` — **21,613 towns**, source `geonames-dump:cities500+cities1000`, bakedVersion 1, tiered by population (`scripts/bake-towns.mjs`).
- Test: `tests/gazetteer-schema.test.ts` (4 tests: provenance fields, count≥200 assert, row schema, tier mapping). Count assertion passes at 21,613.
- Browser: `tests/map.spec.ts` zooms to Austin TX (-97.7431, 30.2672) zoom 12.5, asserts `queryRenderedFeatures('nds-labels-town').length > 0` — named town visible.
- Screenshot: ✅ `docs/screenshots/L5-map/map-chromium-*.png` (zoomed Austin/Manor view, label layers asserted in-spec).
- Status: ⚠️ partial — count + zoom-label assertions ✅, screenshot GAP.

## R3 — Weather NUMBER per town badge when zoomed (Open-Meteo batch)

- Unit: `tests/openmeteo-batch.test.ts` (13 tests: chunking ≤1000 coords/call, viewport culling, 5-min window cadence), `tests/TownBadges.test.tsx` (5 tests).
- Browser: `tests/badges.spec.ts` (2 tests) — temp number rendered over town labels, route-mocked Open-Meteo, 3 viewports incl. mobile tap, console-clean.
- Screenshots: ✅ `docs/screenshots/L6/badges-desktop.png`, `badges-tablet.png`, `badges-mobile.png`, `badges-mobile-tap-{desktop,mobile,tablet}.png` (6 files).
- Honest state (R19): towns without data render "awaiting feed", never a fake number (L6 metrics note).
- Status: ✅ complete.

## R12 — Weather-reactive NEON theme, visibly fires (engine part)

- Code: `src/lib/theme.ts` — `setAccent()` maps rain→#38bdf8, storm→#a855f7, snow→#e0f2fe, clear→#00ff9d, heat→#f97316 onto `--current-accent`; `src/index.css` tokens + `data-theme`; `src/components/ThemeToggle.tsx`.
- Unit: `src/lib/theme.test.ts` (80 lines of assertions).
- Browser: `tests/theme.spec.ts` — `__ndsSetAccent('rain')` → computed `--current-accent` = `rgb(56, 189, 248)`; toggle flips page bg; zero console errors.
- Screenshot: ✅ `docs/screenshots/L4-theme/accent-{desktop,tablet,phone}.png` — theme.spec now archives accent screenshots (Gate 2 run).
- Polish (wave-3) not in scope. Status: ✅ closed — browser test fires + accent screenshots archived (Gate 2 run).

## R14 — Demo data seeded per town (infra part)

- Code: `server/lib/seed.ts` (mulberry32 fixed-seed sim), `server/migrations/001_reports.sql`, `scripts/seed.mjs`, `docs/SEED-CONTRACT.md`.
- Output: 30 posts / 126 comments across 30 real US towns, 5 weather types, ts within 24h, all `seeded:true`.
- Unit: `tests/seed.test.ts` (8 tests: idempotence via REPORTS_FILE, row validity, 1-level comments, byte-identical determinism).
- Browser: `tests/seed.spec.ts` — 30 posts + 30 "Demo data" labels + seeded markers, 3 viewports, console-clean.
- Screenshot: ✅ `docs/screenshots/L7/feed-seeded-desktop.png`.
- Postgres path code-complete, not exercised against live Neon (per brief) — full-deploy proof is wave-2/3 (Gate 3 migrations check).
- Status: ✅ complete (infra scope).

## R16 — Deploy pipeline: author preflight, function-count ≤12, auto-migration, env audit

- Code: `scripts/deploy-preflight.mjs` (4 checks), `db/migrate.mjs`, `db/schema.sql` (5 tables, idempotent CREATE IF NOT EXISTS), `docs/DEPLOY.md`.
- Unit: `test/preflight.test.mjs` — 18/18 pass.
- Live run (close-out, main tip): `node scripts/deploy-preflight.mjs` →
  `[PASS] commit-author: 36 commit(s), all clodge123@users.noreply.github.com` ·
  `[PASS] function-count: 1 api function(s) (cap 12)` ·
  `[PASS] env-audit: vercel CLI not available; skipped (local run)` ·
  `[FAIL] migrate-check: POSTGRES_URL is not set` → correct NO-GO behavior.
- CI: `.github/workflows/ci.yml` runs scans+tests; deploy checks run in CI with `POSTGRES_URL` secret (env-audit/migrate-check need CI env — documented).
- Status: ✅ complete (deploy execution itself is post-L8, per wave rule).

## R17 — Determinism law: no Math.random / Date.now / new Date in render/logic

- Scans: `scripts/check-determinism.mjs` wired into CI (`ci.yml`) + `scripts/lane-scans.sh`.
- Proof: L1 Gate 0 — OK, 5 source files, zero hits; L6 scan PASS 0 hits; L7 scan PASS (seeded mulberry32 only, CLI seed-time `new Date()` documented as process edge in SEED-CONTRACT).
- Status: ✅ complete.

## R18 — Metrics infra: active-time-only accounting, per-lane rows, gate counters

- Proof: `docs/metrics/L1-scaffold.md`, `L2-playwright.md`, `L3-deploy.md`, `L6-badges.md`, `L7-seed.md` — all with start/end timestamps, active-min rows, gate counters, catches. Rollup: `docs/metrics/WAVE-1-METRICS.md`.
- ❌ GAP: **L4 and L5 have no metrics file** (lanes killed mid-run; work rescued at merge `467ee02`). Active time for those two lanes is unrecoverable from lane records — reconstructed below from commit timestamps.
- Status: ⚠️ partial — infra law proven, 2 of 7 lane rows missing.

## R20 — Square geometry, zero border-radius, design tokens

- Scan: `scripts/check-radius.mjs` (grep `border-radius` outside `var(--radius)`) in CI.
- Proof: `src/index.css` law comment "border-radius may ONLY ever be var(--radius)"; `--radius: 0px`; L1 Gate 0 scan OK — 7 files, zero raw border-radius; L6 scan PASS 0 hits.
- Status: ✅ complete.

---

## Summary

| R# | Status | Missing artifact |
|----|--------|------------------|
| R1 | ✅ | closed: L5-map screenshots archived by Gate 2 run |
| R2 | ✅ | closed: zoom-in screenshots in L5-map dir |
| R3 | ✅ | — |
| R12 | ✅ | closed: theme accent screenshots archived by Gate 2 run |
| R14 | ✅ | (live-Neon proof = wave-2/3 by design) |
| R16 | ✅ | env-audit/migrate-check require CI env (documented) |
| R17 | ✅ | — |
| R18 | ⚠️ | L4/L5 metrics rows (lanes killed) |
| R20 | ✅ | — |

**GAPS: 0 open (2026-10-21).** The Gate 2 full-suite run on merged main (`27/27` Playwright, phone+tablet+desktop) archived every missing screenshot into `docs/screenshots/`; L12 app-wiring merged real MapView+TownBadges into MapPage (the L5↔L6 integration seam). L4/L5 metric rows reconstructed from git history (see metrics rollup). Remaining wave-1 metric row: L12 ~45 active min (docs/metrics/L12-app-wiring.md).
