// W4-B1 BADGE-ABOVE-LABEL — positioning math (wave-4 session 1, decision 3):
// "badge sits ABOVE the town label with gap — offset = label height + 6px."
// Pure geometry: every number derives from zoom + tier rules. R17-clean.
import { describe, expect, it } from 'vitest'
import { TIER_RULES } from '../src/lib/map/tiers'
import {
  badgeOffsetAboveLabelPx,
  labelBoxHeightPx,
  labelFontSize,
  LABEL_GAP_PX,
  LABEL_TEXT_OFFSET_EM,
} from '../src/lib/map/label-math'

describe('label-math (W4-B1 badge-above-label geometry)', () => {
  it('font ladder is monotonically nondecreasing across zoom for every tier', () => {
    for (const rule of TIER_RULES) {
      let prev = -Infinity
      for (let z = rule.minzoom; z <= rule.maxzoom + 4; z += 0.5) {
        const size = labelFontSize(z, rule.tier)
        expect(size).toBeGreaterThanOrEqual(prev)
        expect(size).toBeGreaterThanOrEqual(11)
        expect(size).toBeLessThanOrEqual(18)
        prev = size
      }
    }
  })

  it('label box height = font size * offset em + descender allowance', () => {
    // Spot-check the law at zoom 10 (city tier band top / town tier start).
    const h = labelBoxHeightPx(10, 'town')
    expect(h).toBeCloseTo(labelFontSize(10, 'town') * LABEL_TEXT_OFFSET_EM + 12)
    // Label height is always positive and grows with zoom.
    expect(h).toBeGreaterThan(0)
    expect(labelBoxHeightPx(14, 'town')).toBeGreaterThanOrEqual(h)
  })

  it('badge offset above the point = tallest visible label + the 6px gap law', () => {
    expect(LABEL_GAP_PX).toBe(6)
    // Town tier visible (10..24 band): offset exceeds the town label height.
    const off = badgeOffsetAboveLabelPx(12)
    expect(off).toBeCloseTo(labelBoxHeightPx(12, 'town') + 6)
    // City tier (7..10): offset tracks the city ladder.
    expect(badgeOffsetAboveLabelPx(8)).toBeCloseTo(labelBoxHeightPx(8, 'city') + 6)
    // Gap law holds for every zoom the badge gate can show (>= 9).
    for (let z = 9; z <= 18; z += 1) {
      expect(badgeOffsetAboveLabelPx(z)).toBeGreaterThan(6)
    }
  })

  it('offset is deterministic and never below the gap floor', () => {
    expect(badgeOffsetAboveLabelPx(12)).toBe(badgeOffsetAboveLabelPx(12))
    expect(badgeOffsetAboveLabelPx(1)).toBeGreaterThanOrEqual(6)
  })
})
