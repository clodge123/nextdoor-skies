// W3-B4 SEARCH — unit gates (vitest): the filter law + the combobox surface.
// (1) filterTowns: pure, deterministic, prefix-first + pop-ranked, capped,
//     accents/case-insensitive, honest 'No towns match' empty state.
// (2) TownSearch (jsdom, MemoryRouter): type-ahead dropdown, keyboard
//     arrows+Enter, selecting navigates to /?panel=<slug> (URL honesty —
//     flying writes nothing to the URL), empty state, Escape closes ONLY
//     the dropdown (the panel's Esc-close law stays TownPanel's).
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import townsData from '../../data/towns/us-towns.json';
import type { TownPoint, TownsFile } from '../lib/map/gazetteer';
import { filterTowns, normalizeTownQuery, SEARCH_MAX_RESULTS } from '../lib/map/search';
import { TownSearch } from './TownSearch';

const TOWNS: TownsFile = townsData as TownsFile;

/** Find a baked town by exact name (fails loudly if the fixture drifts). */
function townNamed(name: string): TownPoint {
  const t = TOWNS.towns.find((x) => x.name === name);
  if (!t) throw new Error(`fixture town missing: ${name}`);
  return t;
}

describe('filterTowns (search law)', () => {
  it('prefix matches rank above substring-only matches', () => {
    const towns: TownPoint[] = [
      { name: 'Solana', lat: 26.947, lon: -82.0259, pop: 99999, tier: 'town' },
      { name: 'Salina', lat: 38.84, lon: -97.61, pop: 5000, tier: 'city' },
      { name: 'Salida', lat: 38.53, lon: -105.99, pop: 500, tier: 'town' },
    ];
    // 'solana' does NOT contain 'sal' — only true substrings qualify;
    // prefix class (Salina, Salida) ranks above substring-only class (none).
    const hits = filterTowns(towns, 'sal');
    expect(hits.map((t) => t.name)).toEqual(['Salina', 'Salida']);
  });

  it('pop ranks within the same match class', () => {
    const towns: TownPoint[] = [
      { name: 'Salem', lat: 44.9, lon: -123.0, pop: 45000, tier: 'city' },
      { name: 'Salem', lat: 37.06, lon: -84.98, pop: 746, tier: 'town' },
    ];
    expect(filterTowns(towns, 'salem')[0].pop).toBe(45000);
  });

  it('case- and accent-insensitive, whitespace-tolerant', () => {
    const towns: TownPoint[] = [{ name: 'Ünion', lat: 40, lon: -105, pop: 100, tier: 'town' }];
    expect(filterTowns(towns, '  UNION ').map((t) => t.name)).toEqual(['Ünion']);
    expect(normalizeTownQuery('Salina  ')).toBe('salina');
  });

  it('empty/whitespace query matches nothing (dropdown stays closed)', () => {
    expect(filterTowns(TOWNS.towns, '')).toEqual([]);
    expect(filterTowns(TOWNS.towns, '   ')).toEqual([]);
  });

  it('results are capped and deterministic across repeated calls', () => {
    const a = filterTowns(TOWNS.towns, 'a');
    const b = filterTowns(TOWNS.towns, 'a');
    expect(a.length).toBeLessThanOrEqual(SEARCH_MAX_RESULTS);
    expect(a.map((t) => t.name)).toEqual(b.map((t) => t.name));
  });

  it('real gazetteer: "sal" surfaces Salina, KS', () => {
    const hits = filterTowns(TOWNS.towns, 'sal');
    expect(hits.some((t) => t.name === 'Salina' && t.lat === townNamed('Salina').lat)).toBe(true);
  });
});

/** Read the router location (MemoryRouter, not window.history). */
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="probe-location">{`${loc.pathname}${loc.search}`}</div>;
}

function renderSearch(at = '/') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <div data-testid="url-probe" />
      <Routes>
        <Route
          path="*"
          element={
            <div>
              <TownSearch />
              <LocationProbe />
            </div>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TownSearch combobox', () => {
  it('type-ahead: typing "sal" lists Salina among the options', () => {
    renderSearch();
    const input = screen.getByRole('combobox', { name: 'Search towns' });
    fireEvent.change(input, { target: { value: 'sal' } });
    const list = screen.getByRole('listbox');
    const options = within(list).getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(SEARCH_MAX_RESULTS);
    expect(list.textContent).toContain('Salina');
  });

  it('keyboard: ArrowDown + Enter selects and navigates to /?panel=<slug>', () => {
    renderSearch();
    const input = screen.getByRole('combobox', { name: 'Search towns' });
    fireEvent.change(input, { target: { value: 'salina' } });
    // Index 0 is Salinas, CA (pop-ranked); ArrowDown lands on Salina, KS.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('probe-location').textContent).toMatch(
      /^\/\?panel=salina-38\.84--97\.61$/,
    );
  });

  it('keyboard: ArrowUp wraps to the last option', () => {
    renderSearch();
    const input = screen.getByRole('combobox', { name: 'Search towns' });
    fireEvent.change(input, { target: { value: 'sal' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const opts = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(opts[opts.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('empty state: no matches shows "No towns match"', () => {
    renderSearch();
    const input = screen.getByRole('combobox', { name: 'Search towns' });
    fireEvent.change(input, { target: { value: 'zzqx' } });
    expect(screen.getByTestId('town-search-empty')).toHaveTextContent('No towns match');
  });

  it('Escape closes the dropdown only — no navigation (panel Esc law intact)', () => {
    renderSearch('/?panel=some-town');
    const input = screen.getByRole('combobox', { name: 'Search towns' });
    fireEvent.change(input, { target: { value: 'sal' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    // URL untouched: closing a dropdown is not a navigation.
    expect(screen.getByTestId('probe-location').textContent).toBe('/?panel=some-town');
  });

  it('mouse: mousedown on an option selects it (blur-safe)', () => {
    renderSearch();
    const input = screen.getByRole('combobox', { name: 'Search towns' });
    fireEvent.change(input, { target: { value: 'salina' } });
    const opts = within(screen.getByRole('listbox')).getAllByRole('option');
    const opt = opts.find((o) => o.getAttribute('data-town-slug') === 'salina-38.84--97.61')!;
    fireEvent.mouseDown(opt);
    expect(screen.getByTestId('probe-location').textContent).toMatch(/^\/\?panel=salina-/);
  });
});
