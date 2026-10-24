// W4-B3 DE-CLUSTER — same-temp neighboring towns collapse to ONE badge
// (wave-4 brainstorm session 1, decision 5: "show ONE badge for the cluster
// (representative town); tap/zoom-in expands to individuals").
//
// Contract (lane plan): cluster badge = 1 per same-temp group at low zoom,
// labeled like "Moore +2"; expands back to individual badges on zoom-in and
// on tap of the cluster badge.
//
// Composition law: clustering runs AFTER the W4-B2 zoom-match gate
// (badgesForZoom) — only towns whose badge is currently visible join a
// group. It composes with W4-B1 stacking: a cluster renders as ONE stacked
// column [cluster-badge][label][dot], so the overlap law is untouched.
//
// Determinism law (R17): PURE function. No Date.now / Math.random / new
// Date. Grouping is a greedy scan over towns sorted by id (stable order);
// ties break by town id, then name. The same (towns, projected points,
// temps, unit, zoom) inputs always produce byte-identical groups.
//
// Zoom behavior: proximity is measured in SCREEN PIXELS of the current zoom
// (projected points), so zooming in multiplies distances and groups split
// naturally — expansion on zoom-in is a pure function of zoom, no timers,
// no sticky state. Expansion on tap is the fly-to law: clicking the cluster
// badge flies the map to the group centroid and bumps zoom, which splits.

import { cToF } from '../weather/units';
import type { Unit } from '../weather/units';

/**
 * Screen-space radius (px) within which same-temp towns merge into one
 * cluster badge. Chosen against the metro pattern the contract names
 * (Moore / Mustang / Oklahoma City, ~12-25 km apart) so a metro cluster
 * collapses at the zooms where its cards used to stack:
 *   z7: ~364 px/deg lon -> 96px covers ~26 km -> OKC metro collapses
 *   z4-6: ~45-182 px/deg -> state-tier cities within ~213 km collapse
 *   z9+: clustering OFF — every town gets its own badge (expand law)
 * 96px ≈ the width of one stacked badge column, i.e. "cards literally on
 * top of each other". Same-temp is the second, necessary condition: two
 * towns 10 km apart showing DIFFERENT numbers never merge (the badge text
 * is what the user reads — merging them would lie).
 */
export const CLUSTER_RADIUS_PX = 96;

/**
 * Zoom at which clustering STOPS — the expand-on-zoom-in threshold. It
 * EQUALS TOWN_BADGE_MIN_ZOOM (9): at/above it every badge-visible town
 * renders its own badge, byte-identical to the pre-B3 DOM (all z9+ lanes
 * and specs untouched); below it, same-temp neighbors collapse into ONE
 * metro-overlay badge (session-1 decision 5, "Rancho Rio Rancho pattern").
 * Real temps reach the low-zoom badges via last-data-wins (the refresher
 * fills data at zoom >= 9; panning down keeps the last window), and towns
 * with no data render "awaiting feed" solo (NaN temp key never matches,
 * R19 honest). Tap-expand flies to the group centroid and bumps zoom to
 * this level, where grouping returns null.
 */
export const CLUSTER_MAX_ZOOM = 9;

/** A town paired with its CURRENT projected screen point (map.project). */
export interface ProjectedTown {
  id: string;
  name: string;
  lon: number;
  lat: number;
  x: number;
  y: number;
  /** Rounded display temp in the active unit; NaN when no data. */
  tempKey: number;
  /** W4-BF COLLISION LAW: population rides along so cluster badges rank by
   *  rep importance in the collision pass (absent => 0). */
  pop?: number;
}

/** One badge group: 1 town (solo) or >= 2 (cluster). */
export interface BadgeGroup {
  /** Representative town — the badge carrier (smallest id in the group). */
  rep: ProjectedTown;
  /** All member towns, sorted by id. */
  members: ProjectedTown[];
  /** Geographic centroid (mean lat/lon) — the fly-to target on expand. */
  centroid: { lon: number; lat: number };
}

/**
 * Rounded display temperature — the clustering key. Two towns cluster iff
 * their SHOWN numbers match (21°C and 21.4°C are both "70°F" — honest:
 * the badge shows the same value, so collapsing them loses no information
 * the user can see). No data => NaN => never matches (NaN !== NaN), so
 * towns awaiting feed stay solo (honest states law).
 */
export function displayTempKey(celsius: number | undefined, unit: Unit): number {
  if (typeof celsius !== 'number' || !Number.isFinite(celsius)) return Number.NaN;
  const shown = Math.round(unit === 'F' ? cToF(celsius) : celsius);
  return shown === 0 ? 0 : shown; // normalize -0
}

/** Squared pixel distance (pure, no sqrt). */
function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Group badge-visible towns into same-temp spatial clusters.
 *
 * Greedy scan over entries sorted by town id (deterministic tie-break):
 * each town joins the FIRST open group whose (a) display temp equals its
 * own and (b) any member lies within radiusPx of its point; otherwise it
 * opens a new group. Output groups keep first-member order by id, members
 * sorted by id. O(n·g) worst case, g = open groups — fine for gazetteer n.
 */
export function clusterBadgeGroups(
  entries: readonly ProjectedTown[],
  radiusPx: number = CLUSTER_RADIUS_PX,
): BadgeGroup[] {
  const sorted = [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const r2 = radiusPx * radiusPx;
  const groups: { rep: ProjectedTown; members: ProjectedTown[] }[] = [];
  for (const e of sorted) {
    let joined = false;
    for (const g of groups) {
      if (g.rep.tempKey !== e.tempKey) continue; // same shown temp only (NaN stays solo)
      for (const m of g.members) {
        if (dist2(m.x, m.y, e.x, e.y) <= r2) {
          g.members.push(e);
          joined = true;
          break;
        }
      }
      if (joined) break;
    }
    if (!joined) groups.push({ rep: e, members: [e] });
  }
  return groups.map((g) => {
    const members = [...g.members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const rep = members[0]; // smallest id = stable representative
    const n = members.length;
    return {
      rep,
      members,
      centroid: {
        lon: members.reduce((s, m) => s + m.lon, 0) / n,
        lat: members.reduce((s, m) => s + m.lat, 0) / n,
      },
    };
  });
}

/**
 * Badge label for a cluster: representative name + "+N" hidden members,
 * e.g. "Moore +2". Solo groups render the plain name (no suffix).
 */
export function clusterLabel(group: BadgeGroup): string {
  const extra = group.members.length - 1;
  return extra > 0 ? `${group.rep.name} +${extra}` : group.rep.name;
}

/**
 * Compose point: cluster badge-visible towns at this zoom. Returns null
 * when clustering is OFF (zoom >= CLUSTER_MAX_ZOOM) — callers then render
 * every town solo, exactly the pre-B3 path. Pure: same (towns, zoom,
 * temps, unit, radius) => same groups; projection is supplied by the
 * caller so groups depend only on RELATIVE screen geometry (panning shifts
 * every point rigidly and cannot change grouping — zoom can).
 */
export function badgeGroups(
  towns: readonly ProjectedTown[],
  zoom: number,
  radiusPx: number = CLUSTER_RADIUS_PX,
): BadgeGroup[] | null {
  if (zoom >= CLUSTER_MAX_ZOOM) return null;
  return clusterBadgeGroups(towns, radiusPx);
}
