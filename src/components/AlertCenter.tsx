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
// deterministic tie-break by id). Rows expand on click (headline/summary);
// the town line flies the map (requestFlyTo seam).
//
// Honest states (R19): "No active alerts" only after a SUCCESSFUL poll with
// zero rows; pre-first-poll says "Checking alerts…"; a stale feed shows
// "Feed unavailable — showing last known" over the last data (law 3).
// Determinism (R17): no Math.random / Date.now / new Date; stamps render via
// formatStamp-style pure slicing.
import { useState, type ReactNode } from 'react'
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
  /** Rendered inside the row's town line (panel: fly button; page: link). */
  townAction?: ReactNode
  expanded: boolean
  onToggle: () => void
}

/** One alert row: severity badge, event, area/town, truncated headline that
 *  expands on click, deterministic effective/expiry stamps. */
export function AlertRow({ alert, townAction, expanded, onToggle }: AlertRowProps) {
  const headline = alert.headline ?? alert.summary ?? ''
  const summary = alert.summary ?? ''
  const preview = headline || summary
  return (
    <li className={`alert-row${expanded ? ' is-expanded' : ''}`} data-testid="alert-row">
      <button
        type="button"
        className="alert-row-head"
        aria-expanded={expanded}
        data-testid="alert-row-toggle"
        onClick={onToggle}
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
      </button>
      <span className="alert-row-town">
        {townAction ?? townLabel(alert.town)}
      </span>
    </li>
  )
}

export interface AlertCenterProps {
  state: BannerState
  /** Panel mode (default): fly-to on town click. Page mode: no map mounted,
   *  rows stay inert (the /alerts page renders the same list full-page). */
  mode?: 'panel' | 'page'
}

/**
 * Shared alert list (panel + /alerts page render the SAME sorted list).
 * `state` is the last-good payload from the ONE per-window refresher.
 */
export function AlertCenter({ state, mode = 'panel' }: AlertCenterProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const sorted = sortAlertsBySeverity(state.alerts)

  const flyTo = (alert: Alert) => {
    const town = resolveTown(alert.town)
    if (town) requestFlyTo({ lon: town.lon, lat: town.lat })
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
              onToggle={() => setExpandedId((id) => (id === alert.id ? null : alert.id))}
              townAction={
                mode === 'panel' ? (
                  <button
                    type="button"
                    className="alert-row-fly"
                    data-testid="alert-row-fly"
                    onClick={() => flyTo(alert)}
                    aria-label={`Fly map to ${townLabel(alert.town)}`}
                  >
                    {townLabel(alert.town)}
                  </button>
                ) : (
                  townLabel(alert.town)
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export default AlertCenter
