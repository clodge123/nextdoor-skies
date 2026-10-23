// W4-A2 UNIT-TOGGLE — header pill state machine (wave-4 session 1, decision 2).
//
// This module owns ONLY the toggle's own seam: the storage key, the change
// event, the honest F default, and the private-mode honesty rule. The
// conversion lib + `useUnits` hook land in lane W4-A1
// (src/lib/weather/units.ts) IN PARALLEL — this file deliberately contains NO
// conversion math so the two lanes never touch the same file. The frozen
// contract both lanes code against is exactly:
//
//   storage key  localStorage['nds-units'] === 'F' | 'C'
//   change event window 'nds-units-changed' CustomEvent, detail { unit }
//
// Determinism law (R17): no Math.random / Date.now / new Date.

export type Unit = 'F' | 'C'

/** Frozen persistence contract (session 1 decision 2). */
export const UNITS_STORAGE_KEY = 'nds-units'
/** Frozen broadcast contract: every surface re-reads on this event. */
export const UNITS_EVENT = 'nds-units-changed'

/** Honest default: Fahrenheit (owner: "this is America"). Never C. */
export const DEFAULT_UNIT: Unit = 'F'

export function isUnit(v: unknown): v is Unit {
  return v === 'F' || v === 'C'
}

/**
 * True when localStorage actually works in this context. Private mode (and
 * storage-blocked browsers) throw on write — the pill must stay usable and
 * must NOT claim persistence it does not have (R19 honesty law).
 */
export function storageAvailable(): boolean {
  try {
    const probe = '__nds_units_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/**
 * Current unit: stored choice wins; anything missing/corrupt => honest F.
 * Never guesses, never reads a fake.
 */
export function readUnits(): Unit {
  try {
    const v = window.localStorage.getItem(UNITS_STORAGE_KEY)
    return isUnit(v) ? v : DEFAULT_UNIT
  } catch {
    return DEFAULT_UNIT
  }
}

/**
 * Persist a unit. Returns true ONLY when the write actually landed — private
 * mode returns false and the app keeps the in-memory choice for the session
 * without faking a saved preference.
 */
export function writeUnits(unit: Unit): boolean {
  try {
    window.localStorage.setItem(UNITS_STORAGE_KEY, unit)
    return true
  } catch {
    return false
  }
}

/**
 * Apply + broadcast a unit change. The event fires even when persistence is
 * unavailable (private mode) — surfaces must follow the user's choice, only
 * the "saved" claim is withheld. Returns { unit, persisted }.
 */
export function setUnits(unit: Unit): { unit: Unit; persisted: boolean } {
  const persisted = writeUnits(unit)
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(UNITS_EVENT, { detail: { unit } }))
  }
  return { unit, persisted }
}

/** Toggle between F and C, returning the new unit. */
export function toggleUnits(): Unit {
  const next: Unit = readUnits() === 'F' ? 'C' : 'F'
  setUnits(next)
  return next
}

/**
 * Subscribe to unit changes. Returns the unsubscribe fn. Surfaces that cannot
 * use React (plain-DOM chrome) subscribe here; the A1 `useUnits` hook is the
 * React-side twin of this seam.
 */
export function subscribeUnits(onChange: (unit: Unit) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ unit?: Unit }>).detail
    onChange(isUnit(detail?.unit) ? detail.unit : readUnits())
  }
  window.addEventListener(UNITS_EVENT, handler)
  return () => window.removeEventListener(UNITS_EVENT, handler)
}
