import { useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useMap } from '../lib/map/map-context'
import type { TownCoord } from '../lib/weather/openmeteo-batch'
import { labelVisibleAtZoom, type Tier } from '../lib/map/tiers'
import { weathercodeToIcon } from '../lib/weather/weathercode'
import { formatTemp } from '../lib/weather/units'
import { useUnits } from '../lib/weather/useUnits'
import {
  badgeGroups,
  clusterLabel,
  displayTempKey,
  CLUSTER_MAX_ZOOM,
  type BadgeGroup,
  type ProjectedTown,
} from '../lib/map/cluster'
import { requestFlyTo } from '../lib/map/fly-to'

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
 * - W4-B2 ZOOM-MATCH (session-1 law #4): NO global zoom gate. A town's badge
 *   appears EXACTLY when the basemap renders that town's label — per-town,
 *   from its gazetteer tier (country/state/city/town, tiers.ts). Thresholds
 *   are MEASURED against the rendered nds-labels-* layers
 *   (scripts/probe-label-visibility.mjs, docs/metrics/W4-B2-label-visibility.json):
 *   country z1-3, state z4-6, city z7-9, town z10+. Towns WITHOUT tier data
 *   (unit-test seam) keep the legacy TOWN_BADGE_MIN_ZOOM=9 global gate.
 * - W4-B1 BADGE-ABOVE-LABEL (wave-4 session 1, decision 3): every town
 *   marker is ONE stacked DOM column [badge][label][dot] anchored ABOVE the
 *   town point by label height + 6px, so the badge can never cover the
 *   town name at any zoom (bbox law: badge.bottom <= label.top). The
 *   canvas label for badge-visible towns is suppressed by MapView (the DOM
 *   label IS the label there), keeping a single readable name per town.
 * - W3-B2 TOWN PANEL: clicking a badge opens the in-map town panel for that
 *   town (session 2 decision 1+4). The badge is an <a> whose href carries
 *   `?panel=<townSlug>` (lib/panel.ts scheme); discoverability affordances
 *   (cursor, hover lift, alert pulse) affordances live in CSS.
 * - W3-B3 CLICK-TO-DETAIL (session 2 decision 4): the badge is an honest
 *   accessible affordance — a real focusable link with an aria-label, so Tab
 *   reaches badges at zoom >= 9 and Enter opens the panel (the overlay is NO
 *   LONGER aria-hidden; decorative furniture that swallows keyboard focus
 *   was the old lie). Clicking a badge's ALERT DOT (when present) goes
 *   straight to /alerts — the deepest intent — instead of opening the panel.
 *   The dot is a sibling link (anchors never nest), sized 44px+ via its
 *   ::before hit area (R13).
 * - W4-B3 DE-CLUSTER (wave-4 session 1, decision 5): below CLUSTER_MAX_ZOOM
 *   (= TOWN_BADGE_MIN_ZOOM), badge-visible towns that SHARE a rounded
 *   display temp and sit within CLUSTER_RADIUS_PX on screen collapse into
 *   ONE metro-overlay badge labeled "Moore +2" (representative = smallest
 *   town id, R17 tie-break). Clustering composes AFTER the W4-B2 zoom-match
 *   gate — only towns whose badge is currently visible join a group — and
 *   each cluster renders as ONE stacked B1 column
 *   [cluster-badge][label][dot], so the overlap law is untouched. Expansion
 *   is the fly-to law: tapping the cluster badge flies to the group centroid
 *   and bumps zoom to CLUSTER_MAX_ZOOM, where grouping returns null and
 *   every member renders its own badge. Zooming in past CLUSTER_MAX_ZOOM
 *   expands the same way — pure function of zoom, zero sticky state (R17).
 * - Determinism (R17): no Date.now / Math.random / new Date in render logic.
 *   Positioning recomputes purely from map state + render tick.
 */

export const TOWN_BADGE_MIN_ZOOM = 9

/**
 * W4-BF DENSITY LAW (owner bug-fix round: "way too much going on"): the
 * zoom-match gate alone puts hundreds of state/city-tier badges on screen
 * over a country view. Shipping maps (Google Maps tiering, Mapbox collision
 * detection) bound density per frame — the biggest towns win, the rest
 * appear as you zoom in. Same rule, in pixels: pop-desc (id asc on ties),
 * hard cap per frame. Deterministic (R17): sort key is data, zero RNG/clock.
 */
export const MAX_VISIBLE_BADGES = 40

/**
 * W4-B2: badge input = TownCoord + the town's gazetteer tier (optional; the
 * unit-test seam omits it, falling back to the legacy global gate) + pop
 * (W4-BF density law; absent => 0, ranks last among equals).
 */
export interface TownBadgeCoord extends TownCoord {
  tier?: Tier
  pop?: number
}

/**
 * W4-B2 ZOOM-MATCH gate — PURE, exported for unit tests. Selects the towns
 * whose LABEL the map renders at this zoom: tiered towns pass iff their tier
 * band contains the zoom (labelVisibleAtZoom); tier-less towns fall back to
 * the legacy global minZoom. W4-BF: results are density-capped — pop-desc
 * (id asc on ties), max MAX_VISIBLE_BADGES per frame. (B1 owns stacking/
 * de-cluster geometry; this gate is visibility + density only.)
 */
export function badgesForZoom(
  towns: readonly TownBadgeCoord[],
  zoom: number,
  fallbackMinZoom: number,
): TownBadgeCoord[] {
  const out: TownBadgeCoord[] = []
  for (const t of towns) {
    if (t.tier ? labelVisibleAtZoom(t.tier, zoom) : zoom >= fallbackMinZoom) out.push(t)
  }
  if (out.length <= MAX_VISIBLE_BADGES) return out
  return [...out]
    .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0) || a.id.localeCompare(b.id))
    .slice(0, MAX_VISIBLE_BADGES)
}

