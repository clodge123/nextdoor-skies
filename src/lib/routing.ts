// W3-B1 ROUTING — pure URL route parsing + town-slug resolution.
// Session 2 law (docs/WAVE-3-BRAINSTORM.md): real shareable URLs
// `/`, `/feed`, `/t/<slug>`, `/t/<slug>/feed`, `/p/<id>`, `/alerts`.
// Unknown town slugs resolve to an honest 404 (search box lives in the
// NotFound page, not here — this module is parser-only, clock/RNG-free R17).
import townsData from '../../data/towns/us-towns.json';
import type { TownPoint, TownsFile } from './map/gazetteer';
import { townSlug } from './session';

const TOWNS: TownsFile = townsData as TownsFile;

/** Canonical slug -> town. Built once from the baked gazetteer (pure). */
const SLUG_INDEX = new Map<string, TownPoint>(
  TOWNS.towns.map((t) => [townSlug(t), t]),
);

/** Resolve a canonical town slug against the baked gazetteer. Pure. */
export function resolveTown(slug: string): TownPoint | null {
  return SLUG_INDEX.get(slug) ?? null;
}

export type RouteKind =
  | 'map'
  | 'feed'
  | 'town'
  | 'town-feed'
  | 'post'
  | 'alerts'
  | 'not-found';

export interface ParsedRoute {
  kind: RouteKind;
  /** Town slug for town/town-feed/not-found-from-a-bad-town-url. */
  slug?: string;
  /** Post id for the post route. */
  id?: string;
}

/**
 * Parse a pathname into a route descriptor. Deterministic: strips
 * query/hash, normalizes slashes. A `/t/<slug>` URL whose slug is not in
 * the gazetteer parses as `not-found` while keeping the slug (the 404 page
 * offers search over it).
 */
export function parseRoute(path: string): ParsedRoute {
  const clean = path.split(/[?#]/)[0] ?? '';
  const parts = clean.split('/').filter((p) => p.length > 0);

  if (parts.length === 0) return { kind: 'map' };
  const [head, ...rest] = parts;

  if (head === 'feed' && rest.length === 0) return { kind: 'feed' };
  if (head === 'alerts' && rest.length === 0) return { kind: 'alerts' };
  if (head === 'p' && rest.length === 1 && rest[0]) return { kind: 'post', id: rest[0] };
  if (head === 't' && rest.length >= 1 && rest[0]) {
    const slug = rest[0];
    if (rest.length === 1) {
      return resolveTown(slug)
        ? { kind: 'town', slug }
        : { kind: 'not-found', slug };
    }
    if (rest.length === 2 && rest[1] === 'feed') {
      return resolveTown(slug)
        ? { kind: 'town-feed', slug }
        : { kind: 'not-found', slug };
    }
  }
  return { kind: 'not-found' };
}
