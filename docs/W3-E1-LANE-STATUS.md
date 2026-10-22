# W3-E1 — POLISH SEEDS (lane status)

Branch: `r3w3/E1-seeds` · tip base: `fe57636` (all round-1/2 lanes merged).

Survival commit: lane opened, author clodge123. Scope (brainstorm session 5):
recruiter-demo polish of the seeded data — metro demo towns (Springfield,
Salina, Amarillo, Flagstaff, Santa Fe) each get ≥1 snapshot post + ≥1
commented post + hot-pinned variety, region-authored weather narrative,
engagement top-up on new posts (fixed 3-8/0-3 pattern), DEMO-SCRIPT.md,
extended seed-determinism vitest + gated Playwright seed spec. NO prod
writes; verified against the REAL_API local harness.

## Delivered (2026-10-22)

- **Polish roster** (scripts/seed-wave2.mjs POLISH): 5 demo towns x 4 posts =
  20 new posts, plan index-stable 177 -> 197 (wave-2 indices byte-identical).
  Each town: storm-chase + heat + snow + fog authored texts, FIRST post
  carries a map snapshot. Engagement pattern extended (engagementTargetsFor):
  polish posts floor at >=1 comment (1 + i%3, strict subset of session-4
  0-3 law) so every demo-town post scores hot (score >= 5 >= HOT_SCORE_MIN).
- **scripts/polish-seeds.mjs**: deterministic local-harness seeder (full 197
  plan + fixture snapshots + engagement top-up), idempotent text-match skip,
  zero RNG/clock (R17). Fixture: scripts/gen-polish-snapshot.py regenerates
  tests/fixtures/polish-map.jpg (map-like basemap JPEG, variance 284 >> 16).
- **docs/DEMO-SCRIPT.md**: recruiter walkthrough (map -> icons/tint -> search
  fly-to -> town panel -> feed hot -> post detail/lightbox/share -> alerts ->
  palette -> tour E2) + post-deploy runbook (seed --db/--reseed/--engagement
  offsets; CI matrices extended seed-wave2.yml 40 shards, seed-wave3.yml 25).
- **Gates**: vitest 377/377 (12 seed-wave2 tests incl. 6 new polish tests:
  roster shape, index-stability, hot-at-seed, exact pattern, narrative themes,
  R17 scan of polisher); tsc -b clean; npm run build clean; ONE gated run
  REAL_API=1 scripts/e2e-gate.sh playwright tests/seed.spec.ts = 9/9 all
  viewports (C7 capture + Demo-data labels + NEW: demo towns show non-black
  snapshots + visible engagement pinned hot in the real-API harness).
- **No prod writes** (deploy law). Prod runs wave-2 code until wave-end; the
  merged seeder carries the polish roster for the post-deploy seed runs.

## Deviations

- Snapshot payloads in the local harness use the committed deterministic
  basemap fixture (no live WebGL in api-serve); live map capture stays in
  the CI seeder path (--reseed). Documented in DEMO-SCRIPT + polisher header.
- Reseed offsets for the 5 new towns are TOWN indices 20..24 (metro roster
  grows 20 -> 25); CI matrix extended accordingly.
