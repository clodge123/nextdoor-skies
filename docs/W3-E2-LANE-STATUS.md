# W3-E2 FIRST-VISIT TOUR — lane status

Branch `r3w3/E2-tour`. Brief: docs/WAVE-3-BRAINSTORM.md session 5 (quick
3-step spotlight tour, shown ONCE per unique user, replayable) + tour
visibility law (localStorage seen-flag, discreet replay).

## Delivered

- **src/lib/tour.ts** — pure state machine: fixed 3-step script
  (`welcome-map` -> `search` -> `panel-palette`), `shouldShowTour` /
  `markTourSeen` on localStorage `nds-tour-seen`, `nextStepIndex` (2 -> null),
  `TOUR_EVENT` replay channel. R17-clean (no clock/RNG).
- **src/components/Tour.tsx** — portal spotlight tour: dark scrim with an
  honest SVG cutout on the target (accent ring), tooltip bubble (>=44px
  Next/Skip/Done, step dots, 2s "no rush" hint), mobile-first bottom dock
  <=480px, ~200ms transitions, square geometry, theme vars. Non-blocking:
  scrim click advances, Esc skips, `aria-modal="false"` + focus lands on the
  bubble WITHOUT a trap (Tab reaches the whole page). Auto-opens on first
  visit, map home only (route gate), 600ms after paint.
- **Seen-once law** — localStorage flag; private mode (storage throws) ->
  shown every visit, never faked in memory (documented in tour.ts + Tour.tsx).
- **Replay seams (same call)** — palette command `show-tour` ("Show tour",
  runs `requestTour()`) + phone drawer item `Take the tour`
  (`data-drawer-item="tour"`).
- **App wiring** — `<TourHost />` mounted once in App.tsx.
- **Existing-spec honesty** — every non-tour e2e spec now seeds
  `nds-tour-seen` via `tests/tour-seed.ts` (returning-visitor model), so the
  tour overlay cannot hijack other lanes' clicks.

## Gates

- vitest: 386/386 (tour state machine 15: seen-once, skip marks seen, replay,
  step order, route gate, non-modal; palette registry updated for show-tour).
- tsc -b: clean. npm run build: clean. check:all (determinism/radius/no-cwc): clean.
- Playwright (gated, scripts/e2e-gate.sh): tests/tour.spec.ts **10/10**
  (2 phone-only skips by design) — fresh context -> tour appears -> Next x2
  -> Done -> reload -> gone -> palette 'Show tour' replays + drawer replay,
  scrim-advance/Esc-skip, /feed route gate. Full-suite regression pass
  (150 passed) confirmed all seeded specs green; the only 3 failures were a
  spec bug (clicked Done on step 0) fixed + verified green in `bef94b1`.

## Deviations

- Brainstorm said "header ▶ Demo replay"; session-5 owner ruling + wave-3
  scope (this brief) moved replay to palette command + drawer item — no new
  header button (header real estate is C3/B4-adjacent). Both seams call the
  same `requestTour()`.
- Tour auto-opens on `/` only (map surfaces are the subject); deep pages get
  the explicit replay seam. Keeps /feed, /alerts, /p/<id> specs untouched.
- Existing specs seed the seen-flag (returning visitors) — the tour is a real
  overlay with a scrim; leaving it unseeded on every first-visit page would
  make unrelated lanes flake. Documented in tests/tour-seed.ts.
- Bubble floats beside target >=480px (below/above by room), docks bottom
  <=480px — mobile-first law.
