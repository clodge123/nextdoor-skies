# L7 SEED-DEMO-INFRA — metrics (run 2, wave 1)

Active running time only (fleet gaps excluded). Lane started ~20:02 CDT.

| Row | Value | Notes |
|-----|-------|-------|
| Active wall-clock | ~35 min | npm install ~1 min, build+tests iterations ~15 min, docs/commit ~15 min |
| Commits | 1 (ac4c518) | survival commit at ~26 min (< 10 min cap: first code committed in-session; amend fixed tracked tmp/test-results) |
| Gate 0: tsc/build exit 0 | PASS | `npm run build` (tsc -p tsconfig.build.json) |
| Gate 0: vitest green | PASS | 8/8 tests, 1 file — seed-once idempotence (REPORTS_FILE), row validity (coords/types/ts), comments 1-level, determinism byte-identical |
| Gate 0: determinism scan | PASS | zero Math.random / Date.now() / new Date() clock reads in server/; mulberry32 fixed-seed sim only; CLI `new Date()` is process-edge seed time (documented SEED-CONTRACT) |
| Gate 0: no crypto-weather-central imports | PASS | zero cross-repo imports |
| Gate 1: Playwright | PASS 3/3 | tests/seed.spec.ts desktop 1280×800, tablet 768×1024, phone 390×844; asserts 30 posts, 30 "Demo data" labels, seeded=true markers, town text, weather types, one-level comments, zero console errors |
| Screenshot archived | docs/screenshots/L7/feed-seeded-desktop.png | desktop project |
| Seed output | 30 posts / 126 comments | 30 real US towns, 5 weather types, ts within 24h of seed time, all seeded:true |
| Defects caught | 1 | Playwright fetch failed on about:blank (relative /api/reports) → fixture serves page+API from routed origin |
| Interventions | 0 | |
| Files added | server/lib/seed.ts, server/migrations/001_reports.sql, scripts/seed.mjs, docs/SEED-CONTRACT.md, tests/seed.test.ts, tests/seed.spec.ts, tests/fixtures/feed-page.ts, playwright.config.ts, vitest.config.ts, tsconfig{,.build}.json | package.json extended (devDeps + scripts) |

## Known limits / handoffs

- Postgres path (seedPostgres) is code-complete + migration SQL shipped, but
  not exercised against live Neon in this lane (no prod DB in tests, per brief).
  Wave 3 deploy smoke exercises it (Gate 3 migrations check).
- Feed fixture is a labeled stand-in for the wave-2 feed UI; the seeded:true →
  "Demo data" badge contract is the handoff (SEED-CONTRACT.md §3).
- api/probe.js untouched (rule). No deploy (rule).
