import { useEffect, useState } from 'react'
import {
  readUnits,
  setUnits,
  subscribeUnits,
  UNITS_EVENT,
  UNITS_STORAGE_KEY,
  type Unit,
} from '../lib/units-toggle'

/**
 * W4-A2 UNIT-TOGGLE — header °F/°C pill (wave-4 session 1, decision 2).
 *
 * Two-segment control (F | C) sitting next to the ThemeToggle in the header
 * actions row:
 * - >=44px per segment (R13 touch-target law) — the whole pill is a 44px-tall
 *   control, each segment >=44px wide.
 * - Active segment painted neon-green via var(--current-accent) (C-01
 *   terminal-theme law); inactive segment stays surface/border neutral.
 * - Square geometry (R20/C-02): border-radius ONLY var(--radius).
 * - ~200ms color/background transition (CSS; animation law — nothing snaps).
 * - Keyboard: Tab reaches the pill (two real buttons, natural tab order),
 *   Enter/Space activates a segment. aria-pressed reflects the active state
 *   on each segment so AT announces "pressed" on the current unit.
 * - Persistence: localStorage 'nds-units' + window 'nds-units-changed' event
 *   (the frozen A1 seam — this component does NOT own conversion math, that
 *   lib lands in parallel in src/lib/weather/units.ts).
 * - Private mode: reads default F, switching still works for the session,
 *   and we never claim persistence (no fake "saved" state, R19).
 * - Cross-tab / cross-surface sync: subscribes to 'nds-units-changed' (and
 *   the storage event as the cross-tab backstop) so the pill follows the
 *   single source of truth.
 */
export function UnitToggle() {
  const [unit, setUnitState] = useState<Unit>(() => readUnits())

  useEffect(() => {
    setUnitState(readUnits())
    const off = subscribeUnits(setUnitState)
    // Cross-tab backstop: storage fires only in OTHER tabs (the CustomEvent
    // covers same-document dispatchers). No polling, no timers (R17).
    const onStorage = (e: StorageEvent) => {
      if (e.key === UNITS_STORAGE_KEY) setUnitState(readUnits())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      off()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const pick = (next: Unit) => {
    setUnitState(next)
    setUnits(next)
  }

  return (
    <div className="unit-toggle" role="group" aria-label="Temperature units" data-testid="unit-toggle">
      {(['F', 'C'] as const).map((u) => (
        <button
          key={u}
          type="button"
          className={`unit-segment${unit === u ? ' is-active' : ''}`}
          data-testid={`unit-${u}`}
          data-unit={u}
          aria-pressed={unit === u}
          aria-label={`Show temperatures in ${u === 'F' ? 'Fahrenheit' : 'Celsius'}`}
          onClick={() => pick(u)}
        >
          °{u}
        </button>
      ))}
    </div>
  )
}

export { UNITS_EVENT }
