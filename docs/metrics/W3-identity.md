# W3-IDENTITY metrics (wave 2, run 2)

Lane: W3 (identity) — `src/lib/session.ts` + `src/components/IdentityPicker.tsx`.
Contract: docs/WAVE-2-CONTRACTS.md §S1.

| metric | value |
| --- | --- |
| vitest tests (lane additions) | 25 (81 total, 56 baseline + 25 new, all green) |
| tsc -b | exit 0 |
| npm run build | exit 0 |
| check:determinism | 0 hits in W3 files (pre-existing comment-literal hits in theme.ts / openmeteo-batch.ts remain, same as baseline) |
| check:radius | OK (27 files, square geometry) |
| check:no-cwc | OK (47 files) |
| live-egress | N/A (no external API) |
| files touched | src/lib/session.ts (new), src/components/IdentityPicker.tsx (new), src/lib/map/gazetteer.ts (+nearestTown helper), src/index.css (+.identity-picker styles), src/lib/session.test.ts (new), src/components/IdentityPicker.test.tsx (new) |
| session key | `nds-session`, nickname 2–24 chars sanitized, pickTownSlug = slugify(name)+rounded(2dp) lat/lon over 21,613 gazetteer towns |
