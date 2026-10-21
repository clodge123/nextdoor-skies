// L4 DESIGN-TOKENS-THEME — theme + weather accent API (R12, R20).
// Determinism law: no Math.random / Date.now / new Date anywhere in this module.

export type Theme = 'dark' | 'light';
export type WeatherAccent = 'rain' | 'storm' | 'snow' | 'clear' | 'heat';

/** Weather→accent map (R12). Single source of truth. */
export const ACCENT_COLORS: Record<WeatherAccent, string> = {
  rain: '#38bdf8',
  storm: '#a855f7',
  snow: '#e0f2fe',
  clear: '#00ff9d',
  heat: '#f97316',
};

export const THEME_STORAGE_KEY = 'nds-theme';

export function systemTheme(): Theme {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

export function getStoredTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

/** Apply + persist to localStorage('nds-theme'). */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage unavailable (private mode) — theme still applies for the session.
  }
}

export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Resolve theme: stored choice wins, else prefers-color-scheme, else dark. */
export function initTheme(): Theme {
  const theme = getStoredTheme() ?? systemTheme();
  applyTheme(theme);
  return theme;
}

/** Write --current-accent on <html> for the given weather condition. */
export function setAccent(accent: WeatherAccent): void {
  const color = ACCENT_COLORS[accent];
  document.documentElement.style.setProperty('--current-accent', color);
}

/** Test/browser seam: window.__ndsSetAccent('rain') per lane brief. */
export function installThemeApi(win: Window & typeof globalThis = window): void {
  (win as unknown as Record<string, unknown>).__ndsSetAccent = setAccent;
}

// Auto-expose the seam in any browser context that imports this module.
if (typeof window !== 'undefined') {
  installThemeApi();
}
