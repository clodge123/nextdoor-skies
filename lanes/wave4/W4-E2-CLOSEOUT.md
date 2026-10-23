# W4-E2 ALERTS-WHOLE-ROW — Closeout

Branch `r4w4/E2-alerts-row` @ `a363b7a` (base main tip `0615b69`).

## What landed

Session-5 decisions 1+2, both surfaces:

1. **Whole row = fly-to target.** `AlertRow` is now ONE `<button
   type="button">` spanning the full row (`src/components/AlertCenter.tsx`):
   severity badge, event, headline, stamps, AND the town line all live
   inside it. Click / Enter / Space anywhere activates → flies the map
   (`requestFlyTo` seam, unchanged 1800ms law) and expands the headline.
   The old separate expand button (`alert-row-toggle`) and the tiny
   town-link fly button (`alert-row-fly`) are GONE — removed from DOM, not
   hidden. `aria-label` = "Fly map to {town}: {severity} {event}".
2. **One Tab stop per row.** No nested links/buttons inside the row
   (vitest asserts exactly one focusable per row). Keyboard Enter = native
   button activation (no custom key handler to rot).
3. **Hover/focus affordance** (`src/index.css`): `.alert-row-control` ≥44px
   min-height (measured 64px), pointer cursor, hover = neon inset ring +
   8% neon wash, `:focus-visible` = 2px neon outline (C-01), square
   geometry (C-02, `--radius` only). Playwright asserts the hover ring
   computes to `rgb(0, 255, 157)`.
4. **Page mode is no longer inert.** `/alerts` rows route activation to
   `navigate('/?panel=<slug>')` (canonical `src/lib/panel.ts` scheme);
   MapPage flies on panel open (W3-B4 law) — so /alerts rows fly via the
   map route. Deep-link parity: the same URL opens panel + flies.
   (`AlertsPage.tsx` passes `onOpenTown`; `AlertCenter` takes it.)

## Gates

- vitest: **467/467** (43 files) — `AlertCenter.test.tsx` 18/18 incl. new
  whole-row semantics: click→flyTo(-97.6114, 38.8403), Enter→flyTo,
  one-focusable-per-row + accessible name (town+severity+event), page-mode
  routes to opener.
- tsc -b: clean. build: clean (chunk-size warning pre-existing).
- check:determinism / check:radius / check:no-cwc: OK.
- **Gated Playwright (e2e-gate.sh): 9/9** across phone/tablet/desktop:
  row-center click flies map to Hays; hover ring visible; Tab-in/Enter
  flies to Great Bend; Tab moves OUT of the row (never a second stop);
  /alerts row click lands on `/?panel=salina-…` and the map center lands
  on Salina. Screenshots refreshed in `docs/screenshots/W3-C2/`.

## Deviations / notes

- **Transient OFM tile-502 console exclusion** added to
  `tests/alert-center.spec.ts` (same documented family as
  zoom-match.spec.ts law #4 — relay retries exhaust, browser logs the
  failed third-party tile; app-origin output stays gated). First gated run
  failed ONLY on this noise; all functional assertions passed. Second
  gated run 9/9.
- The brief mentioned preserving `?alert=` deep-link params; **no such
  param exists on main** (verified by grep across src/server/api/docs).
  The real deep-link scheme is `?panel=<slug>`; it is kept intact and is
  now what /alerts rows write.
- Page-mode rows fly via navigation (map mounts, panel opens, flies) —
  one fly law across surfaces, not a second seam. No silent fallbacks.

## Commits

- `1437368` survival/WIP (whole-row button, CSS, page routing, tests)
- `0aa6ded` documented tile-502 console exclusion
- `a363b7a` refreshed gate screenshots
