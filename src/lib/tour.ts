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
    body: 'The map is home: every town badge shows its current temperature (°F by default) and condition icon. Switch between °F and °C anytime with the units pill in the header. Tap a badge to open that town\u2019s panel.',
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

// ---------------------------------------------------------------------------
// W4-F1 DESKTOP SPOTLIGHT PLACEMENT — pure, viewport-responsive geometry.
// Owner report: on desktop the tour box hid / sat too high / sat too low.
// Root cause: the old heuristic reserved a fixed 150px for the bubble and
// never clamped the result — any target near a viewport edge pushed the box
// off-screen. Law: the bubble clamps INSIDE the viewport with 16px insets at
// ALL sizes (phone/tablet/desktop) and never covers a targeted element that
// has room beside it (flip below -> above -> last-resort clamp).
// ---------------------------------------------------------------------------

export interface TargetRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BubblePlacement {
  left: number;
  top: number;
}

/** Gap between target and bubble. */
export const BUBBLE_GAP = 16;
/** Viewport insets — the bubble clamps inside these at every size. */
export const VIEWPORT_INSET = 16;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, Math.max(min, max)));

/**
 * Place a bubble of size (bubbleW x bubbleH) beside a target rect inside a
 * viewport (vw x vh). Deterministic + pure — no DOM, no clock (R17).
 * - Horizontal: centered on the target, clamped inside the insets.
 * - Vertical: prefer BELOW the target (gap BUBBLE_GAP); flip ABOVE when below
 *   would clip; then try BESIDE (the roomier side) for tall targets; last
 *   resort clamp fully inside (visible beats unobstructed, e.g. the
 *   full-viewport map target). The bubble is fully inside the viewport for
 *   every input (asserted by tests) and never overlaps a target that has
 *   any room beside it.
 */
export function placeBubble(
  target: TargetRect,
  vw: number,
  vh: number,
  bubbleW: number,
  bubbleH: number,
): BubblePlacement {
  const left = clamp(
    target.x + target.w / 2 - bubbleW / 2,
    VIEWPORT_INSET,
    vw - bubbleW - VIEWPORT_INSET,
  );
  const belowTop = target.y + target.h + BUBBLE_GAP;
  const aboveTop = target.y - BUBBLE_GAP - bubbleH;
  if (belowTop + bubbleH <= vh - VIEWPORT_INSET) {
    return { left, top: belowTop };
  }
  if (aboveTop >= VIEWPORT_INSET) {
    return { left, top: aboveTop };
  }
  // Tall target (no room above/below): slide BESIDE it, on the roomier side.
  const sideLeft =
    target.x >= vw - (target.x + target.w)
      ? clamp(target.x - bubbleW - BUBBLE_GAP, VIEWPORT_INSET, vw - bubbleW - VIEWPORT_INSET)
      : clamp(
          target.x + target.w + BUBBLE_GAP,
          VIEWPORT_INSET,
          vw - bubbleW - VIEWPORT_INSET,
        );
  const sideTop = clamp(target.y + target.h / 2 - bubbleH / 2, VIEWPORT_INSET, vh - bubbleH - VIEWPORT_INSET);
  const overlaps =
    sideLeft < target.x + target.w &&
    target.x < sideLeft + bubbleW &&
    sideTop < target.y + target.h &&
    target.y < sideTop + bubbleH;
  if (!overlaps) {
    return { left: sideLeft, top: sideTop };
  }
  // Last resort (full-viewport target, e.g. the map): fully inside, visible.
  return { left, top: clamp(belowTop, VIEWPORT_INSET, vh - bubbleH - VIEWPORT_INSET) };
}
