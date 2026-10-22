import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

// L12: MapPage now mounts the real <MapView>. jsdom has no WebGL, so mock
// maplibre-gl here exactly like MapView.test.tsx does. getBounds/getZoom are
// stubbed so MapPage's viewport filtering (townsInBbox) runs cleanly.
const fakeMap = {
  on: vi.fn(),
  off: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  // W3-B3: TownLabelTargets projects label/dot targets below zoom 9.
  project: (lnglat: [number, number]) => ({ x: lnglat[0] * -10, y: lnglat[1] * 10 }),
  getCenter: vi.fn(() => ({ lat: 39.8, lng: -98.5 })),
  getZoom: vi.fn(() => 3),
  getBounds: vi.fn(() => ({
    getSouthWest: () => ({ lng: -125, lat: 20 }),
    getNorthEast: () => ({ lng: -60, lat: 55 }),
  })),
  getContainer: vi.fn(() => ({ dataset: {} })),
  remove: vi.fn(),
};
vi.mock('maplibre-gl', () => ({
  default: { Map: vi.fn(() => fakeMap) },
}));

describe('App shell', () => {
  it('renders header nav with Map and Feed links', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('banner')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Map' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Feed' })).toBeInTheDocument()
  });

  it('renders the real map shell on /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Map' })).toBeInTheDocument()
    // L12 wiring: the L5 MapView (with zoom controls) is mounted as page body.
    expect(screen.getByTestId('map-view')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'zoom in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'zoom out' })).toBeInTheDocument()
  });

  it('renders the feed identity gate on /feed', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument()
    // W5: honest gate — no session means no town, so the picker shows first-click.
    expect(screen.getByTestId('identity-picker')).toBeInTheDocument()
  });

  // W3-B1 ROUTING — deep routes resolve from a hard-load path, header nav
  // highlights the active route family, unknown slugs get the honest 404.
  describe('W3-B1 routes', () => {
    const SPRINGFIELD = 'springfield-37.22--93.3'

    it('renders the town page shell on /t/<real-slug>', () => {
      render(
        <MemoryRouter initialEntries={[`/t/${SPRINGFIELD}`]}>
          <App />
        </MemoryRouter>,
      )
      expect(screen.getByTestId('town-page')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Springfield' })).toBeInTheDocument()
      expect(screen.getByTestId('town-open-feed')).toHaveAttribute('href', `/t/${SPRINGFIELD}/feed`)
      // Deep town routes light the Map nav (session 2: town detail lives on the map family).
      expect(screen.getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'page')
    })

    it('renders the town feed seeded with the URL town on /t/<slug>/feed', () => {
      render(
        <MemoryRouter initialEntries={[`/t/${SPRINGFIELD}/feed`]}>
          <App />
        </MemoryRouter>,
      )
      expect(screen.getByTestId('feed-page')).toBeInTheDocument()
      // Seeded with the URL town, not the session town (no session in tests).
      expect(screen.getByTestId('feed-town')).toHaveTextContent('Springfield')
      expect(screen.getByRole('link', { name: 'Feed' })).toHaveAttribute('aria-current', 'page')
    })

    it('renders the honest loading placeholder on /p/<id>', () => {
      render(
        <MemoryRouter initialEntries={['/p/post_123']}>
          <App />
        </MemoryRouter>,
      )
      expect(screen.getByTestId('post-detail-page')).toBeInTheDocument()
      expect(screen.getByTestId('post-detail-loading')).toHaveTextContent(/loading/i)
    })

    it('renders the alert center on /alerts and highlights Alerts nav', () => {
      render(
        <MemoryRouter initialEntries={['/alerts']}>
          <App />
        </MemoryRouter>,
      )
      expect(screen.getByTestId('alerts-page')).toBeInTheDocument()
      // W3-C2: the placeholder is replaced by the real alert center (the
      // jsdom fetch fails -> honest "Checking alerts…", never fake rows).
      expect(screen.getByTestId('alert-center')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Alerts' })).toHaveAttribute('aria-current', 'page')
    })

    it('unknown town slug -> honest 404 page with search box', () => {
      render(
        <MemoryRouter initialEntries={['/t/no-such-town-0.0-0.0']}>
          <App />
        </MemoryRouter>,
      )
      expect(screen.getByTestId('not-found-page')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /404/ })).toBeInTheDocument()
      expect(screen.getByTestId('not-found-slug')).toHaveTextContent('no-such-town-0.0-0.0')
      expect(screen.getByTestId('not-found-search')).toBeInTheDocument()
    })

    it('unknown path -> honest 404 page', () => {
      render(
        <MemoryRouter initialEntries={['/wat']}> 
          <App />
        </MemoryRouter>,
      )
      expect(screen.getByTestId('not-found-page')).toBeInTheDocument()
    })

    it('root highlights Map only', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      )
      expect(screen.getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Feed' })).not.toHaveAttribute('aria-current')
    })
  })
});
