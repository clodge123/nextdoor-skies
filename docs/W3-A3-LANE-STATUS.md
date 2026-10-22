# W3-A3 MAP TINT — lane status (mid-flight)

Host spawn broker saturated; exec calls rejected ("Spawn broker request
capacity exceeded") since lane start. **All lane files are written to the
worktree tree; NOTHING committed, NO gates run, branch NOT pushed.**

## Files written (uncommitted)
- `src/lib/weather/map-tint.ts` — core: `Condition`, `CONDITION_ORDER`,
  `conditionFromTempC` (documented temperature-band fallback + A2 seam),
  `dominantCondition` (mode, ties by CONDITION_ORDER, null = no data),
  `tintClassFor`, `TINT_MIN_ZOOM=9`, `TINT_OPACITY=0.12`.
- `src/lib/weather/map-tint.test.ts` — unit tests: bands, mode, visibility
  gating, non-finite filtering, tie-breaks, order-independence, classes,
  opacity/zoom constants.
- `src/components/MapTint.tsx` — overlay component (renders inside
  MapView's children so it sits in `.map-page`; null below zoom 9 / null
  condition; inline opacity 0.12; aria-hidden; deterministic).
- `src/components/MapTint.test.tsx` — component tests (stub MapLike like
  TownBadges.test.tsx): zoom gate, per-condition class, opacity law.
- `src/pages/MapPage.tsx` — wired `<MapTint towns={visible} temps={temps}/>`
  into MapBadges render (same viewport-filtered towns + temps stream).
- `src/index.css` — `.map-tint` overlay block appended: position:absolute,
  inset:0, pointer-events:none, 600ms transitions; 5 condition colors
  (clear warm #ffd9a0, overcast #8a93a3, rain #6b7f99, snow #dfeaf5, storm
  #2a2f3a). No z-index (stays under .map-controls z-index:2).
- `tests/badges.spec.ts` — extended (existing tests untouched): tint absent
  at zoom 3, present+stable at zoom 9 (data-condition attr, opacity<=0.12,
  700ms stability check), absent again after zoom-out. Console gate reuses
  existing collector.

## Remaining gates (when exec frees)
1. `git add -A -- src tests && git commit` (author clodge123) — survival commit OVERDUE (>15 min, blocked by broker).
2. `npx vitest run` (full suite must stay green).
3. `npm run typecheck` + `npm run check:all` (determinism scanner: files use no RNG/clock — clean by construction).
4. ONE gated Playwright run: `npx playwright test tests/badges.spec.ts`.
5. Push `r3w3/A3-tint` via GitHub REST (`python3 /tmp/push_tree.py` pattern).
6. Closeout sweep.

## Orchestrator continuation 2 (2nd attempt)
Repeated single batched exec probes (yieldMs up to 900s) all returned
`Spawn broker request capacity exceeded` INSTANTLY — the broker is not
queuing, it is rejecting every spawn. Lane remains code-complete,
uncommitted, gates unrun. This status file IS the checkpoint (tree state,
self-explanatory). No commits, no push, no gates claimed.

## Deviations so far
- Tint consumes the **temperature-band fallback** (A2 condition codes not
  yet on this tip); seam documented in map-tint.ts header + `conditionFromTempC`.
- No deploy (per brief).
