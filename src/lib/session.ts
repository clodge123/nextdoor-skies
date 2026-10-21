// W3-IDENTITY — session contract (docs/WAVE-2-CONTRACTS.md §S1).
// No accounts: nickname + town, persisted under localStorage 'nds-session'.
// Deterministic law (R17): no RNG or wall-clock calls anywhere here.
import townsData from '../../data/towns/us-towns.json';
import { type TownPoint, type TownsFile } from './map/gazetteer';

const TOWNS: TownsFile = townsData as TownsFile;

export const SESSION_STORAGE_KEY = 'nds-session';

export interface Session {
  nickname: string;
  townSlug: string;
  townName: string;
}

/** Lowercase, non-alnum -> single dash, trimmed. Same rule as MapPage town ids. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Round to 2dp without float noise in the string form. */
function round2(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Canonical gazetteer slug: slugify(name) + rounded lat/lon (2dp). */
export function townSlug(town: TownPoint): string {
  return `${slugify(town.name)}-${round2(town.lat)}-${round2(town.lon)}`;
}

/**
 * Resolve a free-text town name to its canonical gazetteer slug.
 * Matches by slugify(name); multiple hits (e.g. 21 Springfields) resolve
 * deterministically: highest pop, then lowest lat, then lowest lon.
 * Unknown names fall back to the bare slug (no coordinate suffix).
 */
export function pickTownSlug(name: string): string {
  const slug = slugify(name);
  if (!slug) return '';
  const matches = TOWNS.towns.filter((t) => slugify(t.name) === slug);
  if (matches.length === 0) return slug;
  const best = matches.reduce((a, b) =>
    b.pop !== a.pop
      ? b.pop > a.pop
        ? b
        : a
      : b.lat !== a.lat
        ? b.lat < a.lat
          ? b
          : a
        : b.lon < a.lon
          ? b
          : a,
  );
  return townSlug(best);
}

/**
 * Nickname sanitizer: strips HTML tags, entities, and stray markup chars,
 * removes control characters, collapses whitespace. Output is plain text —
 * safe to store and render as text content.
 */
export function sanitizeNickname(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '') // tags: <b>, <script>...</script> content kept, tags gone
    .replace(/&[a-zA-Z][a-zA-Z0-9]*;|&#\d+;|&#x[0-9a-fA-F]+;/g, '') // entities
    .replace(/[<>&]/g, '') // any leftover markup chars
    .replace(/[\u0000-\u001f\u007f]/g, '') // control chars
    .replace(/\s+/g, ' ')
    .trim();
}

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 24;

/** True when a sanitized nickname is within the 2–24 char contract. */
export function isValidNickname(nick: string): boolean {
  return nick.length >= NICKNAME_MIN && nick.length <= NICKNAME_MAX;
}

/** Read the persisted session; null when absent, unparseable, or malformed. */
export function getSession(): Session | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (
      typeof parsed?.nickname === 'string' &&
      typeof parsed?.townSlug === 'string' &&
      typeof parsed?.townName === 'string' &&
      parsed.nickname.length > 0 &&
      parsed.townSlug.length > 0 &&
      parsed.townName.length > 0
    ) {
      return { nickname: parsed.nickname, townSlug: parsed.townSlug, townName: parsed.townName };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist a session. The nickname is sanitized before storing; throws
 * RangeError when the sanitized nickname is outside 2–24 chars or the town
 * slug is empty. Nothing is written on failure.
 */
export function setSession(s: Session): void {
  const nickname = sanitizeNickname(s.nickname);
  if (!isValidNickname(nickname)) {
    throw new RangeError(`nickname must be ${NICKNAME_MIN}-${NICKNAME_MAX} chars after sanitizing`);
  }
  const townSlug = s.townSlug.trim();
  const townName = s.townName.trim();
  if (!townSlug || !townName) {
    throw new RangeError('session requires a town slug and name');
  }
  const clean: Session = { nickname, townSlug, townName };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(clean));
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* nothing persisted */
  }
}

/** Gazetteer towns, exported for the identity picker's search. */
export const gazetteerTowns: TownPoint[] = TOWNS.towns;
