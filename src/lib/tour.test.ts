// W3-E2 TOUR — pure state machine tests (session 5 law: 3 steps, seen-once,
// replayable, honest private-mode fallback). No DOM beyond localStorage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOUR_SEEN_KEY,
  TOUR_STEPS,
  VIEWPORT_INSET,
  markTourSeen,
  nextStepIndex,
  placeBubble,
  shouldShowTour,
} from './tour';

describe('tour script (session 5 decision 5)', () => {
  it('exactly 3 steps, fixed order welcome/map -> search -> panel+palette', () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(['welcome-map', 'search', 'panel-palette']);
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
      expect(step.targets.length).toBeGreaterThan(0);
    }
  });

  it('W4-F1 units law: step 1 copy references Fahrenheit + the header units pill', () => {
    const welcome = TOUR_STEPS[0].body;
    expect(welcome).toContain('°F'); // Fahrenheit by default
    expect(welcome).toContain('°C'); // the toggle flips it
    expect(welcome.toLowerCase()).toContain('pill'); // names the UnitToggle seam
  });

  it('nextStepIndex walks 0 -> 1 -> 2 -> null (no step past the end)', () => {
    expect(nextStepIndex(0)).toBe(1);
    expect(nextStepIndex(1)).toBe(2);
    expect(nextStepIndex(2)).toBeNull();
  });
});

describe('W4-F1 viewport-aware bubble placement (placeBubble)', () => {
  const BW = 320;
  const BH = 180;
  const inViewport = (p: { left: number; top: number }, vw: number, vh: number) =>
    p.left >= 0 &&
    p.top >= 0 &&
    p.left + BW <= vw &&
    p.top + BH <= vh;

  it('desktop: target high (header row) -> bubble lands BELOW, fully inside', () => {
    // 1280x800 desktop, search box at y=64 h=40: below fits -> no flip.
    const p = placeBubble({ x: 24, y: 64, w: 260, h: 40 }, 1280, 800, BW, BH);
    expect(p.top).toBe(64 + 40 + 16); // below, gap 16
    expect(inViewport(p, 1280, 800)).toBe(true);
  });

  it('desktop: target low (panel bottom) -> FLIPS ABOVE, fully inside', () => {
    // Target near the bottom: below would clip -> bubble goes above it.
    const p = placeBubble({ x: 900, y: 700, w: 200, h: 48 }, 1280, 800, BW, BH);
    expect(p.top).toBe(700 - 16 - BH); // above, gap 16
    expect(inViewport(p, 1280, 800)).toBe(true);
  });

  it('desktop: target near top edge -> bubble never sits above the viewport', () => {
    // Target flush to y=0: below fits -> bubble below (never clipped up).
    const p = placeBubble({ x: 600, y: 0, w: 120, h: 0 }, 1280, 800, BW, BH);
    expect(p.top).toBe(16); // 0 + 0 + 16 gap
    expect(inViewport(p, 1280, 800)).toBe(true);
  });

  it('horizontal: off-center targets clamp inside 16px insets (left + right)', () => {
    const leftEdge = placeBubble({ x: 0, y: 100, w: 10, h: 30 }, 1280, 800, BW, BH);
    expect(leftEdge.left).toBe(VIEWPORT_INSET);
    const rightEdge = placeBubble({ x: 1270, y: 100, w: 10, h: 30 }, 1280, 800, BW, BH);
    expect(rightEdge.left).toBe(1280 - BW - VIEWPORT_INSET);
    for (const p of [leftEdge, rightEdge]) expect(inViewport(p, 1280, 800)).toBe(true);
  });

  it('huge target (full-viewport map): bubble clamped fully inside, visible', () => {
    // Step 1 targets the map itself — taller than any side gap. The bubble
    // must still be fully inside the viewport (the owner's "hides" bug).
    const p = placeBubble({ x: 0, y: 0, w: 1280, h: 800 }, 1280, 800, BW, BH);
    expect(inViewport(p, 1280, 800)).toBe(true);
    expect(p.top).toBe(800 - BH - VIEWPORT_INSET); // clamped to the bottom inset
  });

  it('tall target (full-height panel): bubble slides BESIDE, never covers it', () => {
    // A 790px-tall panel on desktop: no room above/below -> side placement.
    const target = { x: 600, y: 0, w: 80, h: 790 };
    const p = placeBubble(target, 1280, 800, BW, BH);
    expect(inViewport(p, 1280, 800)).toBe(true);
    const overlaps =
      p.left < target.x + target.w &&
      target.x < p.left + BW &&
      p.top < target.y + target.h &&
      target.y < p.top + BH;
    expect(overlaps).toBe(false);
  });

  it('tablet 768x1024 + phone-tall 390x844 geometry: inside for every target row', () => {
    const viewports: Array<[number, number]> = [
      [1280, 800],
      [768, 1024],
      [390, 844],
    ];
    // Sweep targets across the whole canvas — the box never leaves it.
    for (const [vw, vh] of viewports) {
      for (let y = 0; y <= vh; y += Math.max(1, Math.floor(vh / 12))) {
        for (const x of [0, vw * 0.25, vw * 0.5, vw * 0.75, vw - 40]) {
          const p = placeBubble({ x, y, w: 40, h: 40 }, vw, vh, BW, BH);
          expect(p.left).toBeGreaterThanOrEqual(0);
          expect(p.top).toBeGreaterThanOrEqual(0);
          expect(p.left + BW).toBeLessThanOrEqual(vw);
          expect(p.top + BH).toBeLessThanOrEqual(vh);
        }
      }
    }
  });
});

describe('seen-once law (localStorage nds-tour-seen)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('unseen visitor -> tour should show', () => {
    expect(shouldShowTour()).toBe(true);
  });

  it('markTourSeen flips the flag; the tour then stays hidden', () => {
    markTourSeen();
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1');
    expect(shouldShowTour()).toBe(false);
  });

  it('private mode (getItem throws) -> show every visit, never fake persistence', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage disabled');
    });
    expect(shouldShowTour()).toBe(true); // honest: no in-memory lie
    spy.mockRestore();
  });

  it('markTourSeen never throws when storage is write-disabled', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => markTourSeen()).not.toThrow();
  });
});
