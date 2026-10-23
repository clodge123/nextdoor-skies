// W3-C2 ALERT CENTER — the side-panel slot content that replaces the wave-2
// banner (session 3 decision: alerts live in the panel, not a map overlay).
//
// Data law (brainstorm session 3): ONE poll per window drives badge dots AND
// this center — the refresher + state live in MapPage/MapBadges and are
// passed in as `state` (the same last-good payload). This component never
// starts a second poller. The /alerts page mounts its OWN refresher via
// useAlerts (one poller per page, page-scoped — a page is one window-owner).
//
// Sorting: severity Extreme > Severe > Moderate > Minor (sortAlertsBySeverity,
// deterministic tie-break by id).
//
// W4-E2 WHOLE-ROW FLY-TO (session 5 decisions 1+2): the ENTIRE row is one
// button — the fly-to target. Click / Enter / Space anywhere on the row
// flies the map (requestFlyTo seam, same 1800ms ease law) AND expands the
// headline (the old separate expand button and the tiny town fly-button are
// gone: ONE Tab stop per row, keyboard flow is clean). Page mode (no map
// mounted) routes the click to the app's canonical town opener — the same
// `?panel=<slug>` deep-link scheme MapPage flies on (src/lib/panel.ts) —
// so /alerts rows fly via the map route instead of being inert.
//
// Honest states (R19): "No active alerts" only after a SUCCESSFUL poll with
// zero rows; pre-first-poll says "Checking alerts…"; a stale feed shows
// "Feed unavailable — showing last known" over the last data (law 3).
// Determinism (R17): no Math.random / Date.now / new Date; stamps render via
// formatStamp-style pure slicing.
import { useState } from 'react'
import { formatStamp } from '../lib/feed'
import { sortAlertsBySeverity, type Alert } from '../lib/weather/alerts'
import { requestFlyTo } from '../lib/map/fly-to'
import { resolveTown } from '../lib/routing'
import type { BannerState } from './AlertBanner'

/** Panel title (session 3: the panel IS the alert center). */
export const PANEL_TITLE = 'Alert Center'

/** Row severity -> badge class (styling lives in index.css, square geometry). */
export function severityClass(severity: string): string {
  const key = severity.toLowerCase()
  if (key === 'extreme') return 'alert-sev-extreme'
  if (key === 'severe') return 'alert-sev-severe'
  if (key === 'moderate') return 'alert-sev-moderate'
  if (key === 'minor') return 'alert-sev-minor'
  return 'alert-sev-unknown'
}

/** Town slug -> human name via the gazetteer; falls back to the slug (honest:
 *  we show what the payload carries, never invent a town). */
export function townLabel(slug: string): string {
  const t = resolveTown(slug)
  return t ? t.name : slug
}

/** Format an ISO stamp deterministically (formatStamp law; null -> '—'). */
export function stamp(iso: string | null | undefined): string {
  return iso ? formatStamp(iso) : '—'
}

export interface AlertRowProps {
  alert: Alert
  expanded: boolean
  /** Whole-row activation: fly (panel) / open town (page) + expand. Fires on
   *  click, Enter, and Space — native button semantics, ONE Tab stop. */
  onActivate: () => void
}

/** One alert row (W4-E2): the whole row is ONE accessible button — severity
 *  badge, event, truncated headline, stamps, and the town line all live
 *  inside it. Clicking/activating ANYWHERE flies the map to the alert's town
 *  and expands the headline. No nested links (one Tab stop per row). */
export function AlertRow({ alert, expanded, onActivate }: AlertRowProps) {
  const headline = alert.headline ?? alert.summary ?? ''
  const summary = alert.summary ?? ''
  const preview = headline || summary
  const town = townLabel(alert.town)
  return (
    <li className={`alert-row${expanded ? ' is-expanded' : ''}`} data-testid="alert-row">
      <button
        type="button"
        className="alert-row-control"
        aria-expanded={expanded}
        aria-label={`Fly map to ${town}: ${alert.severity} ${alert.event}`}
        data-testid="alert-row-control"
        onClick={onActivate}
      >
        <span className={`alert-sev ${severityClass(alert.severity)}`} data-testid="alert-severity">
          {alert.severity}
        </span>
        <span className="alert-row-main">
          <span className="alert-row-event">{alert.event}</span>
          {preview && (
            <span className={`alert-row-headline${expanded ? ' is-expanded' : ''}`}>
              {expanded ? [headline, summary].filter(Boolean).join(' — ') : preview}
            </span>
          )}
          <span className="alert-row-stamps">
            {alert.effective ? <>effective {stamp(alert.effective)}</> : null}
            {alert.expires ? <> · expires {stamp(alert.expires)}</> : null}
            {!alert.effective && !alert.expires ? <>expires —</> : null}
          </span>
        </span>
        <span className="alert-row-town" data-testid="alert-row-town">
          {town}
        </span>
      </button>
    </li>
  )
}

export interface AlertCenterProps {
  state: BannerState
  /** Panel mode (default): whole-row click flies the mounted map. Page mode:
   *  no map is mounted, so whole-row click asks `onOpenTown` (the app's
   *  canonical town opener — the ?panel=<slug> route that flies on mount). */
  mode?: 'panel' | 'page'
  /** Page-mode row activation: open the town (map route + panel + fly). */
  onOpenTown?: (slug: string) => void
}

/**
 * Shared alert list (panel + /alerts page render the SAME sorted list).
 * `state` is the last-good payload from the ONE per-window refresher.
 */
export function AlertCenter({ state, mode = 'panel', onOpenTown }: AlertCenterProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const sorted = sortAlertsBySeverity(state.alerts)

  // W4-E2 whole-row activation: expand the headline AND fly. Panel mode
  // drives the fly seam directly (the map is mounted); page mode hands the
  // slug to the app router (the map route flies on panel open — one fly law
  // across every surface, W3-B4). No silent fallbacks: page mode without an
  // opener is a wiring bug, not a UI state — the row still expands.
  const activate = (alert: Alert) => {
    setExpandedId((id) => (id === alert.id ? null : alert.id))
    if (mode === 'panel') {
      const town = resolveTown(alert.town)
      if (town) requestFlyTo({ lon: town.lon, lat: town.lat })
    } else {
      onOpenTown?.(alert.town)
    }
  }

  return (
    <div className="alert-center" data-testid="alert-center" data-stale={state.stale ? 'true' : 'false'}>
      {state.stale && (
        <p className="alert-center-stale" data-testid="alert-center-stale" role="status">
          Feed unavailable — showing last known
        </p>
      )}
      {!state.loaded ? (
        <p className="alert-center-checking" data-testid="alert-center-checking">
          Checking alerts…
        </p>
      ) : sorted.length === 0 ? (
        <p className="alert-center-empty" data-testid="alert-center-empty">
          No active alerts
        </p>
      ) : (
        <ul className="alert-center-list" data-testid="alert-center-list">
          {sorted.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              expanded={expandedId === alert.id}
              onActivate={() => activate(alert)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export default AlertCenter
