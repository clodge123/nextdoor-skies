// W3-IDENTITY — nickname + town identity picker (docs/WAVE-2-CONTRACTS.md §S1).
// Exported for the integrator (W6); NOT mounted globally by this lane.
// Deterministic law (R17): no RNG or wall-clock calls; debounce uses a fixed
// setTimeout delay. R20: geometry via var(--radius) only.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  gazetteerTowns,
  isValidNickname,
  sanitizeNickname,
  SESSION_STORAGE_KEY,
  getSession,
  setSession,
  clearSession,
  townSlug,
  NICKNAME_MAX,
} from '../lib/session';
import { nearestTown, type TownPoint } from '../lib/map/gazetteer';

const DEBOUNCE_MS = 150;
const MAX_RESULTS = 8;

export interface IdentityPickerProps {
  /** Called after a session is saved. */
  onSaved?: (session: { nickname: string; townSlug: string; townName: string }) => void;
}

/**
 * Deterministic search ranking over the gazetteer:
 * 1) name-prefix matches first, 2) then substring matches; each group sorted
 * by pop desc, then name asc, then lat asc, then lon asc. Pure, no clock/RNG.
 */
export function rankTowns(query: string, towns: TownPoint[]): TownPoint[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const prefix: TownPoint[] = [];
  const contains: TownPoint[] = [];
  for (const t of towns) {
    const name = t.name.toLowerCase();
    if (name.startsWith(q)) prefix.push(t);
    else if (name.includes(q)) contains.push(t);
  }
  const byPop = (a: TownPoint, b: TownPoint) =>
    b.pop - a.pop ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
    a.lat - b.lat ||
    a.lon - b.lon;
  return [...prefix.sort(byPop), ...contains.sort(byPop)].slice(0, MAX_RESULTS);
}

export function IdentityPicker({ onSaved }: IdentityPickerProps = {}) {
  const [session, setSessionState] = useState(() => getSession());
  const [nickname, setNickname] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [picked, setPicked] = useState<TownPoint | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search (fixed delay — deterministic).
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const results = useMemo(() => rankTowns(debouncedQuery, gazetteerTowns), [debouncedQuery]);

  const save = () => {
    const nick = sanitizeNickname(nickname);
    if (!isValidNickname(nick)) {
      setStatus(`Nickname must be 2–${NICKNAME_MAX} characters.`);
      return;
    }
    const town = picked ?? (query.trim() ? gazetteerTowns.find((t) => t.name.toLowerCase() === query.trim().toLowerCase()) ?? null : null);
    if (!town) {
      setStatus('Pick a town from the list, or use your location.');
      return;
    }
    try {
      const next = { nickname: nick, townSlug: townSlug(town), townName: town.name };
      setSession(next);
      setSessionState(getSession());
      setStatus(null);
      onSaved?.(next);
    } catch {
      setStatus('Could not save that identity.');
    }
  };

  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('Location unavailable here — search for your town instead.');
      return;
    }
    setLocating(true);
    setStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const town = nearestTown(gazetteerTowns, pos.coords.latitude, pos.coords.longitude);
        setPicked(town);
        setQuery(town.name);
        setDebouncedQuery('');
        setStatus(`Nearest town: ${town.name} (${town.pop.toLocaleString('en-US')} people)`);
      },
      () => {
        setLocating(false);
        setPicked(null);
        setStatus('Location denied — search for your town below.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const signOut = () => {
    clearSession();
    setSessionState(null);
    setNickname('');
    setPicked(null);
    setQuery('');
    setStatus(null);
  };

  if (session) {
    return (
      <div className="identity-picker" data-testid="identity-signed-in">
        <span data-testid="identity-summary">
          {session.nickname} · {session.townName}
        </span>
        <button type="button" onClick={signOut} data-testid="identity-signout">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="identity-picker" data-testid="identity-picker">
      <label htmlFor="nds-nickname">Nickname</label>
      <input
        id="nds-nickname"
        data-testid="identity-nickname"
        value={nickname}
        maxLength={NICKNAME_MAX}
        placeholder="2–24 characters"
        onChange={(e) => setNickname(e.target.value)}
      />
      <label htmlFor="nds-town">Town</label>
      <input
        id="nds-town"
        data-testid="identity-town-search"
        value={query}
        placeholder="Search 21,613 towns…"
        role="combobox"
        aria-expanded={results.length > 0}
        onChange={(e) => {
          setQuery(e.target.value);
          setPicked(null);
        }}
      />
      <button type="button" onClick={useMyLocation} disabled={locating} data-testid="identity-locate">
        {locating ? 'Locating…' : 'Use my location'}
      </button>
      {results.length > 0 && (
        <ul role="listbox" data-testid="identity-results">
          {results.map((t) => (
            <li key={`${t.name}-${t.lat}-${t.lon}`}>
              <button
                type="button"
                data-testid="identity-town-option"
                onClick={() => {
                  setPicked(t);
                  setQuery(t.name);
                  setDebouncedQuery('');
                  setStatus(null);
                }}
              >
                {t.name} · {t.pop.toLocaleString('en-US')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && <p data-testid="identity-picked">Picked: {picked.name}</p>}
      {status && (
        <p role="status" data-testid="identity-status">
          {status}
        </p>
      )}
      <button type="button" onClick={save} data-testid="identity-save">
        Save identity
      </button>
      <input type="hidden" data-storage-key={SESSION_STORAGE_KEY} readOnly />
    </div>
  );
}

export default IdentityPicker;
