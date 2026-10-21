import { useEffect, useState } from 'react'
import { useMap } from '../lib/map/map-context'
import type { TownCoord } from '../lib/weather/openmeteo-batch'

/**
 * L6 TOWN-WEATHER-BADGES — HTML overlay badges positioned via map.project().
 *
 * - Temp NUMBER over town labels (R3), square geometry, zero border-radius
 *   (R20), border uses var(--current-accent) (L4 theme seam, R12).
 * - Zoom-graded visibility: badges render only at/above TOWN_BADGE_MIN_ZOOM.
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
}

export function TownBadges({ towns, temps, alerts, minZoom = TOWN_BADGE_MIN_ZOOM }: TownBadgesProps) {
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
        return (
          <div
            key={town.id}
            data-testid={`town-badge-${town.id}`}
            className="town-badge"
            style={{ left: `${p.x}px`, top: `${p.y}px` }}
          >
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
          </div>
        )
      })}
    </div>
  )
}
