// @vitest-environment jsdom
/**
 * W3-A2 weathercode -> lucide icon MAPPING TABLE tests.
 * The table is the contract between Open-Meteo's WMO "wmo code" values and
 * the lucide glyphs rendered inside town badges. Every entry must resolve to
 * a real component + label + bucket; every code outside the table degrades
 * to the honest unknown entry (R19 — never a guessed condition).
 */
import { describe, expect, it } from 'vitest'
import {
  UNKNOWN_WEATHERCODE_ICON,
  WEATHERCODE_ICONS,
  weathercodeToIcon,
} from './weathercode'

describe('WEATHERCODE_ICONS mapping table', () => {
  it('covers the full WMO code set Open-Meteo emits', () => {
    const expected = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]
    expect(Object.keys(WEATHERCODE_ICONS).map(Number).sort((a, b) => a - b)).toEqual(expected)
  })

  // lucide icons are forwardRef objects ({ $$typeof, render }) in this
  // build — assert "renderable React component", not typeof === 'function'.
  const isRenderableComponent = (icon: unknown): boolean =>
    typeof icon === 'function' ||
    (typeof icon === 'object' &&
      icon !== null &&
      '$$typeof' in icon &&
      typeof (icon as { render?: unknown }).render === 'function')

  it('every entry maps to a real lucide component + label + bucket', () => {
    for (const [code, entry] of Object.entries(WEATHERCODE_ICONS)) {
      expect(typeof code).toBe('string')
      expect(isRenderableComponent(entry.icon)).toBe(true)
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.bucket.length).toBeGreaterThan(0)
    }
  })

  it('thunderstorm codes (95/96/99) map to the lightning glyph', () => {
    expect(weathercodeToIcon(95).icon).toBe(weathercodeToIcon(99).icon)
    expect(weathercodeToIcon(95).bucket).toBe('thunder')
  })

  it('snow codes map to snow glyphs, rain codes to rain glyphs', () => {
    expect(weathercodeToIcon(71).bucket).toBe('snow')
    expect(weathercodeToIcon(77).bucket).toBe('snow')
    expect(weathercodeToIcon(61).bucket).toBe('rain')
    expect(weathercodeToIcon(82).bucket).toBe('rain')
    expect(weathercodeToIcon(71).icon).not.toBe(weathercodeToIcon(61).icon)
  })

  it('clear sky (0) and overcast (3) render distinct glyphs', () => {
    expect(weathercodeToIcon(0).icon).not.toBe(weathercodeToIcon(3).icon)
    expect(weathercodeToIcon(0).label).toBe('Clear sky')
    expect(weathercodeToIcon(3).label).toBe('Overcast')
  })
})

describe('weathercodeToIcon parsing (unit-level)', () => {
  it('accepts numeric codes as-is', () => {
    expect(weathercodeToIcon(0).bucket).toBe('clear')
    expect(weathercodeToIcon(3).bucket).toBe('cloudy')
  })

  it('accepts numeric strings (JSON round-trip safety)', () => {
    expect(weathercodeToIcon('61').bucket).toBe('rain')
    expect(weathercodeToIcon(' 61 ').bucket).toBe('rain')
  })

  it('degrades honestly on garbage — never a fake condition', () => {
    expect(weathercodeToIcon(undefined)).toBe(UNKNOWN_WEATHERCODE_ICON)
    expect(weathercodeToIcon(null)).toBe(UNKNOWN_WEATHERCODE_ICON)
    expect(weathercodeToIcon('')).toBe(UNKNOWN_WEATHERCODE_ICON)
    expect(weathercodeToIcon('abc')).toBe(UNKNOWN_WEATHERCODE_ICON)
    expect(weathercodeToIcon(NaN)).toBe(UNKNOWN_WEATHERCODE_ICON)
    expect(weathercodeToIcon(Infinity)).toBe(UNKNOWN_WEATHERCODE_ICON)
    expect(weathercodeToIcon({})).toBe(UNKNOWN_WEATHERCODE_ICON)
  })

  it('unknown-but-finite codes fall back to the neutral help glyph', () => {
    const e = weathercodeToIcon(42)
    expect(e).toBe(UNKNOWN_WEATHERCODE_ICON)
    expect(e.bucket).toBe('unknown')
    expect(typeof e.icon === 'function' || (typeof e.icon === 'object' && e.icon !== null && '$$typeof' in e.icon)).toBe(true)
  })
})
