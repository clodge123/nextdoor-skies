# W3-B4 SEARCH + FLY-TO — LANE STATUS

Lane: search box (header inline / phone drawer) + animated fly-to to town
(brainstorm session 2 decision 3). Merged base: B1 routing, B2 town panel
(?panel scheme), B3 TownLabelTargets, C1/C2 shell + alert center + fly seam.

## Delivered

1. **Search box** — `src/components/TownSearch.tsx`: type-ahead combobox of
   gazetteer towns (`src/lib/map/search.ts` filter: prefix-first, pop-ranked,
   cap 8, accent/case-insensitive). Keyboard navigable (ArrowDown/Up +
   Enter, Escape closes dropdown only). >=44px input + options (R13).
   Empty state: "No towns match". Desktop/tablet: inline header; phone
   (<=480px): nav-drawer instance (inline hides by CSS).
2. **Animated fly-to** — selecting a town navigates to `/?panel=<slug>`;
   MapPage's panel effect fires `requestFlyTo({zoom: 9})` through the
   C2 fly seam → MapView `flyTo` duration 1800ms, easeInOut (wave-1
   animation law: 1.5-2s, nothing snaps). Every panel open flies — search,
   badge tap, deep link (one rule, one seam). Pre-style-load requests are
   deferred to 'load' (deep-link hard loads animate, never teleport).
3. **URL honesty (documented scheme choice)**: flying writes NOTHING to
   the URL. `?ndsCenter` stays the e2e center hook only. Selection
   navigates to `/?panel=<slug>` — same scheme as badge clicks
   (src/lib/panel.ts), so deep links open the panel + fly identically.
4. **Esc closes panel** — untouched (TownPanel owns it); TownSearch's
   Escape stopPropagation keeps dropdown-close from stealing the law.
5. **Gates**: vitest 351/351 (17 new: filter law, combobox keyboard/empty/
   nav, fly-to duration law 1800∈[1500,2000] + zoom clamp >=9); tsc -b;
   npm run build; check:all scans; gated Playwright — see ledger below.

## Deviations

- Animation proof in e2e samples `ndsMap.getZoom()` frames (>=3 distinct
  values while isMoving) instead of canvas CSS transform: maplibre v5
  animates in WebGL, canvas transform stays "none" — the CSS-transform
  probe was a false negative. Zoom sampling is the honest equivalent.
- Fly seam gained a one-line deferral (pre-style-load request -> 'load'
  event) so deep-link panel opens honor the animation law; C2 behavior
  unchanged (alert rows post-load fly identically).
- Search option ranking: 'sal' surfaces Salinas (CA, pop 157k) first;
  Salina KS is second. Keyboard users ArrowDown once. Intended: pop-rank
  law ("the town you most likely mean").

## Ledger

- 0e726eb survival commit (docs/W3-B4-LANE-STATUS.md)
- bbb1d71 feat: TownSearch + search.ts + MapPage fly effect + CSS
- 531d02c feat: tests/search.spec.ts + fly seam deferral
- 439be97 test: target Salina slug explicitly
- 9d4ea80 test: zoom-frame animation proof (search+map 13/13 green)
- final gated full-suite run: see commit below
