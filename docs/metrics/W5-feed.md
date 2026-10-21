# W5-FEED metrics (wave 2, run 2)

Lane: r2w2/W5-feed — real per-town feed (contracts §S1–S4, §S7).

| metric | value |
| --- | --- |
| started | 2026-10-21 ~11:12 CDT |
| first survival commit | 6a2d8b8 |
| files touched | FeedPage.tsx, lib/feed.ts, lib/snapshot.ts, components/FeedPostCard.tsx, components/FeedComposer.tsx, components/IdentityPicker.tsx, MapView.tsx (1 line), index.css (feed styles), App.test.tsx, tests/feed.spec.ts, lib/feed.test.ts, lib/snapshot.test.ts, docs/metrics/W5-feed.md, docs/screenshots/W5/ |
| unit tests | 35 (client parsing, hot ordering, optimistic reactions, snapshot size cap, honest empty state) — full suite 88 passed / 13 files |
| e2e spec | tests/feed.spec.ts — 18 passed (6 tests × phone/tablet/desktop), console-clean, 2.7m |
| gates | vitest ✅ · tsc -b ✅ · npm run build ✅ · gated playwright ✅ (e2e-gate.sh, exit 0) · radius ✅ · no-cwc ✅ · determinism: my files clean (pre-existing comment-only hits in theme.ts/openmeteo-batch.ts/placeholder FeedPage.tsx predate this lane) |
| screenshots | docs/screenshots/W5/ (18 png: render, sort-new, reaction, reply, empty, identity × 3 viewports) |
| deviations | MapView seam is `canvasContextAttributes: { preserveDrawingBuffer: true }` (maplibre v5 nests the flag; the flat key isn't in MapOptions). IdentityPicker is a feed-local gate mirroring S1 shape (W3 owns the canonical session.ts; structural mirror keeps this lane unblocked). No API server exists yet (W4 owns it) — app talks to the S2-S4 contract, e2e mocks it. |

## Gate log

- 2026-10-21 12:43 vitest full suite: 13 files / 88 tests passed.
- 2026-10-21 12:49 tsc -b exit 0; npm run build exit 0.
- 2026-10-21 12:55 scripts/e2e-gate.sh npx playwright test tests/feed.spec.ts: 18 passed, PW_EXIT:0. No leaked chrome-headless procs from this run.
