/**
 * W3-A3 MAP TINT — weather-driven sky-tone wash over the map (wave-3
 * brainstorm session 1, decision 6: "subtle sky-tone wash by dominant
 * condition in view").
 *
 * Design:
 * - The tint is computed ONLY from towns currently visible in the viewport
 *   (same viewport-filtered town list the badges use). Below TINT_MIN_ZOOM
 *   there is nothing to summarize, so no tint renders.
 * - Dominant condition = statistical mode over the visible towns'
 *   conditions; ties resolve by CONDITION_ORDER (deterministic, R17: no
 *   Math.random / Date.now / new Date anywhere in this module).
 *
 * SEAM (A2 condition codes): the weather refresher stream currently carries
 * temperatures only (proxy contract §S5: `{temps: {slug: tempF}}`). When
 * lane W3-A2 lands per-town condition codes, replace the band lookup in
 * conditionFromTempC() with the real code at the marked seam below; the
 * dominantCondition()/tintClassFor() surface stays unchanged.
 *
 * Fallback (documented, used until A2 lands): condition derived from
 * temperature bands (Celsius, the units the refresher client emits):
 *   tempC >= 30   -> 'storm'     (extreme heat band stands in for convective/storm weather)
 *   8  <= t < 30  -> 'clear'     (warm, settled)
 *   0  <= t < 8   -> 'overcast'  (cool, grey-sky band)
 *  -10 <= t < 0   -> 'rain'      (near/below freezing, precipitation band)
 *   t < -10       -> 'snow'      (deep freeze)
 */

export type Condition = 'clear' | 'overcast' | 'rain' | 'snow' | 'storm'

/** Canonical order: mode tie-break + stable iteration. Never re-sort. */
export const CONDITION_ORDER: readonly Condition[] = [
  'clear',
  'overcast',
  'rain',
  'snow',
  'storm',
]

/** Mirrors TOWN_BADGE_MIN_ZOOM (9): below it, no tint (nothing to summarize). */
export const TINT_MIN_ZOOM = 9

/** Brief law: opacity <= 0.12. Kept <= 0.12 by tests. */
export const TINT_OPACITY = 0.12

/**
 * Temperature-band fallback. Finite input assumed (callers filter).
 * A2 SEAM: swap the band lookup for the town's real condition code once the
 * A2 stream exposes one; keep this signature for the fallback path.
 */
export function conditionFromTempC(tempC: number): Condition {
  if (tempC >= 30) return 'storm'
  if (tempC >= 8) return 'clear'
  if (tempC >= 0) return 'overcast'
  if (tempC >= -10) return 'rain'
  return 'snow'
}

/**
 * Dominant condition across the given towns. Towns without a finite temp
 * contribute nothing (last-data-wins honesty: never invent a condition).
 * Returns null when NO visible town has data — the surface shows no tint.
 * Mode wins; ties break by CONDITION_ORDER (deterministic).
 */
export function dominantCondition(
  tempsByTown: Readonly<Record<string, number>>,
  townIds: readonly string[],
): Condition | null {
  const counts = new Map<Condition, number>()
  for (const id of townIds) {
    const t = tempsByTown[id]
    if (typeof t !== 'number' || !Number.isFinite(t)) continue
    const c = conditionFromTempC(t)
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  let best: Condition | null = null
  let bestCount = -1
  for (const c of CONDITION_ORDER) {
    const n = counts.get(c) ?? 0
    if (n > bestCount) {
      best = c
      bestCount = n
    }
  }
  return best
}

/**
 * CSS class list for the overlay. Null condition -> empty string (the
 * overlay must not render at all; callers gate on null).
 */
export function tintClassFor(condition: Condition | null): string {
  if (condition === null) return ''
  return `map-tint map-tint--${condition}`
}
