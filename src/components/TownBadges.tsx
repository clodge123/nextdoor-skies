import { useEffect, useState, type ReactNode } from 'react'
import { useMap } from '../lib/map/map-context'
import type { TownCoord } from '../lib/weather/openmeteo-batch'

/**
 * L6 TOWN-WEATHER-BADGES — HTML overlay badges positioned via map.project().
 *
 * - Temp NUMBER over town labels (R3), square geometry, zero border-radius
 *   (R20), border uses var(--current-accent) (L4 theme seam, R12).
 * - Zoom-graded visibility: badges render only at/above TOWN_BADGE_MIN_ZOOM.
 * - W3-B2 TOWN PANEL: clicking a badge opens the in-map town panel for that
 *   town (session 2 decision 1+4). The badge is an <a> whose href carries
 *   `?panel=<townSlug>` (lib/panel.ts scheme); discoverability affordances
 *   (cursor, hover lift, alert pulse) live in CSS.
 * - Determinism (R17): no Date.now / Math.random / new Date in render logic.
 *   Positioning recomputes purely from map state + render tick.
 */

export const TOWN_BADGE_MIN_ZOOM = 9

export interface TownBadgesProps {
  towns: readonly TownCoord[]
  /** townId -> Celsius, last-data-wins from the weather refresher. */
  temps: Readonly<Record<string, number>>
  /**
   * S6 consumer seam: townId -> highest active alert severity (from
   * alertDotForTown), or null/absent when the town has no alerts. A dot
   * renders inside the badge for any non-null severity.
   */
  alerts?: Readonly<Record<string, string | null>>
  minZoom?: number
  /**
   * W3-B2 TOWN PANEL seam: when set, each badge renders as a clickable link
   * opening the panel for that town (href = panelOpenHref(search, id)).
   * Omitted (unit tests) => inert div, exactly the pre-panel behavior.
   */
  panelHrefFor?: (townId: string) => string
  /**
   * W3-B2: client-side navigation for badge clicks (the href stays for
   * middle-click/open-in-new-tab). Without this the raw <a> reloads the
   * page — resetting zoom/pan (animation law) and dropping the panel to
   * "awaiting feed" (the refresher only runs at zoom >= 9). Modifier-
   * clicks pass through untouched.
   */
  onPanelOpen?: (townId: string) => void
}

export function TownBadges({ towns, temps, alerts, minZoom = TOWN_BADGE_MIN_ZOOM, panelHrefFor, onPanelOpen }: TownBadgesProps) {
  const map = useMap()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    const unsubs = ['move', 'moveend', 'zoom', 'resize']
      .map((ev) => map.on?.(ev, bump))
      .filter((f): f is () => void => typeof f === 'function')
    return () => unsubs.forEach((off) => off())
  }, [map])

  // `tick` intentionally drives re-render only; positions come from map state.
  void tick

  const zoom = map.getZoom()
  if (zoom < minZoom) return null

  return (
    <div className="town-badges" data-testid="town-badges" aria-hidden="true">
      {towns.map((town) => {
        const p = map.project([town.lon, town.lat])
        const temp = temps[town.id]
        const hasTemp = typeof temp === 'number' && Number.isFinite(temp)
        const badgeProps = {
          'data-testid': `town-badge-${town.id}`,
          'data-town-id': town.id,
          className: 'town-badge town-badge-clickable',
          style: { left: `${p.x}px`, top: `${p.y}px` },
        }
        const children: ReactNode = (
          <>
            <span className="town-badge-temp">
              {hasTemp ? `${Math.round(temp)}°` : 'awaiting feed'}
            </span>
            {alerts?.[town.id] ? (
              <span
                className="town-badge-alert-dot"
                data-alert-severity={alerts[town.id] as string}
                data-testid={`alert-dot-${town.id}`}
                title={`Active alert: ${alerts[town.id]}`}
              />
            ) : null}
          </>
        )
        // W3-B2: badge click opens the town panel (discoverability law:
        // cursor + hover + alert-pulse affordance live in CSS). The overlay
        // container keeps aria-hidden (decorative map furniture); the panel
        // itself is the accessible surface (role=dialog).
        if (!panelHrefFor) {
          return (
            <div key={town.id} {...badgeProps}>
              {children}
            </div>
          )
        }
        return (
          <a
            key={town.id}
            href={panelHrefFor(town.id)}
            {...badgeProps}
            data-panel="1"
            onClick={
              onPanelOpen
                ? (e) => {
                    // Plain left/tap click = in-app panel open (no reload,
                    // no view reset). Modifier clicks keep real-link power.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                    e.preventDefault()
                    onPanelOpen(town.id)
                  }
                : undefined
            }
          >
            {children}
          </a>
        )
      })}
    </div>
  )
}
