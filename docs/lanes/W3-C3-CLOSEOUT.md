# W3-C3 CLOSEOUT — Command palette (power users)

Branch `r3w3/C3-palette` · author clodge123 · wave-3 brainstorm session 3,
decision 4 ("Command palette (Ctrl+K) + keyboard shortcuts: YES").

## What shipped

- **`src/components/CommandPalette.tsx`** — portal dialog on `document.body`
  (Lightbox pattern: opening never shifts page layout). Focus trap (Tab
  cycles inside), Esc closes (stopPropagation so the phone drawer's window
  listener never double-fires), scrim click closes. Commands: Go to Map /
  Feed / Alerts (routes), Toggle theme (`toggleTheme()`), Toggle side panel
  (`requestPanelToggle()` — P law, new seam in SidePanel), Open alerts center
  (navigate `/` + `requestPanelOpen()`), Go to town… (stays open, switches
  to the gazetteer typeahead reusing `rankTowns` from IdentityPicker —
  prefix-first, pop-desc, deterministic).
- **`src/lib/palette.ts`** — fixed command registry, pure prefix/keyword
  filter, recents in `sessionStorage` (`nds-palette-recents`, dedupe,
  most-recent-first, cap 5, ghost ids dropped, corrupt storage degrades to
  empty).
- **`src/App.tsx`** — `usePaletteOpen()`: Ctrl/Cmd+K toggles app-wide
  (preventDefault so the browser's own Ctrl+K never fights it).
- **Discoverability (owner law)** — header ⌘K chip (`palette-chip`, ≥44px,
  hidden ≤480px) + phone drawer item `data-drawer-item="palette"`.
- **CSS** — square geometry (var(--radius) only), theme vars, ≥46px rows,
  ~150ms fade/scale entrance keyframes with prefers-reduced-motion opt-out.

## Gates

- vitest: 354/354 (was 334; +20 palette unit/component tests).
- tsc -b: clean. npm run build: clean. check:all: clean.
- Playwright (gated, scripts/e2e-gate.sh): palette.spec.ts 6/6 green across
  phone/tablet/desktop (Ctrl+K opens, theme filter+Enter flips theme,
  Esc/scrim close, ArrowDown nav, chip/drawer discoverability, town
  typeahead -> town page, recents round-trip). Full suite: 132 passed /
  8 skipped (real-api needs REAL_API=1) / 1 flake — polish.spec.ts desktop
  timed out on `ndsMap.isStyleLoaded` under host load (map style settle);
  re-run standalone 3/3 PASS, unrelated to the palette (header assertions
  all pass in every other project). No existing spec regressed.

## Deviations / notes

- Lane base needed main (B2/B3 merges); merged `aeb04e5` in before feature
  work (the C2-only tip was missing the CSS restoration).
- `.e2e/node_modules` symlink added (lane scaffold only provided the `.e2e`
  dir symlink; sibling lanes carry the node_modules symlink too).
- Ctrl+K (not literal Meta+K) drives the e2e keyboard gesture — Chromium on
  Linux maps `Control+k`; the app accepts both modifiers.
- Keyboard-nav assertion honors recents ordering (last-run command is
  highlighted first when recents exist — spec asserts the real law).
- Town-typeahead entry uses ArrowUp (go-town is last in registry order).
- No deploy (wave law). Closeout sweep: 122 zombie chrome-headless reaped
  (leaked service-child-group-anchor parents killed), 1 live chrome-headless
  (sibling lane) untouched.