// Memoization (performance law): the overlay re-renders every move/zoom
// frame; the gate recomputes ONLY when inputs change (towns reference, zoom,
// fallback). One O(towns) pass per change, zero work per frame. Pure
// reference/equality keyed (R17: no Date.now / Math.random).
let memoTowns: readonly TownBadgeCoord[] | null = null
let memoZoom = Number.NaN
let memoFallback = Number.NaN
let memoOut: TownBadgeCoord[] = []

/** Memoized wrapper around badgesForZoom — call from the render path. */
export function visibleBadges(
  towns: readonly TownBadgeCoord[],
  zoom: number,
  fallbackMinZoom: number,
): TownBadgeCoord[] {
  if (towns === memoTowns && zoom === memoZoom && fallbackMinZoom === memoFallback) {
    return memoOut
  }
  memoTowns = towns
  memoZoom = zoom
  memoFallback = fallbackMinZoom
  memoOut = badgesForZoom(towns, zoom, fallbackMinZoom)
  return memoOut
}

// W4-B3 clustering memo — same zero-per-frame pattern. Keyed on
// reference/equality of (visible towns, zoom, temps, unit). Panning hits the
// cache: grouping depends only on RELATIVE screen geometry (projection
// shifts every point rigidly), so pan frames do zero extra work. Exported
// for unit tests.
let memoGVisible: readonly TownBadgeCoord[] | null = null
let memoGZoom = Number.NaN
let memoGTemps: Readonly<Record<string, number>> | null = null
let memoGUnit = ''
let memoGOut: BadgeGroup[] | null = null

/**
 * W4-B3 — PURE composition point. Projects the badge-visible towns and
 * groups them by shared rounded display temp within CLUSTER_RADIUS_PX.
 * Returns null when clustering is OFF (zoom >= CLUSTER_MAX_ZOOM): callers
 * then render every town solo, byte-identical to the pre-B3 DOM.
 */
export function groupsForVisible(
  project: (lnglat: [number, number]) => { x: number; y: number },
  towns: readonly TownBadgeCoord[],
  zoom: number,
  temps: Readonly<Record<string, number>>,
  unit: string,
): BadgeGroup[] | null {
  if (
    towns === memoGVisible &&
    zoom === memoGZoom &&
    temps === memoGTemps &&
    unit === memoGUnit
  ) {
    return memoGOut
  }
  memoGVisible = towns
  memoGZoom = zoom
  memoGTemps = temps
  memoGUnit = unit
  if (zoom >= CLUSTER_MAX_ZOOM) {
    memoGOut = null // clustering OFF: every town renders solo (pre-B3 path)
    return memoGOut
  }
  const entries: ProjectedTown[] = towns.map((t) => {
    const p = project([t.lon, t.lat])
    return {
      id: t.id,
      name: t.name,
      lat: t.lat,
      lon: t.lon,
      x: p.x,
      y: p.y,
      tempKey: displayTempKey(temps[t.id], unit === 'C' ? 'C' : 'F'),
    }
  })
  memoGOut = badgeGroups(entries, zoom)
  return memoGOut
}

