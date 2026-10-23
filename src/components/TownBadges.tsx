import { useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useMap } from '../lib/map/map-context'
import type { TownCoord } from '../lib/weather/openmeteo-batch'
import { weathercodeToIcon } from '../lib/weather/weathercode'
import { formatTemp } from '../lib/weather/units'
import { useUnits } from '../lib/weather/useUnits'

/**
 * L6 TOWN-WEATHER-BADGES — HTML overlay badges positioned via map.project().
 *
 * - Temp NUMBER over town labels (R3), square geometry, zero border-radius
 *   (R20), border uses var(--current-accent) (L4 theme seam, R12).
 * - W3-A2 CONDITION ICONS (wave-3 session 1, decision 2): a lucide glyph
 *   beside the temp, mapped from the Open-Meteo WMO weathercode the proxy
 *   forwards per town. Theme-neutral: the icon inherits currentColor and the
 *   CSS paints it var(--text), so it is legible on BOTH themes (owner law).
 *   Towns with NO weathercode render NO icon (honest, R19) — never a guess.
 * - W3-A2 FADE-IN LAW (~200ms CSS): the chip content animates opacity 0->1
 *   when data arrives. Keyed purely on the presence of data via the
 *   `is-live` class — CSS transition only, zero JS timers (determinism R17).
 * - Zoom-graded visibility: badges render only at/above TOWN_BADGE_MIN_ZOOM.
 * - W3-B2 TOWN PANEL: clicking a badge opens the in-map town panel for that
 *   town (session 2 decision 1+4). The badge is an <a> whose href carries
 *   `?panel=<townSlug>` (lib/panel.ts scheme); discoverability affordances
 *   (cursor, hover lift, alert pulse) live in CSS.
 * - W3-B3 CLICK-TO-DETAIL (session 2 decision 4): the badge is an honest
 *   accessible affordance — a real focusable link with an aria-label, so Tab
 *   reaches badges at zoom >= 9 and Enter opens the panel (the overlay is NO
 *   LONGER aria-hidden; decorative furniture that swallows keyboard focus
 *   was the old lie). Clicking a badge's ALERT DOT (when present) goes
 *   straight to /alerts — the deepest intent — instead of opening the panel.
 *   The dot is a sibling link (anchors never nest), sized 44px+ via its
 *   ::before hit area (R13).
 * - Determinism (R17): no Date.now / Math.random / new Date in render logic.
 *   Positioning recomputes purely from map state + render tick.
 */

export const TOWN_BADGE_MIN_ZOOM = 9

export interface TownBadgesProps {
  towns: readonly TownCoord[]
  /** townId -> Celsius, last-data-wins from the weather refresher. */
  temps: Readonly<Record<string, number>>
  /**
   * W3-A2: townId -> Open-Meteo WMO weathercode (last-data-wins). A town
   * with no entry (or a null entry) renders no icon — icons appear ONLY
   * where real condition data exists.
   */
  codes?: Readonly<Record<string, number | null>>
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
  /**
   * W3-B3 CLICK-TO-DETAIL: when set, the badge's alert DOT renders as its
   * own focusable link (href "/alerts") that calls this on plain click —
   * deepest-intent navigation, bypassing the panel. Omitted (unit tests /
   * pre-panel) => the dot stays the S6 decorative span inside the badge.
   */
  onAlertOpen?: (townId: string) => void
}

