/**
 * W3-A3 MAP TINT — unit tests: dominant-condition computation + tint class
 * selection. Pure functions, no DOM, no timers, no RNG (R17).
 */
import { describe, expect, it } from 'vitest'
import {
  CONDITION_ORDER,
  conditionFromTempC,
  dominantCondition,
  TINT_OPACITY,
  TINT_MIN_ZOOM,
  tintClassFor,
  type Condition,
} from './map-tint'

describe('conditionFromTempC (temperature-band fallback)', () => {
  it('maps each documented band', () => {
    expect(conditionFromTempC(35)).toBe('storm')
    expect(conditionFromTempC(30)).toBe('storm')
    expect(conditionFromTempC(29.99)).toBe('clear')
    expect(conditionFromTempC(20)).toBe('clear')
    expect(conditionFromTempC(8)).toBe('clear')
    expect(conditionFromTempC(7.99)).toBe('overcast')
    expect(conditionFromTempC(0)).toBe('overcast')
    expect(conditionFromTempC(-0.01)).toBe('rain')
    expect(conditionFromTempC(-10)).toBe('rain')
    expect(conditionFromTempC(-10.01)).toBe('snow')
    expect(conditionFromTempC(-40)).toBe('snow')
  })
})

describe('dominantCondition', () => {
  it('returns the mode over visible towns', () => {
    const temps = {
      a: 25, // clear
      b: 22, // clear
      c: 25, // clear
      d: 5, // overcast
      e: -20, // snow
    }
    expect(dominantCondition(temps, ['a', 'b', 'c', 'd', 'e'])).toBe('clear')
  })

  it('counts only VISIBLE towns (ids list gates participation)', () => {
    const temps = { a: 25, b: 25, c: 5, d: 5, e: 5 }
    expect(dominantCondition(temps, ['c', 'd', 'e'])).toBe('overcast')
    expect(dominantCondition(temps, ['a', 'b'])).toBe('clear')
  })

  it('ignores towns without finite data (last-data-wins honesty)', () => {
    const temps: Record<string, number> = { a: 25, b: 25, c: NaN, d: Infinity }
    expect(dominantCondition(temps, ['a', 'b', 'c', 'd', 'missing'])).toBe('clear')
  })

  it('returns null when no visible town has data', () => {
    expect(dominantCondition({}, ['a', 'b'])).toBeNull()
    expect(dominantCondition({ a: NaN }, ['a'])).toBeNull()
    expect(dominantCondition({ a: 25 }, [])).toBeNull()
  })

  it('breaks ties deterministically by CONDITION_ORDER', () => {
    const temps = { a: 25, b: 5, c: -20, d: -30 }
    // clear/overcast tie 1-1-...: clear wins (earliest in CONDITION_ORDER).
    expect(dominantCondition(temps, ['a', 'b'])).toBe('clear')
    // rain vs snow tie -> rain (earlier in order).
    expect(dominantCondition({ a: -2, b: -20 }, ['a', 'b'])).toBe('rain')
    // storm beats a lower-count clear (2 storm vs 1 clear).
    expect(dominantCondition({ a: 25, b: 31, c: 33 }, ['a', 'b', 'c'])).toBe('storm')
  })

  it('is order-independent over the town list', () => {
    const temps = { a: 25, b: 5, c: 5, d: -20 }
    expect(dominantCondition(temps, ['a', 'b', 'c', 'd'])).toBe('overcast')
    expect(dominantCondition(temps, ['d', 'c', 'b', 'a'])).toBe('overcast')
  })
})

describe('tintClassFor', () => {
  it('maps every condition to a stable class', () => {
    const expected: Record<Condition, string> = {
      clear: 'map-tint map-tint--clear',
      overcast: 'map-tint map-tint--overcast',
      rain: 'map-tint map-tint--rain',
      snow: 'map-tint map-tint--snow',
      storm: 'map-tint map-tint--storm',
    }
    for (const c of CONDITION_ORDER) {
      expect(tintClassFor(c)).toBe(expected[c])
    }
  })

  it('returns empty string for null (no overlay renders)', () => {
    expect(tintClassFor(null)).toBe('')
  })
})

describe('constants (brief laws)', () => {
  it('opacity never exceeds 0.12', () => {
    expect(TINT_OPACITY).toBeLessThanOrEqual(0.12)
    expect(TINT_OPACITY).toBeGreaterThan(0)
  })

  it('tint gate sits at zoom 9 (nothing to summarize below)', () => {
    expect(TINT_MIN_ZOOM).toBe(9)
  })
})
