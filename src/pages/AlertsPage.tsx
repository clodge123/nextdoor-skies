// W3-C2 ALERT CENTER — /alerts full page (session 3 decision: alert center
// replaces the banner; the page renders the SAME sorted severity list as the
// side panel). No map is mounted here, so rows are inert by design (no
// fly-to on this route — documented deviation: the fly seam needs a mounted
// map; the panel version flies).
//
// Polling law: one refresher per window-owner. The map page's refresher
// lives in MapPage; this page owns its OWN page-scoped refresher over a
// fixed continental-US viewport (deterministic bbox, server caps at 50
// towns). This is the same ONE-poll-per-window law, scoped to the page —
// not a second poller next to the panel (the panel is not mounted here).
//
// W4-E2 WHOLE-ROW FLY-TO (session 5): rows here are NOT inert. The whole
// row is one button; activating it navigates to `/?panel=<slug>` — the
// canonical town opener (src/lib/panel.ts scheme) — where the mounted map
// flies to the town on panel open (W3-B4 fly law). Deep-link parity: the
// same URL opens the panel + flies from anywhere.
//
// Honest states (R19): same family as the panel — "No active alerts" only
// after a successful zero-alert poll; stale feed shows "Feed unavailable —
// showing last known". Determinism (R17): no clock/RNG reads.
// No map is mounted here, so rows route through the app's canonical town
// opener (the map route) — see W4-E2 note above.
import { useNavigate } from 'react-router-dom'
import { useAlerts } from '../components/AlertBanner'
import AlertCenter from '../components/AlertCenter'
import { panelOpenHref } from '../lib/panel'

/** Continental-US bbox (fixed, deterministic — gazetteer towns all live
 *  inside it; the server caps requests at 50 towns by population). */
export const ALERTS_PAGE_BOUNDS = { west: -125, south: 24, east: -66, north: 50 }

export default function AlertsPage() {
  const state = useAlerts(() => ALERTS_PAGE_BOUNDS)
  const navigate = useNavigate()
  return (
    <section className="alerts-page" aria-labelledby="alerts-heading" data-testid="alerts-page">
      <h1 id="alerts-heading">Alerts</h1>
      <AlertCenter
        state={state}
        mode="page"
        onOpenTown={(slug) => navigate(panelOpenHref(window.location.search, slug))}
      />
    </section>
  )
}
