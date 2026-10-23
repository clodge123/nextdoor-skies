// W4-A1 UNITS-CORE — vitest matrix (wave-4 brainstorm session 1 + session 6
// QA law: units.spec covers F default everywhere, toggle persists, private-
// mode honest F default, event propagation).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_UNIT,
  UNITS_CHANGED_EVENT,
  UNITS_STORAGE_KEY,
  cToF,
  fToC,
  formatTemp,
  getUnit,
  setUnit,
  toggleUnit,
  unitFromStorage,
} from './units'

describe('units conversion math', () => {
  it('C -> F exact matrix', () => {
    expect(cToF(21)).toBeCloseTo(69.8, 10)
    expect(cToF(-10)).toBeCloseTo(14, 10)
    expect(cToF(0)).toBe(32)
    expect(cToF(100)).toBe(212)
    expect(cToF(-40)).toBe(-40)
    expect(cToF(37)).toBeCloseTo(98.6, 10)
  })

  it('F -> C is the exact inverse of C -> F', () => {
    for (const c of [-40, -10, 0, 5.5, 21, 37, 100]) {
      expect(fToC(cToF(c))).toBeCloseTo(c, 10)
    }
  })
})

describe('formatTemp', () => {
  it('formats F with the whole-degree matrix (21°C→70°F, -10°C→14°F, 0→32°F)', () => {
    expect(formatTemp(21, 'F')).toBe('70°F')
    expect(formatTemp(-10, 'F')).toBe('14°F')
    expect(formatTemp(0, 'F')).toBe('32°F')
    expect(formatTemp(100, 'F')).toBe('212°F')
    expect(formatTemp(-40, 'F')).toBe('-40°F')
  })

  it('formats C with the whole-degree matrix', () => {
    expect(formatTemp(24, 'C')).toBe('24°C')
    expect(formatTemp(0, 'C')).toBe('0°C')
    expect(formatTemp(-10.4, 'C')).toBe('-10°C')
    expect(formatTemp(-10.6, 'C')).toBe('-11°C')
  })

  it('rounds half-up to whole degrees, never renders trailing .0', () => {
    expect(formatTemp(21.4, 'F')).toBe('71°F') // 21.4C = 70.52F -> 71
    expect(formatTemp(21.5, 'F')).toBe('71°F') // 70.75 -> 71
    expect(formatTemp(21.6, 'F')).toBe('71°F')
    expect(formatTemp(4, 'F')).toBe('39°F')
    expect(formatTemp(21.0, 'C')).toBe('21°C')
    expect(formatTemp(21.5, 'C')).toBe('22°C')
    // No output ever carries a decimal point.
    for (const c of [-40, -10, -0.4, 0, 0.2, 21, 37, 100]) {
      for (const u of ['F', 'C'] as const) {
        expect(formatTemp(c, u)).not.toContain('.')
      }
    }
  })

  it('never renders "-0" (JS Math.round(-0.2) === -0 trap)', () => {
    expect(formatTemp(-0.2, 'C')).toBe('0°C')
    expect(formatTemp(-0.2, 'F')).toBe('32°F') // 31.64 -> 32
    expect(formatTemp(-0.01, 'F')).toBe('32°F')
  })

  it('defaults to the stored unit when omitted', () => {
    localStorage.setItem(UNITS_STORAGE_KEY, 'C')
    expect(formatTemp(24)).toBe('24°C')
    localStorage.setItem(UNITS_STORAGE_KEY, 'F')
    expect(formatTemp(24)).toBe('75°F')
  })
})

describe('unitFromStorage / setUnit persistence', () => {
  beforeEach(() => localStorage.clear())

  it('default is F when storage is empty (US default law)', () => {
    expect(unitFromStorage()).toBe('F')
    expect(getUnit()).toBe('F')
    expect(DEFAULT_UNIT).toBe('F')
  })

  it('reads a stored unit; corrupt/unknown values fall back to F (honest)', () => {
    localStorage.setItem(UNITS_STORAGE_KEY, 'C')
    expect(unitFromStorage()).toBe('C')
    localStorage.setItem(UNITS_STORAGE_KEY, 'kelvin')
    expect(unitFromStorage()).toBe('F')
    localStorage.setItem(UNITS_STORAGE_KEY, '')
    expect(unitFromStorage()).toBe('F')
  })

  it('private mode (localStorage throws on read AND write): honest F, setUnit never throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: private mode')
    })
    const readSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: private mode')
    })
    expect(unitFromStorage()).toBe('F')
    expect(() => setUnit('C')).not.toThrow()
    // Nothing persisted (honest) — the in-tab broadcast still happened.
    spy.mockRestore()
    readSpy.mockRestore()
  })

  it('setUnit persists the choice and getUnit reflects it', () => {
    setUnit('C')
    expect(localStorage.getItem(UNITS_STORAGE_KEY)).toBe('C')
    expect(getUnit()).toBe('C')
    setUnit('F')
    expect(getUnit()).toBe('F')
  })

  it('toggleUnit flips F<->C and persists', () => {
    expect(toggleUnit()).toBe('C')
    expect(getUnit()).toBe('C')
    expect(toggleUnit()).toBe('F')
    expect(getUnit()).toBe('F')
  })
})

describe('change-event propagation (useUnits seam for lane W4-A2)', () => {
  beforeEach(() => localStorage.clear())

  it('setUnit dispatches nds-units-changed on window with the new unit', () => {
    const seen: string[] = []
    const listener = (e: Event) => seen.push((e as CustomEvent<string>).detail)
    window.addEventListener(UNITS_CHANGED_EVENT, listener)
    setUnit('C')
    setUnit('F')
    window.removeEventListener(UNITS_CHANGED_EVENT, listener)
    expect(seen).toEqual(['C', 'F'])
  })

  it('toggleUnit also broadcasts', () => {
    const events: string[] = []
    const listener = (e: Event) => events.push((e as CustomEvent<string>).detail)
    window.addEventListener(UNITS_CHANGED_EVENT, listener)
    toggleUnit()
    window.removeEventListener(UNITS_CHANGED_EVENT, listener)
    expect(events).toEqual(['C'])
  })

  it('storage key + event name match the contract', () => {
    expect(UNITS_STORAGE_KEY).toBe('nds-units')
    expect(UNITS_CHANGED_EVENT).toBe('nds-units-changed')
  })
})

describe('useUnits hook (subscription surface)', () => {
  it('reflects setUnit in the same tab (custom event) and storage events', async () => {
    const { renderHook, act } = await import('@testing-library/react')
    const { useUnits } = await import('./useUnits')
    localStorage.clear()
    const { result } = renderHook(() => useUnits())
    expect(result.current).toBe('F')

    act(() => setUnit('C'))
    expect(result.current).toBe('C')

    // Cross-tab simulation: native storage event with the nds-units key.
    act(() => {
      localStorage.setItem(UNITS_STORAGE_KEY, 'F')
      window.dispatchEvent(new StorageEvent('storage', { key: UNITS_STORAGE_KEY, newValue: 'F' }))
    })
    expect(result.current).toBe('F')

    // A storage event for an UNRELATED key must not force a re-read churn.
    let renders = 0
    const { result: r2 } = renderHook(() => {
      renders += 1
      return useUnits()
    })
    const before = renders
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'nds-theme', newValue: 'light' }))
    })
    expect(r2.current).toBe('F')
    expect(renders).toBe(before) // no re-render for unrelated keys
  })
})
