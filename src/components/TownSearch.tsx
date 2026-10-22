// W3-B4 SEARCH + FLY-TO — header town search (wave-3 session 2 decision 3:
// "Header search box (towns combobox)"). Desktop/tablet: inline in the app
// header. Phone (<=480px): inside the nav drawer (the drawer instance is the
// phone surface; the inline one is display:none there — see index.css).
//
// BEHAVIOR (URL honesty, per lane brief):
//   - Type-ahead dropdown of gazetteer towns (src/lib/map/search.ts filter:
//     prefix-first, pop-ranked, capped 8). Keyboard navigable: ArrowDown /
//     ArrowUp move the active option, Enter selects, Escape closes ONLY the
//     dropdown (stopPropagation so the open town panel's Esc-close law is
//     untouched — Esc-closes-panel stays owned by TownPanel).
//   - Selecting a town navigates to `/?panel=<slug>` — the SAME scheme a
//     badge click uses (src/lib/panel.ts). The URL stays production-clean:
//     flying does NOT write ?ndsCenter (that param is the e2e center hook
//     only); the panel slug is the whole state, so deep links work.
//   - The animated fly-to (~1.8s eased, wave-1 animation law) is driven by
//     MapPage's panel effect through the fly seam (src/lib/map/fly-to.ts):
//     every panel open — search, badge tap, deep link — flies, and this
//     component stays a pure navigator (no map coupling, no double fly).
//
// R13 law: every interactive target >=44px (input, each option).
// R17 determinism: no clock, no RNG — filtering is pure (lib/map/search.ts).
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import townsData from '../../data/towns/us-towns.json';
import type { TownPoint, TownsFile } from '../lib/map/gazetteer';
import { filterTowns } from '../lib/map/search';
import { panelOpenHref } from '../lib/panel';
import { townSlug } from '../lib/session';

const TOWNS: TownsFile = townsData as TownsFile;

export interface TownSearchProps {
  /** Surface: header-inline (default) or phone nav drawer. */
  variant?: 'inline' | 'drawer';
  /** Extra hook after a selection navigates (drawer instance closes itself). */
  onNavigated?: () => void;
}

export function TownSearch({ variant = 'inline', onNavigated }: TownSearchProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // Static list ids (one inline + one drawer instance; only one visible per
  // viewport). React 19 useId() emits ':' — awkward for CSS/selector
  // contexts (Playwright querySelector); a plain id is deterministic.
  const listId = variant === 'drawer' ? 'town-search-list-drawer' : 'town-search-list-inline';
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo<TownPoint[]>(() => filterTowns(TOWNS.towns, query), [query]);
  const showList = open && query.trim().length > 0;
  const activeId = showList && results.length > 0 ? `${listId}-opt-${active}` : undefined;

  const select = (town: TownPoint) => {
    navigate(panelOpenHref(location.search, townSlug(town)));
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
    onNavigated?.();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => {
        const n = results.length;
        if (n === 0) return 0;
        if (e.key === 'ArrowDown') return i >= n - 1 ? 0 : i + 1;
        return i <= 0 ? n - 1 : i - 1;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const town = results[active] ?? results[0];
      if (town) select(town);
      return;
    }
    if (e.key === 'Escape' && showList) {
      // Close ONLY the dropdown; the panel's Esc law is TownPanel's.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  const testid = variant === 'drawer' ? 'town-search-drawer' : 'town-search';

  return (
    <div className={`town-search town-search-${variant}`} data-testid={testid}>
      <input
        ref={inputRef}
        type="text"
        className="town-search-input"
        placeholder="Search towns…"
        aria-label="Search towns"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {showList ? (
        <ul id={listId} role="listbox" className="town-search-list" aria-label="Town search results">
          {results.length === 0 ? (
            <li className="town-search-empty" data-testid="town-search-empty">
              No towns match
            </li>
          ) : (
            results.map((town, i) => (
              <li
                key={townSlug(town)}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={`town-search-option${i === active ? ' is-active' : ''}`}
                data-testid={`town-search-option-${i}`}
                data-town-slug={townSlug(town)}
                // mousedown (not click): fires before input blur, keeping
                // the combobox focus model intact.
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(town);
                }}
              >
                <span className="town-search-option-name">{town.name}</span>
                <span className="town-search-option-meta">
                  {town.tier} · pop {town.pop.toLocaleString('en-US')}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
