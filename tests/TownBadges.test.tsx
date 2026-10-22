// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    const badge = screen.getByTestId('town-badge-springfield')
    expect(badge.getAttribute('style')).toContain('left: 896.501px')
    expect(badge.getAttribute('style')).toContain('top: 397.817px')
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
