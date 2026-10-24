// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MapContext, type MapLike } from '../src/lib/map/map-context'
import { TownBadges, badgesForZoom, visibleBadges, type TownBadgeCoord } from '../src/components/TownBadges'
import { labelVisibleAtZoom } from '../src/lib/map/tiers'
import { subscribeFlyTo } from '../src/lib/map/fly-to'
import type { TownCoord } from '../src/lib/weather/openmeteo-batch'

const towns: TownCoord[] = [
  { id: 'springfield', name: 'Springfield', lat: 39.7817, lon: -89.6501 },
  { id: 'faraway', name: 'Faraway', lat: 44.9778, lon: -93.265 },
]

function stubMap(zoom: number): MapLike {
  return {
    project: ([lon, lat]) => ({ x: lon * -10, y: lat * 10 }),
    getZoom: () => zoom,
    getBounds: () => ({ west: -90, east: -89, south: 39, north: 40 }),
  }
}

describe('TownBadges', () => {
  it('renders rounded temp numbers over towns when zoomed in', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{ springfield: 21.6, faraway: 4 }} />
      </MapContext.Provider>,
    )
    const badge = screen.getByTestId('town-badge-springfield')
    expect(badge.textContent).toBe('71°F')
    expect(screen.getByTestId('town-badge-faraway').textContent).toBe('39°F')
  })

  it('renders NO badge for towns without data (W4-BF display law: "if it says awaiting feed, don\'t show it")', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{}} />
      </MapContext.Provider>,
    )
    // No placeholder chips: a badge exists ONLY once real weather data
    // arrived for its town (owner round 3). Honest absence, not fake text.
    expect(screen.queryByTestId('town-badge-springfield')).toBeNull()
    expect(screen.queryByTestId('town-badge-faraway')).toBeNull()
    expect(screen.queryByTestId(/town-marker/)).toBeNull()
  })

  it('hides badges below the zoom grade', () => {
    render(
      <MapContext.Provider value={stubMap(5)}>
        <TownBadges towns={towns} temps={{ springfield: 10 }} />
      </MapContext.Provider>,
    )
    expect(screen.queryByTestId('town-badge-springfield')).toBeNull()
  })

  it('positions badges via map.project()', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{ springfield: 10 }} />
      </MapContext.Provider>,
    )
    // W4-B1: the ANCHOR moved from the badge element to the stacked marker
    // column [badge][label][dot] — the column is placed by map.project().
    const marker = screen.getByTestId('town-marker-springfield')
    expect(marker.getAttribute('style')).toContain('left: 896.501px')
    expect(marker.getAttribute('style')).toContain('top: 397.817px')
    // The badge stays INSIDE the column (all badge selectors intact).
    const badge = screen.getByTestId('town-badge-springfield')
    expect(marker.contains(badge)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // W4-B1 BADGE-ABOVE-LABEL (wave-4 session 1, decision 3): the marker is a
  // stacked column [badge][label][dot] — DOM order puts the badge strictly
  // above the label, so overlap is geometrically impossible.
  // -------------------------------------------------------------------------
  describe('W4-B1 badge-above-label stacking', () => {
    it('renders the column [badge][label][dot] in order with the town name', () => {
      render(
        <MapContext.Provider value={stubMap(10)}>
          <TownBadges towns={towns} temps={{ springfield: 21.6 }} />
        </MapContext.Provider>,
      )
      const marker = screen.getByTestId('town-marker-springfield')
      const kids = Array.from(marker.children)
      expect(kids.map((k) => k.className)).toEqual([
        'town-marker-badge',
        'town-marker-label',
        'town-marker-dot',
      ])
      // The label is the town's real name (never covered — the badge sits
      // above it in the column flow).
      expect(marker.textContent).toContain('Springfield')
      const badge = screen.getByTestId('town-badge-springfield')
      const label = screen.getByTestId('town-label-springfield')
      expect(marker.contains(badge)).toBe(true)
      expect(marker.contains(label)).toBe(true)
    })

    it('panel-linked markers keep the same stacked column (dot link inside the badge slot)', () => {
      render(
        <MapContext.Provider value={stubMap(10)}>
          <TownBadges
            towns={towns}
            temps={{ springfield: 10 }}
            alerts={{ springfield: 'Severe' }}
            panelHrefFor={(id) => `/?panel=${id}`}
            onPanelOpen={vi.fn()}
            onAlertOpen={vi.fn()}
          />
        </MapContext.Provider>,
      )
      const marker = screen.getByTestId('town-marker-springfield')
      const kids = Array.from(marker.children)
      expect(kids.map((k) => k.className)).toEqual([
        'town-marker-badge town-badge-slot',
        'town-marker-label',
        'town-marker-dot',
      ])
      // Badge link + alert dot link are siblings inside the badge slot.
      const badgeSlot = kids[0]
      expect(badgeSlot.querySelector('a.town-badge')).not.toBeNull()
      expect(badgeSlot.querySelector('a.town-badge-alert-dot-link')).not.toBeNull()
      // The label sits BELOW the badge slot in the column (bbox law partner).
      expect(kids[1].textContent).toBe('Springfield')
    })

    it('every badge-visible town gets a readable DOM label (names never covered)', () => {
      // W4-BF display law: a badge (and its label column) renders ONLY for
      // towns with real weather data — both towns carry temps here.
      render(
        <MapContext.Provider value={stubMap(10)}>
          <TownBadges towns={towns} temps={{ springfield: 10, faraway: 5 }} />
        </MapContext.Provider>,
      )
      expect(screen.getByTestId('town-label-springfield').textContent).toBe('Springfield')
      expect(screen.getByTestId('town-label-faraway').textContent).toBe('Faraway')
    })
  })

  // W3-B2 TOWN PANEL: badges afford clicking — with panelHrefFor they are
  // links carrying the ?panel=<slug> URL (lib/panel.ts scheme); without it
  // they stay inert divs (pre-panel behavior, e2e specs unaffected).
  describe('W3-B2 panel affordance', () => {
    it('badges are links to the panel URL when panelHrefFor is set', () => {
      render(
        <MapContext.Provider value={stubMap(10)}>
          <TownBadges
            towns={towns}
            temps={{ springfield: 10 }}
            panelHrefFor={(id) => `/?panel=${id}`}
          />
        </MapContext.Provider>,
      )
      const badge = screen.getByTestId('town-badge-springfield')
      expect(badge.tagName).toBe('A')
      expect(badge).toHaveAttribute('href', '/?panel=springfield')
      expect(badge).toHaveAttribute('data-panel', '1')
      expect(badge.className).toContain('town-badge-clickable')
    })

    it('badges stay inert divs with no panelHrefFor', () => {
      render(
        <MapContext.Provider value={stubMap(10)}>
          <TownBadges towns={towns} temps={{ springfield: 10 }} />
        </MapContext.Provider>,
      )
      const badge = screen.getByTestId('town-badge-springfield')
      expect(badge.tagName).toBe('DIV')
      expect(badge).not.toHaveAttribute('href')
    })
  })

  it('renders alert dots for towns with active alerts (S6 seam)', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges
          towns={towns}
          temps={{ springfield: 10 }}
          alerts={{ springfield: 'Severe', faraway: null }}
        />
      </MapContext.Provider>,
    )
    const dot = screen.getByTestId('alert-dot-springfield')
    expect(dot.getAttribute('data-alert-severity')).toBe('Severe')
    expect(screen.queryByTestId('alert-dot-faraway')).toBeNull()
  })

  it('renders no dots when the alerts map is absent', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{ springfield: 10 }} />
      </MapContext.Provider>,
    )
    expect(screen.queryByTestId(/alert-dot-/)).toBeNull()
  })

  // -------------------------------------------------------------------------
  // W3-B3 CLICK-TO-DETAIL (session 2 decision 4): badges are keyboard-
  // reachable links; the alert DOT routes straight to /alerts.
  // -------------------------------------------------------------------------
  describe('W3-B3 click-to-detail', () => {
    it('badge links carry an accessible name (aria-label) for Tab users', () => {
      render(
        <MapContext.Provider value={stubMap(10)}>
          <TownBadges
            towns={towns}
            temps={{ springfield: 10 }}
            panelHrefFor={(id) => `/?panel=${id}`}
          />
        </MapContext.Provider>,
      )
      const badge = screen.getByTestId('town-badge-springfield')
      expect(badge.tagName).toBe('A')
      expect(badge).toHaveAttribute('aria-label', 'Open Springfield town panel')
    })

    it('alert dot becomes a link to /alerts when onAlertOpen is wired', () => {
      const onAlertOpen = vi.fn()
      render(
        <MapContext.Provider value={stubMap(10)}>
          <TownBadges
            towns={towns}
            temps={{ springfield: 10 }}
            alerts={{ springfield: 'Severe', faraway: null }}
            panelHrefFor={(id) => `/?panel=${id}`}
            onPanelOpen={vi.fn()}
            onAlertOpen={onAlertOpen}
          />
        </MapContext.Provider>,
      )
      const dot = screen.getByTestId('alert-dot-springfield')
      expect(dot.tagName).toBe('A')
      expect(dot).toHaveAttribute('href', '/alerts')
      expect(dot).toHaveAttribute('data-alert-severity', 'Severe')
      expect(dot).toHaveAttribute(
        'aria-label',
        'Springfield: active Severe alert — open alerts page',
      )
      fireEvent.click(dot, { button: 0 })
      expect(onAlertOpen).toHaveBeenCalledWith('springfield')
      // No dot for a town without alerts.
      expect(screen.queryByTestId('alert-dot-faraway')).toBeNull()
    })

    it('dot click does NOT open the panel (deepest intent wins)', () => {
      const onPanelOpen = vi.fn()
      render(
        <MapContext.Provider value={stubMap(10)}>
          <TownBadges
            towns={towns}
            temps={{ springfield: 10 }}
            alerts={{ springfield: 'Severe' }}
            panelHrefFor={(id) => `/?panel=${id}`}
            onPanelOpen={onPanelOpen}
            onAlertOpen={vi.fn()}
          />
        </MapContext.Provider>,
      )
      fireEvent.click(screen.getByTestId('alert-dot-springfield'), { button: 0 })
      expect(onPanelOpen).not.toHaveBeenCalled()
    })

    it('without onAlertOpen the dot stays the S6 decorative span (unchanged)', () => {
      render(
        <MapContext.Provider value={stubMap(10)}>
          <TownBadges
            towns={towns}
            temps={{ springfield: 10 }}
            alerts={{ springfield: 'Severe' }}
            panelHrefFor={(id) => `/?panel=${id}`}
            onPanelOpen={vi.fn()}
          />
        </MapContext.Provider>,
      )
      const dot = screen.getByTestId('alert-dot-springfield')
      expect(dot.tagName).toBe('SPAN')
      expect(dot).toHaveAttribute('data-alert-severity', 'Severe')
    })

    it('badge click routes through onPanelOpen (plain click), modifiers pass through', () => {
      const onPanelOpen = vi.fn()
      render(
        <MapContext.Provider value={stubMap(10)}>
          <TownBadges
            towns={towns}
            temps={{ springfield: 10 }}
            panelHrefFor={(id) => `/?panel=${id}`}
            onPanelOpen={onPanelOpen}
          />
        </MapContext.Provider>,
      )
      const badge = screen.getByTestId('town-badge-springfield')
      fireEvent.click(badge, { button: 0 })
      expect(onPanelOpen).toHaveBeenCalledWith('springfield')
      onPanelOpen.mockClear()
      fireEvent.click(badge, { button: 0, ctrlKey: true })
      expect(onPanelOpen).not.toHaveBeenCalled()
    })
  })

  it('throws a clear seam error without map context', () => {
    expect(() => render(<TownBadges towns={towns} temps={{}} />)).toThrow(/no map instance/)
  })

  // -------------------------------------------------------------------------
  // W3-A2: condition icons + fade-in law (wave-3 session 1, decision 2)
  // -------------------------------------------------------------------------

  it('renders a lucide condition icon beside the temp when a weathercode arrives', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{ springfield: 21.6 }} codes={{ springfield: 61 }} />
      </MapContext.Provider>,
    )
    const icon = screen.getByTestId('weather-icon-springfield')
    expect(icon.getAttribute('data-weathercode')).toBe('61')
    expect(icon.getAttribute('data-weather-bucket')).toBe('rain')
    // A real lucide <svg> is mounted inside the chip.
    expect(icon.querySelector('svg')).not.toBeNull()
    // Temp is still rendered next to the icon.
    expect(screen.getByTestId('town-badge-springfield').textContent).toContain('71°F')
  })

  it('renders NO icon for a town with no weathercode data (R19 honest)', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{ springfield: 21.6 }} />
      </MapContext.Provider>,
    )
    expect(screen.queryByTestId('weather-icon-springfield')).toBeNull()
    expect(screen.getByTestId('town-badge-springfield').textContent).toContain('71°F')
  })

  it('renders the neutral unknown glyph for an out-of-table code', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{ springfield: 5 }} codes={{ springfield: 42 }} />
      </MapContext.Provider>,
    )
    const icon = screen.getByTestId('weather-icon-springfield')
    expect(icon.getAttribute('data-weather-bucket')).toBe('unknown')
    expect(icon.querySelector('svg')).not.toBeNull()
  })

  // -------------------------------------------------------------------------
  // W4-B2 ZOOM-MATCH (session-1 law #4): per-town badge gate == the map's
  // own label visibility. Thresholds are MEASURED (probe table), not guessed.
  // -------------------------------------------------------------------------
  describe('W4-B2 per-town zoom-match gate', () => {
    const tieredTowns: TownBadgeCoord[] = [
      { id: 'metro', name: 'Metro', lat: 40.71, lon: -74.01, tier: 'country' },
      { id: 'capital', name: 'Capital', lat: 30.27, lon: -97.74, tier: 'state' },
      { id: 'midtown', name: 'Midtown', lat: 42.58, lon: -87.82, tier: 'city' },
      { id: 'hamlet', name: 'Hamlet', lat: 38.42, lon: -81.79, tier: 'town' },
    ]

    it('badgesForZoom: tier -> exact label band (measured z1-3/4-6/7-9/10+)', () => {
      const idsAt = (z: number) => badgesForZoom(tieredTowns, z, 9).map((t) => t.id)
      expect(idsAt(2)).toEqual(['metro'])
      expect(idsAt(3)).toEqual(['metro'])
      expect(idsAt(3.9)).toEqual(['metro'])
      expect(idsAt(4)).toEqual(['capital'])
      expect(idsAt(6)).toEqual(['capital'])
      expect(idsAt(7)).toEqual(['midtown'])
      expect(idsAt(9)).toEqual(['midtown'])
      expect(idsAt(10)).toEqual(['hamlet'])
      expect(idsAt(14)).toEqual(['hamlet'])
      expect(idsAt(18)).toEqual(['hamlet'])
    })

    it('badge visible <=> map label visible for one town per tier at z in {6,8,10,12,14}', () => {
      // The acceptance law, unit-level: badge presence mirrors
      // labelVisibleAtZoom(tier, z) exactly — no extra, no missing towns.
      for (const z of [6, 8, 10, 12, 14]) {
        cleanup() // one tree per zoom — stale trees must not pollute the query
        render(
          <MapContext.Provider value={stubMap(z)}>
            <TownBadges towns={tieredTowns} temps={{ metro: 10, capital: 10, midtown: 10, hamlet: 10 }} />
          </MapContext.Provider>,
        )
        for (const t of tieredTowns) {
          const el = screen.queryByTestId(`town-badge-${t.id}`)
          const expected = t.tier ? labelVisibleAtZoom(t.tier, z) : true
          if (expected) expect(el, `${t.id}@${z}`).not.toBeNull()
          else expect(el, `${t.id}@${z}`).toBeNull()
        }
      }
    })

    it('tier-less towns keep the legacy global gate (unit-test seam)', () => {
      render(
        <MapContext.Provider value={stubMap(9)}>
          <TownBadges towns={towns} temps={{ springfield: 10 }} />
        </MapContext.Provider>,
      )
      expect(screen.getByTestId('town-badge-springfield')).toBeTruthy()
      cleanup()
      render(
        <MapContext.Provider value={stubMap(8)}>
          <TownBadges towns={towns} temps={{ springfield: 10 }} />
        </MapContext.Provider>,
      )
      expect(screen.queryByTestId('town-badge-springfield')).toBeNull()
    })

    it('gate is memoized per zoom frame: same inputs -> identical array (no per-frame work)', () => {
      const a = visibleBadges(tieredTowns, 10, 9)
      const b = visibleBadges(tieredTowns, 10, 9)
      expect(b).toBe(a) // cache hit: identical reference, zero recomputation
      const c = visibleBadges(tieredTowns, 11, 9)
      expect(c).not.toBe(a) // zoom changed -> recompute
      const d = visibleBadges(tieredTowns, 11, 9)
      expect(d).toBe(c) // memoized again
      const e = visibleBadges([...tieredTowns], 11, 9)
      expect(e).not.toBe(c) // new towns reference -> recompute
      expect(e.map((t) => t.id)).toEqual(c.map((t) => t.id))
    })

    it('no global cutoff: zoom 4 renders state-tier badges (old gate hid everything < 9)', () => {
      render(
        <MapContext.Provider value={stubMap(4)}>
          <TownBadges towns={tieredTowns} temps={{ capital: 7 }} />
        </MapContext.Provider>,
      )
      expect(screen.getByTestId('town-badge-capital')).toBeTruthy()
      expect(screen.queryByTestId('town-badge-hamlet')).toBeNull()
    })
  })

  it('fade-in law: chip carries is-live ONLY when data has arrived (CSS keyed on data, no JS timers)', () => {
    const { rerender } = render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{}} />
      </MapContext.Provider>,
    )
    // No data yet: NO badge renders (W4-BF display law — the map shows
    // what the feed knows, never a placeholder chip).
    expect(screen.queryByTestId('town-badge-springfield')).toBeNull()

    // Data arrives: the badge appears WITH is-live in the SAME render pass
    // — the CSS
    // transition (.town-badge.is-live .town-badge-data {opacity 0->1}) does
    // the animating; the component schedules no timers.
    rerender(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{ springfield: 10 }} codes={{ springfield: 0 }} />
      </MapContext.Provider>,
    )
    const live = screen.getByTestId('town-badge-springfield')
    expect(live.className).toContain('is-live')
    expect(live.querySelector('.town-badge-data')).not.toBeNull()
    expect(live.textContent).toContain('50°F')
    // "awaiting feed" never exists on the surface (badges hide until data).
    expect(live.textContent).not.toContain('awaiting feed')
  })

  // -------------------------------------------------------------------------
  // W4-B3 DE-CLUSTER (wave-4 session 1, decision 5): same-temp neighbors
  // collapse to ONE badge ("Moore +2") below CLUSTER_MAX_ZOOM (=9); the
  // cluster expands on zoom-in and on tap (fly-to law).
  // -------------------------------------------------------------------------
  describe('W4-B3 same-temp de-clustering', () => {
    // Metro trio: all show 70°F, projected points within 96px (stubMap
    // projects x=-lon*10, y=lat*10 -> ~1 deg lon = 10px; towns here are
    // close-set by construction so distances land well inside radius).
    // tier:'city' => badge-visible z7-9 (W4-B2 zoom-match); z8 exercises
    // the clustering zone (below CLUSTER_MAX_ZOOM=9).
    const metro: TownBadgeCoord[] = [
      { id: 'moore', name: 'Moore', lat: 35.34, lon: -97.49, tier: 'city' },
      { id: 'mustang', name: 'Mustang', lat: 35.38, lon: -97.72, tier: 'city' },
      { id: 'okc', name: 'Oklahoma City', lat: 35.47, lon: -97.51, tier: 'city' },
    ]
    const metroTemps = { moore: 21, mustang: 21.1, okc: 20.9 } // all -> 70°F

    it('low zoom: ONE cluster badge per same-temp group, labeled "Moore +2"', () => {
      render(
        <MapContext.Provider value={stubMap(8)}>
          <TownBadges towns={metro} temps={metroTemps} />
        </MapContext.Provider>,
      )
      const cluster = screen.getByTestId('town-badge-cluster-moore')
      expect(cluster.tagName).toBe('BUTTON') // real focusable affordance (R13)
      expect(cluster.getAttribute('data-cluster-size')).toBe('3')
      expect(cluster.textContent).toContain('Moore +2')
      expect(cluster.textContent).toContain('70°F')
      // ONE badge per group: no individual badges leak alongside it.
      expect(screen.queryByTestId('town-badge-mustang')).toBeNull()
      expect(screen.queryByTestId('town-badge-okc')).toBeNull()
      expect(screen.queryByTestId('town-badge-moore')).toBeNull()
      const markers = screen.getAllByTestId(/town-marker/)
      expect(markers).toHaveLength(1) // one collapsed column, not three
      cleanup()
    })

    it('zoom-in (>= CLUSTER_MAX_ZOOM): cluster expands to individual badges', () => {
      render(
        <MapContext.Provider value={stubMap(9)}>
          <TownBadges towns={metro} temps={metroTemps} />
        </MapContext.Provider>,
      )
      expect(screen.queryByTestId(/town-badge-cluster-/)).toBeNull()
      expect(screen.getByTestId('town-badge-moore')).toBeTruthy()
      expect(screen.getByTestId('town-badge-mustang')).toBeTruthy()
      expect(screen.getByTestId('town-badge-okc')).toBeTruthy()
      cleanup()
    })

    it('tap of the cluster badge = fly-to law: flies to centroid + zoom bump', () => {
      const flies: { lon: number; lat: number; zoom?: number }[] = []
      const off = subscribeFlyTo((r) => flies.push(r))
      render(
        <MapContext.Provider value={stubMap(8)}>
          <TownBadges towns={metro} temps={metroTemps} />
        </MapContext.Provider>,
      )
      fireEvent.click(screen.getByTestId('town-badge-cluster-moore'), { button: 0 })
      off()
      expect(flies).toHaveLength(1)
      // Centroid of the three members (mean lat/lon), zoom bumped to the
      // expand threshold (9) so the map lands on fully-expanded badges.
      const cLon = (metro[0].lon + metro[1].lon + metro[2].lon) / 3
      const cLat = (metro[0].lat + metro[1].lat + metro[2].lat) / 3
      expect(flies[0].lon).toBeCloseTo(cLon, 10)
      expect(flies[0].lat).toBeCloseTo(cLat, 10)
      expect(flies[0].zoom).toBe(9)
      cleanup()
    })

    it('mixed temps: only SAME-temp neighbors merge; odd one out stays solo', () => {
      render(
        <MapContext.Provider value={stubMap(8)}>
          <TownBadges
            towns={[
              metro[0],
              metro[1],
              // W4-BF COLLISION LAW: solo badges collide with cluster
              // badges, so the odd-one-out sits >120px clear of the
              // cluster box (stubMap: 1 deg lat = 10px) — it stays
              // renderable instead of losing the pixel fight.
              { ...metro[2], lat: 48.34 },
            ]}
            temps={{ moore: 21, mustang: 21.1, okc: 4 }} // okc shows 39°F
          />
        </MapContext.Provider>,
      )
      const cluster = screen.getByTestId('town-badge-cluster-moore')
      expect(cluster.getAttribute('data-cluster-size')).toBe('2')
      expect(cluster.textContent).toContain('Moore +1')
      // Oklahoma City keeps its own badge (different shown temp).
      expect(screen.getByTestId('town-badge-okc')).toBeTruthy()
      expect(screen.queryByTestId('town-badge-mustang')).toBeNull()
      cleanup()
    })

    it('tier gating composes BEFORE clustering: gated-out towns never join', () => {
      // z8: city tier visible (z7-9), town tier NOT yet (z10+). The hidden
      // hamlet shares Moore's temp and sits 0.1 deg away — it must NOT
      // inflate the cluster (clustering composes after badgesForZoom).
      const gated: TownBadgeCoord[] = [
        { id: 'moore', name: 'Moore', lat: 35.34, lon: -97.49, tier: 'city' },
        { id: 'hamlet', name: 'Hamlet', lat: 35.35, lon: -97.48, tier: 'town' },
      ]
      render(
        <MapContext.Provider value={stubMap(8)}>
          <TownBadges towns={gated} temps={{ moore: 21, hamlet: 21 }} />
        </MapContext.Provider>,
      )
      // Moore renders SOLO (no partner visible) — not a "+1" cluster.
      expect(screen.getByTestId('town-badge-moore')).toBeTruthy()
      expect(screen.queryByTestId(/town-badge-cluster-/)).toBeNull()
      expect(screen.queryByTestId('town-badge-hamlet')).toBeNull()
      cleanup()
    })

    it('towns without data render NO badges (W4-BF display law)', () => {
      render(
        <MapContext.Provider value={stubMap(8)}>
          <TownBadges towns={metro} temps={{}} />
        </MapContext.Provider>,
      )
      // No data => nothing on the map: no clusters, no solo placeholders.
      expect(screen.queryByTestId(/town-badge/)).toBeNull()
      cleanup()
    })

    it('cluster badge is keyboard-reachable with an honest aria-label', () => {
      render(
        <MapContext.Provider value={stubMap(8)}>
          <TownBadges towns={metro} temps={metroTemps} />
        </MapContext.Provider>,
      )
      const cluster = screen.getByTestId('town-badge-cluster-moore')
      expect(cluster.getAttribute('aria-label')).toBe(
        'Moore +2: 70°F — expand 3 same-temp towns',
      )
      fireEvent.keyDown(cluster, { key: 'Enter' })
      cleanup()
    })

    it('cluster marker is a stacked column with the badge above the dot (B1 law)', () => {
      render(
        <MapContext.Provider value={stubMap(8)}>
          <TownBadges towns={metro} temps={metroTemps} />
        </MapContext.Provider>,
      )
      const marker = screen.getByTestId('town-marker-cluster-moore')
      const kids = Array.from(marker.children)
      expect(kids.map((k) => k.className)).toEqual([
        'town-marker-badge town-badge-slot',
        'town-marker-dot',
      ])
      // No DOM label span: below zoom 9 the CANVAS owns town names (one
      // readable name per town) — the badge itself carries the cluster name.
      const badge = screen.getByTestId('town-badge-cluster-moore')
      expect(marker.contains(badge)).toBe(true)
      cleanup()
    })

    it('determinism: identical inputs render identical DOM (R17)', () => {
      const tree = () => {
        const { unmount } = render(
          <MapContext.Provider value={stubMap(8)}>
            <TownBadges towns={metro} temps={metroTemps} />
          </MapContext.Provider>,
        )
        const html = screen.getByTestId('town-badges').outerHTML
        unmount()
        return html
      }
      expect(tree()).toBe(tree())
    })
  })
})
