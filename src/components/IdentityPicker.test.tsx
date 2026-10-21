// W3-IDENTITY — IdentityPicker component tests: search ranking, save flow,
// geolocation success + denial fallback.
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IdentityPicker from './IdentityPicker';
import { rankTowns } from './IdentityPicker';
import { getSession } from '../lib/session';
import type { TownPoint } from '../lib/map/gazetteer';

afterEach(() => cleanup());
beforeEach(() => localStorage.clear());

const towns: TownPoint[] = [
  { name: 'Springfield', lat: 37.2153, lon: -93.2982, pop: 170188, tier: 'state' },
  { name: 'Springfield', lat: 42.1015, lon: -72.5898, pop: 154341, tier: 'state' },
  { name: 'New Springfield', lat: 40, lon: -75, pop: 500, tier: 'town' },
  { name: 'Oakland', lat: 37.8044, lon: -122.2708, pop: 419267, tier: 'state' },
];

describe('rankTowns', () => {
  it('prefix matches rank above substring matches, pop desc within group', () => {
    const r = rankTowns('spring', towns);
    expect(r.map((t) => t.name)).toEqual(['Springfield', 'Springfield', 'New Springfield']);
    expect(r[0].pop).toBe(170188);
  });

  it('is deterministic across repeated calls', () => {
    for (let i = 0; i < 20; i++) {
      expect(rankTowns('oak', towns).map((t) => t.name)).toEqual(['Oakland']);
    }
  });

  it('empty query returns nothing', () => {
    expect(rankTowns('  ', towns)).toEqual([]);
  });
});

describe('IdentityPicker', () => {
  it('shows the sign-out affordance when a session exists', () => {
    localStorage.setItem('nds-session', JSON.stringify({ nickname: 'Maple', townSlug: 'a-1-2', townName: 'A' }));
    render(<IdentityPicker />);
    expect(screen.getByTestId('identity-signed-in')).toBeInTheDocument();
    expect(screen.getByTestId('identity-summary').textContent).toContain('Maple');
    fireEvent.click(screen.getByTestId('identity-signout'));
    expect(getSession()).toBeNull();
    expect(screen.getByTestId('identity-picker')).toBeInTheDocument();
  });

  it('debounced search lists towns and picking one saves the session', async () => {
    render(<IdentityPicker />);
    fireEvent.change(screen.getByTestId('identity-nickname'), { target: { value: 'Maple' } });
    fireEvent.change(screen.getByTestId('identity-town-search'), { target: { value: 'springfield' } });
    await waitFor(() => expect(screen.getByTestId('identity-results')).toBeInTheDocument());
    const options = screen.getAllByTestId('identity-town-option');
    fireEvent.click(options[0]);
    fireEvent.click(screen.getByTestId('identity-save'));
    expect(getSession()).toEqual({
      nickname: 'Maple',
      townSlug: 'springfield-37.22--93.3',
      townName: 'Springfield',
    });
  });

  it('rejects a too-short nickname with an honest status', () => {
    render(<IdentityPicker />);
    fireEvent.change(screen.getByTestId('identity-nickname'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('identity-save'));
    expect(screen.getByTestId('identity-status').textContent).toMatch(/2–24/);
    expect(getSession()).toBeNull();
  });

  it('geolocation success reverse-resolves the nearest town', async () => {
    const getCurrentPosition = vi.fn(
      (cb: (pos: { coords: { latitude: number; longitude: number } }) => void) => {
        cb({ coords: { latitude: 40.7143, longitude: -74.006 } });
      },
    );
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<IdentityPicker />);
    fireEvent.click(screen.getByTestId('identity-locate'));
    await waitFor(() => expect(screen.getByTestId('identity-status').textContent).toContain('Nearest town: New York City'));
    fireEvent.change(screen.getByTestId('identity-nickname'), { target: { value: 'Compass' } });
    fireEvent.click(screen.getByTestId('identity-save'));
    expect(getSession()?.townName).toBe('New York City');
    vi.unstubAllGlobals();
  });

  it('geolocation denial falls back to the search prompt', async () => {
    const getCurrentPosition = vi.fn(
      (_cb: (pos: unknown) => void, err: (e: { code: number; message: string }) => void) => {
        err({ code: 1, message: 'User denied Geolocation' });
      },
    );
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<IdentityPicker />);
    fireEvent.click(screen.getByTestId('identity-locate'));
    await waitFor(() =>
      expect(screen.getByTestId('identity-status').textContent).toMatch(/denied[\s\S]*search/i),
    );
    expect(getSession()).toBeNull();
    vi.unstubAllGlobals();
  });
});
