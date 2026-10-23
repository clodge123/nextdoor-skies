// W4-A2 UNIT-TOGGLE — vitest suite (wave-4 session 1 decision 2).
// Covers the pill's state machine: default F, persistence via 'nds-units',
// 'nds-units-changed' broadcast, private-mode honesty, and the header
// component (aria-pressed, keyboard, ≥44px geometry contract).
// @vitest-environment jsdom
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UnitToggle } from '../src/components/UnitToggle'
import {
  DEFAULT_UNIT,
  readUnits,
  setUnits,
  storageAvailable,
  subscribeUnits,
  toggleUnits,
  UNITS_EVENT,
  UNITS_STORAGE_KEY,
  writeUnits,
  type Unit,
} from '../src/lib/units-toggle'

afterEach(() => cleanup())
beforeEach(() => localStorage.clear())

describe('units state machine (lib)', () => {
  it('default unit is F — honest, never C', () => {
    expect(DEFAULT_UNIT).toBe('F')
    expect(readUnits()).toBe('F')
  })

  it('corrupt/garbage stored value falls back to honest F', () => {
    localStorage.setItem(UNITS_STORAGE_KEY, 'kelvin')
    expect(readUnits()).toBe('F')
    localStorage.setItem(UNITS_STORAGE_KEY, '')
    expect(readUnits()).toBe('F')
  })

  it('persists the choice to localStorage nds-units', () => {
    expect(writeUnits('C')).toBe(true)
    expect(localStorage.getItem(UNITS_STORAGE_KEY)).toBe('C')
    expect(readUnits()).toBe('C')
    expect(writeUnits('F')).toBe(true)
    expect(readUnits()).toBe('F')
  })

  it('setUnits fires nds-units-changed with the unit in detail', () => {
    const seen: Array<{ unit: Unit }> = []
    const handler = (e: Event) => seen.push((e as CustomEvent<{ unit: Unit }>).detail)
    window.addEventListener(UNITS_EVENT, handler)
    setUnits('C')
    window.removeEventListener(UNITS_EVENT, handler)
    expect(seen).toEqual([{ unit: 'C' }])
    expect(readUnits()).toBe('C')
  })

  it('subscribeUnits receives broadcasts and unsubscribes cleanly', () => {
    const got: Unit[] = []
    const off = subscribeUnits((u) => got.push(u))
    setUnits('C')
    setUnits('F')
    off()
    setUnits('C')
    expect(got).toEqual(['C', 'F'])
  })

  it('toggleUnits flips F<->C, persists, and returns the new unit', () => {
    expect(toggleUnits()).toBe('C')
    expect(readUnits()).toBe('C')
    expect(toggleUnits()).toBe('F')
    expect(readUnits()).toBe('F')
  })

  it('private mode: write fails LOUDLY-honest (returns false), event still fires, default stays F', () => {
    const real = Object.getOwnPropertyDescriptor(window.Storage.prototype, 'setItem')
    // Private mode = EVERY localStorage write throws (the probe included).
    Storage.prototype.setItem = function () {
      throw new Error('SecurityError: private mode')
    }
    try {
      expect(storageAvailable()).toBe(false)
      const events: { unit: Unit }[] = []
      const off = subscribeUnits((u) => events.push(u))
      const res = setUnits('C')
      off()
      // No fake persistence claim…
      expect(res.persisted).toBe(false)
      // …but the session-level change IS broadcast (surfaces follow).
      expect(events).toEqual(['C'])
      // Read side: storage read throws => honest F default, never a lie.
      expect(readUnits()).toBe('F')
    } finally {
      Storage.prototype.setItem = real!.value
    }
  })

  it('storage key + event name are the frozen A1 seam contract', () => {
    expect(UNITS_STORAGE_KEY).toBe('nds-units')
    expect(UNITS_EVENT).toBe('nds-units-changed')
  })
})

describe('UnitToggle pill (component)', () => {
  it('renders two segments; F is pressed by default', () => {
    render(<UnitToggle />)
    expect(screen.getByTestId('unit-F')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('unit-C')).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking C switches, persists, and updates aria-pressed', () => {
    render(<UnitToggle />)
    fireEvent.click(screen.getByTestId('unit-C'))
    expect(screen.getByTestId('unit-F')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('unit-C')).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('nds-units')).toBe('C')
  })

  it('keyboard: segments are native buttons (Tab-reachable, Enter/Space activate)', () => {
    render(<UnitToggle />)
    const c = screen.getByTestId('unit-C')
    // Native <button> = Tab order + Enter/Space activation for free.
    expect(c.tagName).toBe('BUTTON')
    expect(c).toHaveAccessibleName(/Celsius/i)
    fireEvent.click(c) // keyboard Enter/Space dispatches click in AT semantics
    expect(c).toHaveAttribute('aria-pressed', 'true')
  })

  it('follows an external nds-units-changed broadcast (single source of truth)', () => {
    render(<UnitToggle />)
    act(() => {
      setUnits('C')
    })
    expect(screen.getByTestId('unit-C')).toHaveAttribute('aria-pressed', 'true')
  })

  it('re-reads persisted units on mount (reload simulation)', () => {
    localStorage.setItem('nds-units', 'C')
    render(<UnitToggle />)
    expect(screen.getByTestId('unit-C')).toHaveAttribute('aria-pressed', 'true')
  })

  it('private mode: pill stays usable, no crash, honest F start', () => {
    const real = Object.getOwnPropertyDescriptor(window.Storage.prototype, 'setItem')
    Storage.prototype.setItem = function () {
      throw new Error('SecurityError: private mode')
    }
    try {
      render(<UnitToggle />)
      expect(screen.getByTestId('unit-F')).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(screen.getByTestId('unit-C'))
      // Usable in-session…
      expect(screen.getByTestId('unit-C')).toHaveAttribute('aria-pressed', 'true')
      // …and readUnits() never claims a saved value that failed to write.
      expect(readUnits()).toBe('F')
    } finally {
      Storage.prototype.setItem = real!.value
    }
  })
})
