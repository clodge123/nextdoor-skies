// W3-C3 COMMAND PALETTE — command registry + filtering + recents (wave-3
// brainstorm session 3, decision 4: Ctrl+K palette for power users).
//
// Determinism law (R17): filtering is a pure string transform over a fixed
// registry — no clock, no RNG. Recents persist to sessionStorage (per-tab,
// honest empty state when none exist).
//
// Keyboard law: commands carry a SHORTCUT HINT that names an existing app
// shortcut (e.g. 'P' toggles the panel) so the palette teaches the gesture.

export interface PaletteCommand {
  /** Stable id, used for recents + React keys. */
  id: string;
  /** Row label. */
  label: string;
  /** Shortcut hint chip rendered right-aligned (existing app law). */
  hint?: string;
  /** Extra lowercase tokens matched against the query. */
  keywords: string[];
}

/** Fixed registry — the palette is discoverable, not configurable. */
export const COMMANDS: readonly PaletteCommand[] = [
  { id: 'nav-map', label: 'Go to Map', hint: 'G M', keywords: ['map', 'home'] },
  { id: 'nav-feed', label: 'Go to Feed', hint: 'G F', keywords: ['feed', 'posts'] },
  { id: 'nav-alerts', label: 'Go to Alerts', hint: 'G A', keywords: ['alerts', 'warnings', 'nws'] },
  { id: 'toggle-theme', label: 'Toggle theme', hint: 'T', keywords: ['theme', 'dark', 'light'] },
  { id: 'toggle-panel', label: 'Toggle side panel', hint: 'P', keywords: ['panel', 'side', 'alerts'] },
  { id: 'open-alerts-center', label: 'Open alerts center', keywords: ['alerts', 'center', 'panel'] },
  { id: 'go-town', label: 'Go to town…', keywords: ['town', 'jump', 'fly', 'gazetteer'] },
  // W3-E2 TOUR replay seam (session 5: "discreet replay" — owner law).
  { id: 'show-tour', label: 'Show tour', keywords: ['tour', 'onboarding', 'demo', 'help', 'guide'] },
];

/**
 * Filter commands by query: exact-label-prefix matches first, then keyword /
 * substring matches, preserving registry order. Pure, deterministic.
 * Empty query returns [] (the palette then shows recents / town typeahead).
 */
export function filterCommands(query: string, commands: readonly PaletteCommand[] = COMMANDS): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const prefix: PaletteCommand[] = [];
  const rest: PaletteCommand[] = [];
  for (const c of commands) {
    const label = c.label.toLowerCase();
    if (label.startsWith(q)) prefix.push(c);
    else if (c.keywords.some((k) => k.startsWith(q) || k.includes(q)) || label.includes(q)) rest.push(c);
  }
  return [...prefix, ...rest];
}

// --- Recents (sessionStorage, per-tab, honest empty state) -----------------

export const RECENTS_STORAGE_KEY = 'nds-palette-recents';
const MAX_RECENTS = 5;

/** Read the recent-command ids (most recent first). Never throws. */
export function getRecents(): string[] {
  try {
    const raw = window.sessionStorage.getItem(RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter((v): v is string => typeof v === 'string');
    // Only ids that exist in the registry survive (honest: no ghost rows).
    return ids.filter((id) => COMMANDS.some((c) => c.id === id));
  } catch {
    return [];
  }
}

/** Record a command run: dedupe, most-recent-first, cap at MAX_RECENTS. */
export function pushRecent(id: string): void {
  try {
    const next = [id, ...getRecents().filter((r) => r !== id)].slice(0, MAX_RECENTS);
    window.sessionStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode) — recents silently skip.
  }
}

/** Resolve ids to registry commands, dropping unknown ids. */
export function recentCommands(): PaletteCommand[] {
  const byId = new Map(COMMANDS.map((c) => [c.id, c]));
  return getRecents()
    .map((id) => byId.get(id))
    .filter((c): c is PaletteCommand => Boolean(c));
}
