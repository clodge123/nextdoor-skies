// W3-E2 ONBOARDING TOUR — pure state machine (wave-3 brainstorm session 5:
// "quick 3-step first-visit tour, shown ONCE per unique user, replayable").
//
// Seen-once law (owner ruling, docs/WAVE-3-BRAINSTORM.md §Tour visibility):
// the seen flag lives in localStorage under 'nds-tour-seen'. HONEST fallback:
// when localStorage is unavailable (private mode throws on read AND write),
// the tour shows EVERY visit — we never fake persistence in memory, because
// an in-memory flag silently lies about "seen" across reloads.
//
// Determinism law (R17): pure string transforms, no clock, no RNG. The tour
// is user-driven: NOTHING auto-advances on a timer (R17-clean — no setTimeout
// state machines forcing pages; the bubble only shows a hint).
//
// Replay seam: requestTour() dispatches TOUR_EVENT; the palette command
// 'Show tour' and the phone drawer item 'Take the tour' both call it (same
// seam, module-level event channel — same pattern as requestPanelOpen).

export const TOUR_SEEN_KEY = 'nds-tour-seen';
export const TOUR_EVENT = 'nds-tour-request';

export interface TourStep {
  /** Stable id (React key, test anchor). */
  id: string;
  /** Bubble heading. */
  title: string;
  /** One-sentence body — teaches the feature, sells nothing. */
  body: string;
  /**
   * CSS selectors to spotlight, tried in order; the FIRST visible one wins.
   * Mobile fallbacks are part of the step (e.g. the drawer button stands in
   * for the inline search box hidden <=480px), so one step definition serves
   * every viewport.
   */
  targets: readonly string[];
}

/** Fixed 3-step script (session 5 decision 5 — max 3 steps). */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome-map',
    title: 'Welcome to NextDoor Skies',
    body: 'The map is home: every town badge shows its current temperature (°F by default — flip to °C with the units pill) and condition icon. Tap a badge to open that town\u2019s panel.',
    targets: ['[data-testid="map-view"]'],
  },
  {
    id: 'search',
    title: 'Find a town',
    body: 'Type a town name into the search box and watch the map fly straight to it.',
    targets: ['[data-testid="town-search"]', '[data-testid="nav-menu-button"]'],
  },
  {
    id: 'panel-palette',
    title: 'Alerts & commands',
    body: 'Weather alerts live in this side panel. Press Ctrl/Cmd+K anywhere to open the command palette.',
    targets: ['[data-testid="side-panel"]', '[data-testid="nav-menu-button"]'],
  },
] as const;

/** Is the tour unseen (should show on first load)? Never throws. */
export function shouldShowTour(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) !== '1';
  } catch {
    // Private mode: storage access throws. Honest fallback — show every
    // visit (documented in Tour.tsx; we do NOT pretend persistence works).
    return true;
  }
}

/** Mark the tour seen. Never throws; failure = honest non-persistence. */
export function markTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, '1');
  } catch {
    // Storage unavailable — the tour will show again next visit. Honest.
  }
}

/** Next step index, or null when the tour is done. Pure. */
export function nextStepIndex(index: number): number | null {
  return index + 1 < TOUR_STEPS.length ? index + 1 : null;
}