export interface TownBadgesProps {
  towns: readonly TownBadgeCoord[]
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
  /**
   * W4-C2 FEED-LOAD PREFETCH seam (session 2 law 3): fired when a badge
   * (or any member of a cluster badge) is HOVERED or FOCUSED — the map
   * "town ring" the Google Maps rule prefetches from. Fired once per
   * interaction; the prefetch layer dedupes/LRUs, so this component just
   * announces attention. Cluster badges announce EVERY member town.
   */
  onTownFocus?: (townId: string) => void
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
  onTownFocus,
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
  // W4-B2: per-town zoom-match gate (no global cutoff) — a badge renders
  // exactly while the basemap renders that town's label. Memoized per zoom
  // frame: O(towns) once per change, zero per-frame work, no sort.
  const visible = visibleBadges(towns, zoom, minZoom)
  if (visible.length === 0) return null

  // W4-B3 DE-CLUSTER: compose AFTER the zoom-match gate — only badge-visible
  // towns join a group. null (zoom >= CLUSTER_MAX_ZOOM) => every town renders
  // solo, byte-identical to the pre-B3 DOM. Memoized with the same
  // zero-per-frame pattern; panning hits the cache (grouping is
  // pan-invariant — projection shifts every point rigidly).
  const groups = groupsForVisible((lnglat) => map.project(lnglat), visible, zoom, temps, unit)

  // W4-B1 geometry law: the whole marker column [badge][label][dot] anchors
  // with its BOTTOM at the town point (dot on the point, label above it,
  // badge above the label with a 6px gap). Column flow guarantees
  // badge.bottom <= label.top at any zoom — a badge can never cover a name.
  // (The offset law "label height + 6px" is what the column enforces; see
  // lib/map/label-math for the pure math the acceptance spec validates.)
  const renderSolo = (town: TownBadgeCoord): ReactNode => {
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
    }
    const markerStyle = { left: `${p.x}px`, top: `${p.y}px` }
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
    // W4-B1 stacked column: [badge][label][dot]. The badge element and
    // every testid/selector stay intact (W3-B2/B3 behavior unchanged);
    // only the ANCHORING moved from the town point to the column box.
    if (!panelHrefFor) {
      return (
        <span
          key={town.id}
          className="town-marker"
          style={markerStyle}
          data-town-id={town.id}
          data-testid={`town-marker-${town.id}`}
        >
          <span className="town-marker-badge">
            <div {...badgeProps}>
              {children}
              {dotSpan}
            </div>
          </span>
          <span className="town-marker-label" data-testid={`town-label-${town.id}`} data-town-id={town.id}>
            {town.name}
          </span>
          <span className="town-marker-dot" aria-hidden="true" />
        </span>
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
        href={panelHrefFor(town.id)}
        {...badgeProps}
        data-panel="1"
        aria-label={`Open ${town.name} town panel`}
        onClick={badgeClick}
        // W4-C2: hovering/focusing the badge = attention on the town —
        // announce it to the prefetch seam (deduped downstream).
        onMouseEnter={() => onTownFocus?.(town.id)}
        onFocus={() => onTownFocus?.(town.id)}
      >
        {dotSev && !dotLink ? dotSpan : null}
        {children}
      </a>
    )
    // The badge anchor goes STATIC inside the column's badge slot, so
    // the linked alert dot sits at the badge's top-right corner (the
    // old -7px/-7px offset) — no nested anchors, both links siblings.
    return (
      <span
        key={town.id}
        className="town-marker"
        style={markerStyle}
        data-town-id={town.id}
        data-testid={`town-marker-${town.id}`}
      >
        <span className="town-marker-badge town-badge-slot">
          {badge}
          {dotLink}
        </span>
        <span className="town-marker-label" data-testid={`town-label-${town.id}`} data-town-id={town.id}>
          {town.name}
        </span>
        <span className="town-marker-dot" aria-hidden="true" />
      </span>
    )
  }

