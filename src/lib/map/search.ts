// W3-B4 SEARCH — pure town filter for the header search combobox (wave-3
// session 2 decision 3: "Header search box (towns combobox)").
//
// Law: deterministic, pure string transforms (R17 — no clock, no RNG, no
// network). The gazetteer (src/lib/map/gazetteer.ts, ~215 baked towns) is
// the single source of truth; search reads the SAME TownPoint records the
// badges, labels, panel, and fly-to seam use.
//
// Ranking (documented, stable):
//   1. prefix matches ("sal" -> Salina, Salida) rank above substring-only
//      matches ("sal" also hits "Solana");
//   2. population descending (the town you most likely mean surfaces first);
//   3. name ascending, then lat, then lon — total order, no ties.
import type { TownPoint } from './gazetteer';

/** Results cap keeps the dropdown + keyboard walk bounded. */
export const SEARCH_MAX_RESULTS = 8;

/** Lowercase, accents stripped, non-alnum collapsed to single spaces. Pure. */
export function normalizeTownQuery(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Towns matching `query` (case/accent-insensitive substring), ranked per the
 * law above, capped at `max`. Empty/whitespace query matches NOTHING — the
 * dropdown stays closed until the user actually types.
 */
export function filterTowns(
  towns: readonly TownPoint[],
  query: string,
  max: number = SEARCH_MAX_RESULTS,
): TownPoint[] {
  const q = normalizeTownQuery(query);
  if (!q) return [];
  const matches = towns.filter((t) => normalizeTownQuery(t.name).includes(q));
  const rank = (t: TownPoint): number => (normalizeTownQuery(t.name).startsWith(q) ? 0 : 1);
  return matches
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        b.pop - a.pop ||
        a.name.localeCompare(b.name) ||
        a.lat - b.lat ||
        a.lon - b.lon,
    )
    .slice(0, max);
}
