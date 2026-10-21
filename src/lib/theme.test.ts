// L4 vitest suite — setAccent mapping + theme persistence (Gate 0, unit).
// Determinism law honored: fixed inputs only, no Math.random/Date.now/new Date.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCENT_COLORS,
  getStoredTheme,
  initTheme,
  setAccent,
  setTheme,
  systemTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
  type WeatherAccent,
} from './theme';

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.removeProperty('--current-accent');
  window.localStorage.clear();
});

describe('setAccent weather→color mapping (R12)', () => {
  const expected: Record<WeatherAccent, string> = {
    rain: '#38bdf8',
    storm: '#a855f7',
    snow: '#e0f2fe',
    clear: '#00ff9d',
    heat: '#f97316',
  };

  for (const [name, color] of Object.entries(expected)) {
    it(`maps ${name} -> ${color}`, () => {
      setAccent(name as WeatherAccent);
      expect(document.documentElement.style.getPropertyValue('--current-accent')).toBe(color);
    });
  }

  it('ACCENT_COLORS table matches the brief exactly', () => {
    expect(ACCENT_COLORS).toEqual(expected);
  });
});

describe('theme persistence', () => {
  it('setTheme writes data-theme on html and persists to localStorage nds-theme', () => {
    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    setTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('initTheme restores the stored theme over system preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const theme = initTheme();
    expect(theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('initTheme falls back to prefers-color-scheme when nothing stored', () => {
    const match = vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    vi.stubGlobal('matchMedia', match);
    expect(systemTheme()).toBe('light');
    expect(initTheme()).toBe('light');
    vi.unstubAllGlobals();
  });

  it('toggleTheme flips dark<->light and persists', () => {
    setTheme('dark');
    expect(toggleTheme()).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(toggleTheme()).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('getStoredTheme returns null for junk values', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(getStoredTheme()).toBeNull();
  });
});
