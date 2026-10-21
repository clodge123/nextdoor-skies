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

  it('renders the feed placeholder on /feed', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument()
    expect(screen.getByText(/awaiting feed/i)).toBeInTheDocument()
  });
});