export function TownBadges({
  towns,
  temps,
  codes,
  alerts,
  minZoom = TOWN_BADGE_MIN_ZOOM,
  panelHrefFor,
  onPanelOpen,
  onAlertOpen,
}: TownBadgesProps) {
  const map = useMap()
  const unit = useUnits()
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
    <div className="town-badges" data-testid="town-badges">
      {towns.map((town) => {
        const p = map.project([town.lon, town.lat])
        const temp = temps[town.id]
        const hasTemp = typeof temp === 'number' && Number.isFinite(temp)
        // W3-A2 fade-in law: the chip content is transparent until data
        // arrives, then transitions 0->1 over ~200ms (CSS, keyed `is-live`).
        const isLive = hasTemp
        const code = codes?.[town.id]
        const mapped = code === undefined || code === null ? null : weathercodeToIcon(code)
        const Icon = mapped?.icon
        const badgeProps = {
          'data-testid': `town-badge-${town.id}`,
          'data-town-id': town.id,
          className:
            `town-badge${isLive ? ' is-live' : ''}${panelHrefFor ? ' town-badge-clickable' : ''}`,
          style: { left: `${p.x}px`, top: `${p.y}px` },
        }
        const anchorStyle = badgeProps.style
        const children: ReactNode = (
          <>
            {/* Data wrapper is ALWAYS mounted (opacity 0) so the class flip
                is a computed-style CHANGE — the CSS transition fires. Its
                content fills in only when real data arrives. */}
            <span className="town-badge-data">
              {hasTemp && Icon && mapped ? (
                <span
                  className="town-badge-icon"
                  data-testid={`weather-icon-${town.id}`}
                  data-weathercode={code as number}
                  data-weather-bucket={mapped.bucket}
                  title={mapped.label}
                >
                  <Icon size={14} aria-hidden="true" />
                </span>
              ) : null}
              {hasTemp ? <span className="town-badge-temp">{formatTemp(temp, unit)}</span> : null}
            </span>
            {hasTemp ? null : <span className="town-badge-temp">awaiting feed</span>}
          </>
        )
        // The severity dot (S6 consumer seam): decorative span inside the
        // inert badge; the LINKED form (W3-B3) renders outside the anchor.
        const dotSpan = alerts?.[town.id] ? (
          <span
            className="town-badge-alert-dot"
            data-alert-severity={alerts[town.id] as string}
            data-testid={`alert-dot-${town.id}`}
            title={`Active alert: ${alerts[town.id]}`}
          />
        ) : null
        // W3-B2: badge click opens the town panel (discoverability law:
        // cursor + hover + alert-pulse affordance live in CSS). W3-B3: the
        // overlay is no longer aria-hidden — every rendered badge is a real
        // link (keyboard-reachable, named by aria-label); the panel is the
        // dialog surface, the map furniture is honest interactive chrome.
        if (!panelHrefFor) {
          return (
            <div key={town.id} {...badgeProps}>
              {children}
              {dotSpan}
            </div>
          )
        }
        const badgeClick =
          onPanelOpen &&
          ((e: ReactMouseEvent<HTMLAnchorElement>) => {
            // Plain left/tap click = in-app panel open (no reload, no view
            // reset). Modifier clicks keep real-link power.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
            e.preventDefault()
            onPanelOpen(town.id)
          })
        // W3-B3: with alert routing wired, the severity dot becomes its own
        // link to /alerts (deepest intent) rendered OUTSIDE the badge anchor
        // (no nested anchors) at the badge's top-right corner, with a 44px
        // ::before hit area (R13).
        const dotSev = alerts?.[town.id]
        const dotLink =
          dotSev && onAlertOpen ? (
            <a
              href="/alerts"
              className="town-badge-alert-dot town-badge-alert-dot-link"
              data-alert-severity={dotSev}
              data-testid={`alert-dot-${town.id}`}
              data-town-id={town.id}
              title={`Active alert: ${dotSev} — view all alerts`}
              aria-label={`${town.name}: active ${dotSev} alert — open alerts page`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                e.preventDefault()
                e.stopPropagation()
                onAlertOpen(town.id)
              }}
            />
          ) : null
        const badge = (
          <a
            key={town.id}
            href={panelHrefFor(town.id)}
            {...badgeProps}
            data-panel="1"
            aria-label={`Open ${town.name} town panel`}
            onClick={badgeClick}
          >
            {dotSev && !dotLink ? dotSpan : null}
            {children}
          </a>
        )
        if (!dotLink) return badge
        // Slot wrapper: the badge anchor goes STATIC inside a positioned
        // slot carrying the badge's original placement (translate(-50%,-100%)),
        // so the dot link sits at the badge's top-right corner (the old
        // -7px/-7px offset) — no nested anchors, both links siblings.
        return (
          <span
            key={town.id}
            className="town-badge-slot"
            style={anchorStyle}
            data-town-id={town.id}
          >
            {badge}
            {dotLink}
          </span>
        )
      })}
    </div>
  )
}
