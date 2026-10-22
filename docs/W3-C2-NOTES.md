# W3-C2 Alert Center — lane notes

## What landed
- `src/components/AlertCenter.tsx` — shared list (panel + /alerts page):
  severity sort (Extreme>Severe>Moderate>Minor, id tie-break), expandable
  headline/summary rows, deterministic formatStamp-style stamps, honest
  checking/empty/stale states, fly-to town button.
- `src/lib/weather/alerts.ts` — `sortAlertsBySeverity` (pure, R17) + optional
  headline/summary/effective fields on `Alert`.
- `api/alerts.js` — NWS `headline`/`desc`/`effective` passthrough (undefined
  when absent — never fabricated).
- `src/pages/MapPage.tsx` — ONE refresher lifted to MapPage; feeds badge dots
  (MapBadges) AND the panel center. No second poller. Initial bounds =
  continental US (documented), window polls track live viewport via boundsRef.
- `src/components/MapView.tsx` — fly-to seam (`subscribeFlyTo` → maplibre
  `flyTo`, 1800ms, zoom clamps UP to ≥9 so badges land in view).
- `src/lib/map/fly-to.ts` — documented app-wide fly-to channel (no seam
  existed; B4's search can reuse it).
- `src/pages/AlertsPage.tsx` — full-page list, page-scoped refresher over the
  fixed US bbox.
- `src/components/SidePanel.tsx` — `title` prop (panel head = "Alert Center").
- CSS: `.alert-center*` styles, square geometry, theme vars.

## Tests
- vitest 247/247 (15 new alert-center unit tests: sort, stale, empty, expand,
  fly seam, stamps).
- `tests/alert-center.spec.ts` 9/9 (3 viewports): sorted rows → expand →
  fly-to center lands on Hays → banner count 0; stale indicator; /alerts same
  list (inert rows — no map mounted, documented).
- shell.spec.ts updated honestly: panel-empty assertions → alert-center
  "No active alerts" (zero-alert stub); panel-empty unit tests unchanged
  (SidePanel still renders PanelEmpty when NO children — C1 tests keep
  proving that seam).
- badges.spec.ts untouched (Salina dot lights; banner 0).

## Deviations
1. Fly-to seam did not exist → added `src/lib/map/fly-to.ts` (documented).
   Rows fly at current zoom clamped up to ≥9 (badge-visible law).
2. /alerts page rows are inert text (no map mounted on that route). The
   panel version flies. Documented in code + spec.
3. First map poll uses continental-US bbox before MapBadges mounts (the old
   zero-bounds init would have polled an empty window).
4. Panel head title is now "Alert Center" (SidePanel gains optional `title`;
   default "Panel" keeps C1 tests green).
