// W4-B1 BADGE-ABOVE-LABEL — the geometry law (wave-4 session 1, decision 3):
// "A badge sits ABOVE the town label, never over it. Offset = label height +
// gap; the label text always stays readable."
//
// The map's town labels render BELOW the town point (maplibre `text-offset`
// [0, 1.1em] on every `nds-labels-*` layer, plus a white halo layer so the
// text stays legible on any basemap). The badge therefore anchors ABOVE the
// point by exactly the label's screen box height + the gap, so at ANY zoom
// badge.bottom <= label.top — the badge can never cover a town name.
//
// Pure + deterministic (R17): every number derives from the zoom and the
// tier rules, no clocks, no RNG. The SAME size ladder feeds MapView's
// symbol layers (single source of truth) and the badge offset.
import { TIER_RULES, tierForPopulation, type Tier } from './tiers'

/** Screen font-size ladder per tier: [size at minzoom, size at minzoom + 4]. */
export const LABEL_SIZE_BY_TIER: Readonly<Record<Tier, readonly [number, number]>> = {
  country: [11, 13],
  state: [12, 15],
  city: [13, 17],
  town: [12, 16],
}

/** Labels render 1.1em below the town point (maplibre text-offset law). */
export const LABEL_TEXT_OFFSET_EM = 1.1

/** Descender/line-box allowance (px) below the label baseline. */
export const LABEL_DESCENDER_PX = 12

/** The gap law (W4-B1): badge.bottom sits this far above label.top. */
export const LABEL_GAP_PX = 6

/** Linear font size for a tier at a zoom (mirrors the symbol-layer ladder). */
export function labelFontSize(zoom: number, tier: Tier): number {
  const rule = TIER_RULES.find((r) => r.tier === tier)
  if (!rule) return 12
  const [a, b] = LABEL_SIZE_BY_TIER[tier]
  const t = Math.min(1, Math.max(0, (zoom - rule.minzoom) / 4))
  return a + (b - a) * t
}

/** Full screen height of a tier's label box: offset + text line + descender. */
export function labelBoxHeightPx(zoom: number, tier: Tier): number {
  return labelFontSize(zoom, tier) * LABEL_TEXT_OFFSET_EM + LABEL_DESCENDER_PX
}

/**
 * Badge anchor offset ABOVE the town point = tallest label visible at this
 * zoom + the 6px gap. Tiers visible at a zoom follow the same minzoom/
 * maxzoom bands that gate the symbol layers (and the badge zoom gate is
 * lane B2's business — this function is purely geometric).
 */
export function badgeOffsetAboveLabelPx(zoom: number): number {
  let max = 0
  for (const rule of TIER_RULES) {
    if (zoom >= rule.minzoom && zoom < rule.maxzoom) {
      max = Math.max(max, labelBoxHeightPx(zoom, rule.tier))
    }
  }
  return max + LABEL_GAP_PX
}

/** Convenience: label height for a town's population tier (used in specs). */
export function labelHeightForPop(zoom: number, pop: number): number {
  const tier = tierForPopulation(pop) ?? 'town'
  return labelBoxHeightPx(zoom, tier)
}
