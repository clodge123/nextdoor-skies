# W4-D2 SNAPSHOT-OVERLAY — Closeout (wave 4, round 2)

Branch `r4w4/D2-snap-overlay` @ base main tip `0615b69`.

## Delivered

1. **Composer capture flow** (`src/components/FeedComposer.tsx`,
   `src/lib/snapshot-overlay.ts`): CAPTURE button POSTs `/api/snapshot`
   (session-gated, D1 merged) at the session-town coords + zoom 11 (server
   clamps raster to z6). Town chip renders in the composer row; a slug with
   no coordinate tail disables capture + shows a loud chip error (never a
   guessed center).
2. **V1 bottom-bar burn-in ONCE at upload, client-side** (S7#3/D1 deviation
   "D2 owns the strip"): `burnInStrip()` draws the clean map JPEG onto the
   640×360 canvas, paints the bottom bar (town · time · °F · weather glyph),
   re-encodes JPEG walking the quality ladder to fit the wave-2 120 KB data-
   URL seam. Temp goes through `formatTemp()`/`getUnit()` (units law, F
   default, follows the header toggle). Time = response `date` header (server
   clock edge) via pure epoch math (R17-safe: no Date/new Date in src).
   Weather = `/api/weather` proxy (temps F → C → formatTemp; WMO code →
   canvas-drawn lucide-mirror glyph; missing temp = "—°F", missing code =
   no icon, honest).
3. **Post image = real map image, NEVER black**: the burned JPEG rides the
   post as the inline data URL (wave-2 storage seam) so feed cards + post
   detail render it directly; `snapshotId` is stored alongside as provenance
   (validated loud-400 server-side). `api/posts.js` precedence: inline
   burned snapshot wins the render ref, snapshotId-only posts (API clients,
   seeds) render `GET /api/snapshots?path=<id>` — the D1 contract is
   untouched for them.
4. **C-03 author-below**: `FeedPostCard` + `PostDetailPage` meta row (author
   link → /p/<id>, timestamp, town, hot badge) moved BELOW the image in DOM
   order; burned text is not in the image.
5. **Loud errors, zero fallbacks**: capture 502 shows the exact S7#4 message
   "snapshot failed — post without image, or retry" + RETRY +
   POST-WITHOUT-IMAGE; a broken feed image swaps to a loud error card
   (never a black placeholder); 401 → loud identity prompt.

## Gates

- vitest: full suite **504/504 (46 files)** — new: `src/lib/
  snapshot-overlay.test.ts` (URL builder, strip layout, burn-in ladder,
  requestSnapshot error states, epoch math, units), `src/components/
  FeedComposer.test.tsx` (capture→post payload, 502 loud path, town chip),
  `src/components/FeedPostCard.test.tsx` (author-below DOM order, broken-
  image loud card), `tests/snapshot-compositor.test.ts` (inline+id
  precedence case).
- tsc -b clean; vite build clean (chunk-size warning pre-existing).
- check:all (determinism/radius/no-cwc) clean.
- Playwright ONE gated run (`REAL_API=1 scripts/e2e-gate.sh npx playwright
  test tests/snapshot-overlay.spec.ts`) — **6/6 PASSED** (phone/tablet/
  desktop × happy-path + loud-502 path, 2.5m). Burned image variance
  measured 2720.2 (bar ≥16) with neon-strip fraction > 0.01, author/time
  below the image verified by bounding boxes, zero console errors.

## Deviations (honest)

- **Strip burn-in is client-side, upload-time** (per D1 contract Deviations:
  "D1 returns the clean map JPEG; D2 burns the strip client-side before the
  feed render"). Determinism: same tiles + same weather + same clock-header
  → same pixels; the strip time derives from the server `date` header, not
  the client clock.
- **Weather glyph = canvas vector** mirroring `weathercodeToIcon` buckets
  (lucide React components don't rasterize into a canvas; the WMO→bucket
  mapping is shared, glyphs hand-drawn neon-green, theme-neutral).
- **Capture zoom fixed at 11** (S7 "~12", server clamps to 6) — no per-post
  zoom UI queued this round; lat/lon/zoom stored per post.
- **Post payload carries BOTH burned inline JPEG + snapshotId** — the
  snapshotId-only render path (feed `<img src=/api/snapshots?...>`) exists
  via api/posts.js and renders identically for API-created posts.
- **Town chip is session-town** (composer flow S7#5 defaults to current
  view ≈ session town); map-center picking + nearest-town resolution is
  E1/map-lane surface, not wired here.
