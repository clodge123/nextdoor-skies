// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MapContext, type MapLike } from '../src/lib/map/map-context'
import { TownBadges } from '../src/components/TownBadges'
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
    expect(badge.textContent).toBe('22°')
    expect(screen.getByTestId('town-badge-faraway').textContent).toBe('4°')
  })

  it('shows honest "awaiting feed" for towns without data (R19)', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{}} />
      </MapContext.Provider>,
    )
    expect(screen.getByTestId('town-badge-springfield').textContent).toBe('awaiting feed')
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
      render(
        <MapContext.Provider value={stubMap(10)}>
          <TownBadges towns={towns} temps={{ springfield: 10 }} />
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
    expect(screen.getByTestId('town-badge-springfield').textContent).toContain('22°')
  })

  it('renders NO icon for a town with no weathercode data (R19 honest)', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{ springfield: 21.6 }} />
      </MapContext.Provider>,
    )
    expect(screen.queryByTestId('weather-icon-springfield')).toBeNull()
    expect(screen.getByTestId('town-badge-springfield').textContent).toContain('22°')
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

  it('fade-in law: chip carries is-live ONLY when data has arrived (CSS keyed on data, no JS timers)', () => {
    const { rerender } = render(
      <MapContext.Provider value={stubMap(10)}>
        <TownBadges towns={towns} temps={{}} />
      </MapContext.Provider>,
    )
    // No data yet: no is-live class, honest "awaiting feed" text visible.
    const badge = screen.getByTestId('town-badge-springfield')
    expect(badge.className).not.toContain('is-live')
    expect(badge.textContent).toBe('awaiting feed')

    // Data arrives: the class flips in the SAME render pass — the CSS
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
    expect(live.textContent).toContain('10°')
    // "awaiting feed" is gone once real data exists.
    expect(live.textContent).not.toContain('awaiting feed')
  })
})
