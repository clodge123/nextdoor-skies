// W3-E2 TOUR — pure state machine tests (session 5 law: 3 steps, seen-once,
// replayable, honest private-mode fallback). No DOM beyond localStorage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOUR_SEEN_KEY,
  TOUR_STEPS,
  markTourSeen,
  nextStepIndex,
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

  it('nextStepIndex walks 0 -> 1 -> 2 -> null (no step past the end)', () => {
    expect(nextStepIndex(0)).toBe(1);
    expect(nextStepIndex(1)).toBe(2);
    expect(nextStepIndex(2)).toBeNull();
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
