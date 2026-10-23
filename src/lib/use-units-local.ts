import { useEffect, useState } from 'react'
import { UNITS_STORAGE_KEY, readUnits, subscribeUnits, type Unit } from './units-toggle'

/**
 * W4-A2 MINIMAL local units hook — the direct-localStorage stopgap the lane
 * brief authorizes ("wire components minimally to read localStorage directly
 * if needed"). It reads the frozen `nds-units` key + `nds-units-changed`
 * event seam ONLY; the canonical `useUnits` hook lands in lane W4-A1 in
 * `src/lib/weather/units.ts`. When A1 merges, consumers migrate by swapping
 * this import — same contract, no behavioral change.
 *
 * Determinism (R17): subscription-driven, zero timers.
 */
export function useUnitsLocal(): Unit {
  const [unit, setUnit] = useState<Unit>(() => readUnits())
  useEffect(() => {
    setUnit(readUnits())
    const off = subscribeUnits(setUnit)
    const onStorage = (e: StorageEvent) => {
      if (e.key === UNITS_STORAGE_KEY) setUnit(readUnits())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      off()
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return unit
}

/**
 * Format a Celsius reading for the given display unit. Rounding is half-up
 * via Math.round. This is the minimal display glue the badge surface needs
 * before A1's conversion lib (f2c/c2f) lands — A1 owns the canonical pair.
 */
export function formatTempFromCelsius(tempC: number, unit: Unit): string {
  const v = unit === 'F' ? (tempC * 9) / 5 + 32 : tempC
  return `${Math.round(v)}°${unit}`
}
