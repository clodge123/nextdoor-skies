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
      <MapContext.Provider value={stubMap(8)}>
        <TownBadges towns={towns} temps={{ springfield: 21.6, faraway: 4 }} />
      </MapContext.Provider>,
    )
    const badge = screen.getByTestId('town-badge-springfield')
    expect(badge.textContent).toBe('22°')
    expect(screen.getByTestId('town-badge-faraway').textContent).toBe('4°')
  })

  it('shows honest "awaiting feed" for towns without data (R19)', () => {
    render(
      <MapContext.Provider value={stubMap(8)}>
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
      <MapContext.Provider value={stubMap(8)}>
        <TownBadges towns={towns} temps={{ springfield: 10 }} />
      </MapContext.Provider>,
    )
    const badge = screen.getByTestId('town-badge-springfield')
    expect(badge.getAttribute('style')).toContain('left: 896.501px')
    expect(badge.getAttribute('style')).toContain('top: 397.817px')
  })

  it('throws a clear seam error without map context', () => {
    expect(() => render(<TownBadges towns={towns} temps={{}} />)).toThrow(/no map instance/)
  })
})
