// W4-A1 UNITS-CORE — F/C unit law (wave-4 brainstorm session 1, DECIDED).
//
// Law: Fahrenheit is the DEFAULT unit everywhere. No surface renders raw
// Celsius. The internal pipeline stays Celsius (openmeteo-batch converts the
// proxy's F payload to CurrentTemp.temperatureC — unchanged downstream);
// every RENDERED temperature goes through formatTemp() so the display unit
// is a single source of truth.
//
// Persistence: localStorage key 'nds-units' ('F' | 'C'). Honest default F
// in private mode: localStorage may THROW on read (private browsing) —
// unitFromStorage catches, returns 'F', never lies about persistence.
//
// Change propagation: setUnit writes storage then dispatches the custom
// event 'nds-units-changed' on window. Cross-tab changes arrive via the
// native 'storage' event. useUnits() subscribes to both so every mounted
// surface re-renders on toggle (the header pill is lane W4-A2's seam —
// this module exposes setUnit/getUnit/useUnits for it to wire into).
//
// Determinism law (R17): pure math, no RNG/clock reads.

export type Unit = 'F' | 'C'

/** Storage key (contract: wave-4 brainstorm session 1 decision 2). */
export const UNITS_STORAGE_KEY = 'nds-units'

/** Custom event dispatched on window when the unit changes in THIS tab. */
export const UNITS_CHANGED_EVENT = 'nds-units-changed'

/** Honest fallback when storage is unavailable (private mode) — F. */
export const DEFAULT_UNIT: Unit = 'F'

/** C -> F (pure). */
export function cToF(celsius: number): number {
  return (celsius * 9) / 5 + 32
}

/** F -> C (pure). */
export function fToC(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9
}

/**
 * Format a Celsius reading in the active display unit. Rounded to whole
 * degrees; no trailing '.0'. Examples (C input):
 *   formatTemp(21, 'F') -> '70°F'   formatTemp(-10, 'F') -> '14°F'
 *   formatTemp(0, 'F')  -> '32°F'   formatTemp(24, 'C')  -> '24°C'
 */
export function formatTemp(celsius: number, unit: Unit = getUnit()): string {
  const rounded = Math.round(unit === 'F' ? cToF(celsius) : celsius)
  // Normalize -0 (e.g. round(-0.2) === -0 in JS) so '-0°' never renders.
  const shown = rounded === 0 ? 0 : rounded
  return `${shown}°${unit}`
}

/** Read the stored unit; throws never (private-mode-safe), default 'F'. */
export function unitFromStorage(key: string = UNITS_STORAGE_KEY): Unit {
  try {
    const v = window.localStorage.getItem(key)
    return v === 'C' ? 'C' : DEFAULT_UNIT
  } catch {
    // Private mode: storage access throws. Honest default F, in-memory only.
    return DEFAULT_UNIT
  }
}

/** Current effective unit (reads storage on every call — always honest). */
export function getUnit(): Unit {
  return unitFromStorage()
}

/**
 * Persist the unit choice + broadcast 'nds-units-changed'. In private mode
 * the write throws; we still broadcast so mounted surfaces update for the
 * session (honest: nothing is claimed to be persisted).
 */
export function setUnit(unit: Unit, key: string = UNITS_STORAGE_KEY): void {
  try {
    window.localStorage.setItem(key, unit)
  } catch {
    // storage unavailable — session-only choice, no fake persistence
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent<Unit>(UNITS_CHANGED_EVENT, { detail: unit }))
  }
}

/** Toggle F<->C (the pill's action seam for lane W4-A2). */
export function toggleUnit(): Unit {
  const next: Unit = getUnit() === 'F' ? 'C' : 'F'
  setUnit(next)
  return next
}
