// W3-IDENTITY — session contract tests (§S1): round-trip, sanitization,
// pickTownSlug determinism, nearest-town resolution.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession,
  gazetteerTowns,
  getSession,
  pickTownSlug,
  sanitizeNickname,
  SESSION_STORAGE_KEY,
  setSession,
  townSlug,
} from './session';
import { nearestTown } from './map/gazetteer';

beforeEach(() => {
  localStorage.clear();
});

describe('session round-trip', () => {
  it('returns null when absent', () => {
    expect(getSession()).toBeNull();
  });

  it('round-trips through localStorage key nds-session', () => {
    setSession({ nickname: 'Maple', townSlug: 'springfield-37.22--93.3', townName: 'Springfield' });
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toContain('Maple');
    expect(getSession()).toEqual({
      nickname: 'Maple',
      townSlug: 'springfield-37.22--93.3',
      townName: 'Springfield',
    });
  });

  it('clearSession removes it', () => {
    setSession({ nickname: 'Maple', townSlug: 'a-1.0-2.0', townName: 'A' });
    clearSession();
    expect(getSession()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('rejects malformed stored JSON', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{not json');
    expect(getSession()).toBeNull();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ nickname: 'x' }));
    expect(getSession()).toBeNull();
  });

  it('setSession rejects nicknames outside 2–24 chars', () => {
    expect(() => setSession({ nickname: 'x', townSlug: 'a', townName: 'A' })).toThrow(RangeError);
    expect(() => setSession({ nickname: 'x'.repeat(25), townSlug: 'a', townName: 'A' })).toThrow(RangeError);
    expect(getSession()).toBeNull();
  });
});

describe('sanitization', () => {
  it('strips script tags and markup', () => {
    expect(sanitizeNickname('<script>alert(1)</script>')).toBe('alert(1)');
    expect(sanitizeNickname('<b>Hi</b>')).toBe('Hi');
    expect(sanitizeNickname('<img src=x onerror=alert(1)>')).toBe('');
  });

  it('strips HTML entities and angle brackets', () => {
    expect(sanitizeNickname('&lt;script&gt;')).toBe('script');
    expect(sanitizeNickname('a&#60;b&#62;c')).toBe('abc');
    expect(sanitizeNickname('<svg/onload="x">')).toBe('');
  });

  it('collapses whitespace and strips control chars', () => {
    expect(sanitizeNickname('  Map\u0000\u0007le   \t \n Fox ')).toBe('Maple Fox');
  });

  it('stores the sanitized nickname, not the raw input', () => {
    setSession({ nickname: '<b>Maple</b>', townSlug: 'a-1-2', townName: 'A' });
    expect(getSession()?.nickname).toBe('Maple');
  });
});

describe('pickTownSlug determinism', () => {
  it('matches the canonical slugify(name)+rounded coords rule', () => {
    expect(pickTownSlug('New York City')).toBe('new-york-city-40.71--74.01');
    expect(pickTownSlug('Chicago')).toBe('chicago-41.85--87.65');
  });

  it('resolves ambiguous names deterministically (highest pop wins)', () => {
    const first = pickTownSlug('Springfield');
    for (let i = 0; i < 50; i++) expect(pickTownSlug('Springfield')).toBe(first);
    // Highest-pop Springfield is Springfield, MO (170,188 people).
    expect(first).toBe('springfield-37.22--93.3');
  });

  it('is case/punctuation insensitive', () => {
    expect(pickTownSlug('  NEW YORK CITY! ')).toBe(pickTownSlug('new york city'));
  });

  it('falls back to bare slug for unknown names', () => {
    expect(pickTownSlug('Zznotatrealplace')).toBe('zznotatrealplace');
    expect(pickTownSlug('   ')).toBe('');
  });

  it('townSlug matches MapPage townId format', () => {
    const t = gazetteerTowns.find((x) => x.name === 'New York City')!;
    expect(townSlug(t)).toBe('new-york-city-40.71--74.01');
  });
});

describe('nearestTown', () => {
  it('finds the nearest town in a synthetic list', () => {
    const towns = [
      { name: 'Near', lat: 40.0, lon: -74.0, pop: 10, tier: 'town' as const },
      { name: 'Far', lat: 30.0, lon: -90.0, pop: 10, tier: 'town' as const },
    ];
    expect(nearestTown(towns, 40.01, -74.01).name).toBe('Near');
  });

  it('breaks distance ties deterministically by pop then name', () => {
    const towns = [
      { name: 'B', lat: 0, lon: 1, pop: 5, tier: 'town' as const },
      { name: 'A', lat: 1, lon: 0, pop: 5, tier: 'town' as const },
      { name: 'Big', lat: 0, lon: 1, pop: 9, tier: 'town' as const },
    ];
    expect(nearestTown(towns, 0, 0).name).toBe('Big');
    expect(nearestTown(towns.slice(0, 2), 0, 0).name).toBe('A');
  });

  it('resolves real coordinates to the NYC gazetteer entry', () => {
    const t = nearestTown(gazetteerTowns, 40.7128, -74.006);
    expect(t.name).toBe('New York City');
  });
});
