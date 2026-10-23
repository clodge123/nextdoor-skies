// W3-B3 CLICK-TO-DETAIL — accessible town LABEL/DOT targets below the badge
// zoom grade (wave-3 session 2, decision 4: "Every target clickable: badges
// (44px), town/city labels below zoom 9, AND low-zoom state/city dots — no
// dead zones at any zoom level").
//
// The gazetteer labels below zoom 9 are canvas symbol layers (MapView's
// `nds-labels-*` layers): visible, decorative, NOT clickable and not
// focusable. This overlay adds the honest accessible affordance the session-2
// law demands: one real <button> per town in the current zoom tier's band,
// positioned over the label/dot via map.project(), carrying role=button +
// tabIndex (native), a >=44px hit area (R13 law), cursor/hover CSS, and an
// aria-label naming the town. Clicking a target opens the SAME town panel as
// a badge click — the `?panel=<slug>` URL scheme from src/lib/panel.ts (one
// key everywhere: townId === session.townSlug === gazetteer slug).
//
// Zoom band: renders ONLY below TOWN_BADGE_MIN_ZOOM — at/above zoom 9 badges
// take over (they already afford the panel). Towns shown follow the tier
// rules (country->state->city as zoom rises), population-ranked, capped so
// the DOM stays bounded (viewport windows are huge at low zoom).
//
// Determinism (R17): no Date.now / Math.random / new Date. Positions come
// purely from map state + a render tick.
import { useEffect, useState } from 'react'
import { useMap } from '../lib/map/map-context'
import { tierForPopulation, tierForZoom } from '../lib/map/tiers'
import { TOWN_BADGE_MIN_ZOOM } from './TownBadges'

/** Max focusable targets rendered per viewport (DOM bound; pop-ranked). */
export const TOWN_TARGET_MAX = 100

export interface TownTargetCoord {
  id: string
  name: string
  lat: number
  lon: number
  /** Population — drives tier band + ranking (gazetteer TownPoint.pop). */
  pop: number
}

export interface TownLabelTargetsProps {
  towns: readonly TownTargetCoord[]
  /** Panel href for a town (lib/panel.ts scheme); omitted => inert (unit tests). */
  panelHrefFor?: (townId: string) => string
  /** Client-side panel open (no reload, no view reset). */
  onPanelOpen?: (townId: string) => void
  /**
   * W4-C2 FEED-LOAD PREFETCH seam: hover/focus on a label target announces
   * the town (the prefetch layer dedupes/LRUs downstream).
   */
  onTownFocus?: (townId: string) => void
  /** Hide targets at/above this zoom (badges own that range). */
  maxZoom?: number
}

/** Tier-band + viewport selection, pop-ranked, capped. Pure. */
export function targetsForZoom(towns: readonly TownTargetCoord[], zoom: number): TownTargetCoord[] {
  const band = tierForZoom(zoom)
  return towns
    .filter((t) => tierForPopulation(t.pop) === band)
    .sort((a, b) => b.pop - a.pop || a.name.localeCompare(b.name) || a.lat - b.lat || a.lon - b.lon)
    .slice(0, TOWN_TARGET_MAX)
}

export function TownLabelTargets({
  towns,
  panelHrefFor,
  onPanelOpen,
  onTownFocus,
  maxZoom = TOWN_BADGE_MIN_ZOOM,
}: TownLabelTargetsProps) {
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
  if (zoom >= maxZoom) return null
  const visible = targetsForZoom(towns, zoom)

  return (
    <div className="town-targets" data-testid="town-label-targets" data-zoom-band={tierForZoom(zoom)}>
      {visible.map((town) => {
        const p = map.project([town.lon, town.lat])
        const label = `Open ${town.name} town panel`
        const props = {
          'data-testid': `town-target-${town.id}`,
          'data-town-id': town.id,
          className: 'town-target',
          style: { left: `${p.x}px`, top: `${p.y}px` },
          'aria-label': label,
          title: town.name,
          // W4-C2 prefetch seam: hover/focus announces the town.
          onMouseEnter: () => onTownFocus?.(town.id),
          onFocus: () => onTownFocus?.(town.id),
        }
        // Inert (unit tests / no panel wiring): a focusable button with no
        // navigation — the affordance is real, the destination is not wired.
        if (!panelHrefFor) {
          return (
            <button key={town.id} type="button" {...props} data-panel="">
              <span className="town-target-dot" aria-hidden="true" />
              <span className="town-target-label">{town.name}</span>
            </button>
          )
        }
        return (
          <a
            key={town.id}
            href={panelHrefFor(town.id)}
            {...props}
            data-panel="1"
            onClick={
              onPanelOpen
                ? (e) => {
                    // Plain left/tap click = in-app panel open (no reload,
                    // no view reset — animation law). Modifier clicks keep
                    // real-link power (middle-click/open-in-new-tab).
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                    e.preventDefault()
                    onPanelOpen(town.id)
                  }
                : undefined
            }
          >
            <span className="town-target-dot" aria-hidden="true" />
            <span className="town-target-label">{town.name}</span>
          </a>
        )
      })}
    </div>
  )
}
