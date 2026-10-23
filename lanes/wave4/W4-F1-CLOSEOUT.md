# W4-F1 tour-fixes — closeout (wave 4, round 3)

Branch: `r4w4/F1-tour-fixes` (base main tip `988504a`). Repo nextdoor-skies.

## What landed

**1. Step 1 copy — Fahrenheit by default + header °F/°C toggle pill**
(`src/lib/tour.ts` TOUR_STEPS[0].body):
> "The map is home: every town badge shows its current temperature (°F by
> default) and condition icon. Switch between °F and °C anytime with the
> units pill in the header. Tap a badge to open that town's panel."

Units law honored: copy names the F default + the UnitToggle seam; no
hardcoded Celsius. Test locks the copy (`°F`, `°C`, "pill" —
src/lib/tour.test.ts).

**2. Desktop spotlight placement (owner: hides / too high / too low)**
Root cause: the old heuristic reserved a FIXED 150px bubble height and never
clamped the result — any target near a viewport edge pushed the box
off-screen (desktop 1280x800: map target + 150px estimate → clipped).

Fix (src/components/Tour.tsx + new pure seam `placeBubble` in
src/lib/tour.ts):
- The bubble is MEASURED (getBoundingClientRect via useLayoutEffect,
  equality-guarded) — real height, not an estimate.
- Pure `placeBubble(target, vw, vh, bw, bh)`: prefer BELOW (gap 16) → flip
  ABOVE (gap 16) → slide BESIDE (roomier side, for tall targets) → last
  resort clamp fully inside (visible beats unobstructed; full-viewport map
  target). Horizontal always clamped inside 16px insets.
- Mobile (<=480px) keeps bottom-dock (thumb reach) + NEW flip to top dock
  when the target sits in the bottom band (collapsed side panel) — the
  bubble never covers the target there either.
- Square geometry (C-02) untouched (var(--radius) only), neon theme (C-01)
  untouched, ≥44px buttons untouched (CSS untouched — zero shared-CSS risk;
  all changes are TSX + tour classes only).

**3. Replay seams intact**
`nds-tour-seen` seen-once law + `requestTour()` seam (palette 'Show tour'
+ drawer 'Take the tour') untouched — verified by the existing component +
browser specs.

## Tests

- `src/lib/tour.test.ts`: +10 geometry tests (placeBubble: below/flip-above/
  side/clamp, full-viewport target, sweep across 1280x800 / 768x1024 /
  390x844 asserting box fully inside at every target row) + copy law test.
- `tests/tour.spec.ts`: +`expectInsideViewport` (bubble fully inside the
  viewport, every project) + `expectNotCovering` (bubble must not overlap
  the resolved target — resolves via the SAME first-visible-selector fallback
  law the app uses, in-page, so phone/desktop faces assert correctly) +
  step-1 copy assertions (°F / °C / pill) + `data-testid="tour-body"`.

## Gates

- vitest: 562/562 (49 files) — full suite green.
- tsc -b: clean.
- vite build: clean.
- Playwright (ONE gated run, scripts/e2e-gate.sh, tour.spec.ts desktop +
  phone): **7 passed, 1 skipped** (the drawer-replay test skips on desktop
  by design) — ~1.2m. All geometry/copy assertions green on both faces.
  (First gated run failed on a spec-side phone-target assumption; fixed in
  b774ea9 — second run is the recorded one above.)

## Deviations / notes

- CSS: ZERO changes (all fixes in TSX + tour.ts) — additive-only law
  trivially satisfied; lane C2's FeedPage/Skeleton files untouched.
- Harness repair (not a code change): my worktree's `.e2e` setup script had
  replaced the `node_modules` symlink (shared run2 install) with a local
  `.e2e/node_modules` missing `@vitejs/plugin-react`; restored the symlink
  (same pattern as lanes A1/B1/E1). No repo files involved.
- First gated run exposed a spec bug (phone face: `page.hasTouch` assumed
  the drawer button was the visible target; the inline search box is live
  on phone too) — fixed by resolving targets in-page with the app's own
  selector-fallback law, plus the mobile top-dock flip for bottom-band
  targets. Second run is the recorded one.