  // W4-B3 cluster marker: ONE stacked B1 column [cluster-badge][label][dot]
  // anchored at the representative town's point. The badge carries the
  // shared rounded temp, the representative name + "+N" hidden members
  // ("Moore +2"), and the rep's icon/alert-dot seams. It is a real
  // focusable <button> (>=44px via CSS, R13) whose click IS the fly-to law:
  // fly to the group centroid and bump zoom to CLUSTER_MAX_ZOOM, where
  // grouping returns null and every member renders its own badge. No
  // sticky expand state — expansion is a pure function of zoom (R17).
  const renderCluster = (group: BadgeGroup): ReactNode => {
    const rep = group.rep
    const label = clusterLabel(group)
    const p = map.project([rep.lon, rep.lat])
    const temp = temps[rep.id]
    const hasTemp = typeof temp === 'number' && Number.isFinite(temp)
    const code = codes?.[rep.id]
    const mapped = code === undefined || code === null ? null : weathercodeToIcon(code)
    const Icon = mapped?.icon
    const sev = alerts?.[rep.id]
    const tempText = hasTemp ? formatTemp(temp, unit) : 'awaiting feed'
    return (
      <span
        key={`cluster-${rep.id}`}
        className="town-marker"
        style={{ left: `${p.x}px`, top: `${p.y}px` }}
        data-town-id={rep.id}
        data-testid={`town-marker-cluster-${rep.id}`}
        data-cluster-size={group.members.length}
        data-cluster-town-ids={group.members.map((m) => m.id).join(',')}
      >
        <span className="town-marker-badge town-badge-slot">
          <button
            type="button"
            className={`town-badge town-badge-cluster${hasTemp ? ' is-live' : ''}`}
            data-testid={`town-badge-cluster-${rep.id}`}
            data-cluster-size={group.members.length}
            aria-label={`${label}: ${tempText} — expand ${group.members.length} same-temp towns`}
            title={`Same-temp group: ${group.members.map((m) => m.name).join(', ')} — click to expand`}
            // W4-C2: a cluster badge is attention on EVERY member town —
            // announce each one (the LRU cap keeps the ring ≤3).
            onMouseEnter={() => {
              for (const m of group.members) onTownFocus?.(m.id)
            }}
            onFocus={() => {
              for (const m of group.members) onTownFocus?.(m.id)
            }}
            onClick={() => {
              // Fly-to law: centroid + zoom bump = expand in place.
              requestFlyTo({ lon: group.centroid.lon, lat: group.centroid.lat, zoom: CLUSTER_MAX_ZOOM })
            }}
          >
            {hasTemp && Icon && mapped ? (
              <span
                className="town-badge-icon"
                data-weathercode={code as number}
                data-weather-bucket={mapped.bucket}
                title={mapped.label}
              >
                <Icon size={14} aria-hidden="true" />
              </span>
            ) : null}
            <span className="town-badge-temp">{tempText}</span>
            <span className="town-badge-cluster-count">{label}</span>
          </button>
          {sev ? (
            <span
              className="town-badge-alert-dot"
              data-alert-severity={sev}
              data-testid={`alert-dot-cluster-${rep.id}`}
              title={`Active alert: ${sev}`}
            />
          ) : null}
        </span>
        {/* NO DOM label span: below CLUSTER_MAX_ZOOM the canvas basemap
            owns town names (one readable name per town is the law — a DOM
            label here would duplicate the canvas text). The cluster NAME
            lives in the badge itself ("Moore +2"). */}
        <span className="town-marker-dot" aria-hidden="true" />
      </span>
    )
  }

  if (groups) {
    // Clustering ON (zoom < CLUSTER_MAX_ZOOM): one column per group —
    // clusters render collapsed, solo towns render exactly as before.
    return (
      <div className="town-badges" data-testid="town-badges">
        {groups.map((g) =>
          g.members.length > 1 ? renderCluster(g) : renderSolo(g.members[0]),
        )}
      </div>
    )
  }

  // Solo path (zoom >= CLUSTER_MAX_ZOOM, clustering OFF): the pre-B3 DOM,
  // byte-identical — every badge-visible town gets its column.
  return (
    <div className="town-badges" data-testid="town-badges">
      {visible.map(renderSolo)}
    </div>
  )
}
