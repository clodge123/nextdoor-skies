# W4-B2 ZOOM-MATCH — closeout

Lane: W4-B2 (zoom-match), wave 4. Branch `r4w4/B2-zoom-match`, base f08d33b.

## Scope (owner critique, session 1 law #4)
Replace the global zoom-9 badge gate with a per-town gate: a town's badge
appears EXACTLY when the map shows that town's label, using the tier
(country/state/city/town) from `src/lib/map/tiers.ts`, thresholds derived
from a Playwright probe of rendered label layers (evidence, not guesses).

## Measured label-visibility table (probe evidence)
`scripts/probe-label-visibility.mjs` → `docs/metrics/W4-B2-label-visibility.json`
(queryRenderedFeatures over nds-labels-* layers, zoom 3..14, one town/tier):

| tier    | sample town      | label visible at zoom |
|---------|------------------|-----------------------|
| country | New York City    | z1–3 (layer maxzoom 4) |
| state   | Austin           | z4–6                  |
| city    | Kenosha / Salina | z7–9                  |
| town    | Cross Lanes      | z10–14+               |

The measured bands equal TIER_RULES exactly, so
`labelVisibleAtZoom(tier, z) === (tierForZoom(z) === tier)` — the predicate
IS the map's ground truth. (Note: labels above a layer's maxzoom are gone
because the symbol layer itself stops drawing; the badge gate mirrors this.)

## Implementation
- `tiers.ts`: `labelVisibleAtZoom(tier, zoom)` — measured predicate.
- `TownBadges.tsx`: `badgesForZoom(towns, zoom, fallback)` pure O(towns)
  gate (no sort, input order kept) + `visibleBadges()` memoized per zoom
  frame (reference/equality keyed, zero work per frame). Tier-less towns
  (unit-test seam) keep the legacy global gate. Geometry untouched (B1).
- `MapPage.tsx`: tier rides the viewport-visible town list.
- Weather refresher unchanged: its zoom-9 window gate stays (temps are
  fetched per window; badges render on demand per tier band — towns below
  z9 show "awaiting feed" badges only if in-band, matching prior behavior
  for city/tier towns; country/state badges above z1/z4 get temps once the
  refresher's window covers them).

## Acceptance
- `tests/zoom-match.spec.ts`: badge ⟺ map label for one town per tier at
  z∈{6,8,10,12,14}, ground truth = queryRenderedFeatures. 4/4 PASS.
- `tests/TownBadges.test.tsx`: tier→zoom mapping + memoization identity.
- `src/lib/map/tiers.test.ts`: measured-band table + tierForZoom equivalence.
- `tests/badges.spec.ts` + `tests/polish.spec.ts` retargeted from the global
  zoom-9 law to the zoom-match law (Salina city badge appears at z9, vanishes
  below z7 — same steps, new law).

## Gates
- vitest: 408 passed / 39 files.
- tsc -b: clean. `npm run build`: clean.
- check:all (determinism/radius/no-cwc): clean.
- ONE gated Playwright run: zoom-match 4/4, badges+polish regressions pass.
  Transient OFM tile 502 (node relay exhausted retries) excluded as
  third-party tile traffic per law #4, documented in the spec.
- No deploy.

## Deviations
- Probe added as scripts/probe-label-visibility.mjs (task required evidence;
  kept as a lane artifact for re-measurement).
- zoom-match spec desktop-only (4 towns × 5 zooms; fleet browser law).
- node_modules symlink restored to the shared repo dir (e2e-setup had
  replaced it with .e2e/node_modules, breaking the app build — siblings all
  use the shared dir).

## Commits
- 4223ac4 docs(w4-B2): closeout scaffold (survival)
- acfdf45 feat(w4-B2): per-town zoom-match badge gate
