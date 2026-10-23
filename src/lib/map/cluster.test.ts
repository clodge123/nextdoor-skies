// W4-B3 DE-CLUSTER unit tests — table-driven, pure function (R17 law).
import { describe, expect, it } from 'vitest';
import {
  badgeGroups,
  clusterBadgeGroups,
  clusterLabel,
  displayTempKey,
  CLUSTER_MAX_ZOOM,
  CLUSTER_RADIUS_PX,
  type ProjectedTown,
} from './cluster';
import { groupsForVisible, type TownBadgeCoord } from '../../components/TownBadges';

/** Build a projected town; x/y default to 0 (callers override). */
function pt(id: string, x: number, y: number, tempKey: number, name = id): ProjectedTown {
  return { id, name, lon: x / 10, lat: y / 10, x, y, tempKey };
}

describe('displayTempKey', () => {
  it('rounds Celsius to the SHOWN Fahrenheit number (the badge value)', () => {
    // 21C -> 69.8F -> shown "70°F" -> key 70. 21.4C -> 70.52F -> 71.
    expect(displayTempKey(21, 'F')).toBe(70);
    expect(displayTempKey(21.4, 'F')).toBe(71);
    expect(displayTempKey(-10, 'F')).toBe(14);
  });
  it('rounds Celsius to the SHOWN Celsius number in C mode', () => {
    expect(displayTempKey(21, 'C')).toBe(21);
    expect(displayTempKey(21.4, 'C')).toBe(21);
  });
  it('normalizes -0 to 0 (never renders "-0")', () => {
    expect(Object.is(displayTempKey(0, 'C'), -0)).toBe(false);
    expect(displayTempKey(0, 'C')).toBe(0);
  });
  it('no data => NaN => never matches anything (honest, R19)', () => {
    expect(Number.isNaN(displayTempKey(undefined, 'F'))).toBe(true);
    expect(Number.isNaN(displayTempKey(Number.NaN, 'F'))).toBe(true);
    expect(Number.isNaN(displayTempKey(Number.POSITIVE_INFINITY, 'F'))).toBe(true);
    expect(displayTempKey(21, 'F') === displayTempKey(21, 'F')).toBe(true);
    expect(displayTempKey(21, 'F') === displayTempKey(undefined, 'F')).toBe(false);
  });
});

describe('clusterBadgeGroups', () => {
  it('same-temp neighbors within radius collapse to ONE group (1 badge)', () => {
    // Oklahoma City metro pattern (session-1 decision 5): Moore + 2 neighbors,
    // all showing the same rounded temp, all within 64px.
    const g = clusterBadgeGroups([
      pt('moore', 100, 100, 70, 'Moore'),
      pt('mustang', 120, 110, 70, 'Mustang'),
      pt('okc', 110, 90, 70, 'Oklahoma City'),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].members.map((m) => m.id)).toEqual(['moore', 'mustang', 'okc']);
    expect(clusterLabel(g[0])).toBe('Moore +2');
  });

  it('different temps never merge, even when colocated', () => {
    const g = clusterBadgeGroups([
      pt('a', 0, 0, 70),
      pt('b', 1, 0, 66),
      pt('c', 2, 0, 71),
    ]);
    expect(g).toHaveLength(3);
    expect(g.every((x) => x.members.length === 1)).toBe(true);
  });

  it('same temp BEYOND radius stays solo (zoom-in expansion is distance)', () => {
    const near = pt('a', 0, 0, 70);
    const far = pt('b', CLUSTER_RADIUS_PX + 1, 0, 70);
    expect(clusterBadgeGroups([near, far])).toHaveLength(2);
    const touching = pt('b2', CLUSTER_RADIUS_PX, 0, 70);
    expect(clusterBadgeGroups([near, touching])).toHaveLength(1);
  });

  it('transitive chains do NOT merge distant ends (single-linkage, bounded)', () => {
    // a-b within radius, b-c within radius, a-c beyond: c joins the group
    // only via b. Verify a and c end in the SAME group (chain) — documented
    // behavior: a group is a connected component, radius bounds its span.
    const g = clusterBadgeGroups([
      pt('a', 0, 0, 70),
      pt('b', 60, 0, 70),
      pt('c', 120, 0, 70),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].members.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('towns awaiting feed (NaN temp) never cluster (R19 honest)', () => {
    const g = clusterBadgeGroups([
      pt('a', 0, 0, Number.NaN),
      pt('b', 1, 0, Number.NaN),
      pt('c', 1, 0, Number.NaN),
    ]);
    expect(g).toHaveLength(3);
  });

  it('representative = smallest town id; members sorted by id (R17 tie-break)', () => {
    const g = clusterBadgeGroups([
      pt('zeta', 10, 0, 70, 'Zeta'),
      pt('alpha', 11, 0, 70, 'Alpha'),
      pt('mid', 12, 0, 70, 'Mid'),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].rep.id).toBe('alpha');
    expect(g[0].members.map((m) => m.id)).toEqual(['alpha', 'mid', 'zeta']);
    expect(clusterLabel(g[0])).toBe('Alpha +2');
  });

  it('input order cannot change the output (determinism, R17)', () => {
    const towns = [
      pt('b', 10, 5, 70, 'B'),
      pt('a', 0, 0, 70, 'A'),
      pt('d', 12, 6, 66, 'D'),
      pt('c', 11, 1, 70, 'C'),
    ];
    const fwd = clusterBadgeGroups(towns);
    const rev = clusterBadgeGroups([...towns].reverse());
    expect(rev).toEqual(fwd);
    const shuffled = [towns[2], towns[0], towns[3], towns[1]];
    expect(clusterBadgeGroups(shuffled)).toEqual(fwd);
  });

  it('centroid = mean lat/lon of members (fly-to target)', () => {
    const g = clusterBadgeGroups([
      pt('a', 0, 0, 70),
      pt('b', 10, 10, 70),
    ]);
    expect(g[0].centroid).toEqual({ lon: 0.5, lat: 0.5 });
  });

  it('solo groups keep the plain name (no "+0" suffix)', () => {
    const g = clusterBadgeGroups([pt('solo', 0, 0, 70, 'Solo')]);
    expect(clusterLabel(g[0])).toBe('Solo');
    expect(g[0].rep.id).toBe('solo');
  });

  it('mixed metro: temps partition groups, ids order them', () => {
    // Moore/Mustang/OKC share 70; Norman/Tulsa share 66; Enid solo 71.
    const g = clusterBadgeGroups([
      pt('moore', 100, 100, 70, 'Moore'),
      pt('mustang', 110, 105, 70, 'Mustang'),
      pt('okc', 105, 95, 70, 'Oklahoma City'),
      pt('norman', 0, 0, 66, 'Norman'),
      pt('tulsa', 5, 5, 66, 'Tulsa'),
      pt('enid', 500, 500, 71, 'Enid'),
    ]);
    expect(g).toHaveLength(3);
    // Group order = first-member order by town id (enid < moore < norman).
    expect(g.map((x) => clusterLabel(x).replace(/ \+\d$/, ''))).toEqual(
      ['Enid', 'Moore', 'Norman'],
    );
    expect(g.map((x) => x.members.length)).toEqual([1, 3, 2]);
  });
});

describe('badgeGroups zoom thresholds', () => {
  const towns = [pt('a', 0, 0, 70), pt('b', 10, 0, 70)];
  it('returns groups BELOW CLUSTER_MAX_ZOOM (clustering ON)', () => {
    for (const z of [1, 4, 7, 8, CLUSTER_MAX_ZOOM - 0.5]) {
      expect(badgeGroups(towns, z)).toHaveLength(1);
    }
  });
  it('returns null AT/ABOVE CLUSTER_MAX_ZOOM (expand on zoom-in)', () => {
    expect(badgeGroups(towns, CLUSTER_MAX_ZOOM)).toBeNull();
    expect(badgeGroups(towns, CLUSTER_MAX_ZOOM + 5)).toBeNull();
    expect(CLUSTER_MAX_ZOOM).toBe(9); // == TOWN_BADGE_MIN_ZOOM: z9+ DOM untouched
  });
});

describe('groupsForVisible (composition + memoization)', () => {
  const towns: TownBadgeCoord[] = [
    { id: 'moore', name: 'Moore', lat: 35.34, lon: -97.487, tier: 'city' },
    { id: 'mustang', name: 'Mustang', lat: 35.384, lon: -97.725, tier: 'city' },
    { id: 'okc', name: 'Oklahoma City', lat: 35.468, lon: -97.516, tier: 'state' },
  ];
  const temps = { moore: 21, mustang: 21.1, okc: 21 };
  const project = (l: [number, number]) => ({ x: (l[0] + 97) * 100, y: (l[1] - 35) * 100 });

  it('clusters badge-visible towns sharing a rounded display temp', () => {
    const g = groupsForVisible(project, towns, 8, temps, 'F');
    expect(g).not.toBeNull();
    // moore/mustang/okc all show 70°F; projected x within 64px of each other
    // (okc-mustang ~21px, okc-moore ~29px) -> one group, labeled by smallest id.
    expect(g!.length).toBe(1);
    expect(clusterLabel(g![0])).toBe('Moore +2');
  });

  it('panning cannot change grouping (rigid projection, zero extra work)', () => {
    const g1 = groupsForVisible(project, towns, 8, temps, 'F');
    // Same towns REFERENCE + same temps reference + same zoom => memo hit:
    // zero recomputation, byte-identical output (performance law).
    const g2 = groupsForVisible(project, towns, 8, temps, 'F');
    expect(g2).toBe(g1);
    // Panned projection (rigid translation) + same inputs => memo hit too.
    const panned = (l: [number, number]) => ({ x: (l[0] + 97) * 100 + 4000, y: (l[1] - 35) * 100 - 900 });
    const g3 = groupsForVisible(panned, towns, 8, temps, 'F');
    expect(g3).toBe(g1);
  });

  it('unit switch re-derives groups (key follows the SHOWN number)', () => {
    // 20.5C shows "69°F"/21°C; 21.0C shows "70°F"/21°C. In F they are
    // DIFFERENT badges (no honest merge); in C they show the SAME number,
    // so they cluster. Clustering follows what the user reads.
    const mixed = { moore: 20.5, mustang: 21.0, okc: 21.0 };
    const gF = groupsForVisible(project, towns, 8, mixed, 'F');
    const gC = groupsForVisible(project, towns, 8, mixed, 'C');
    expect(gF!.length).toBe(2); // 69 | 70+70
    expect(gC!.length).toBe(1); // 21+21+21
  });

  it('zoom >= CLUSTER_MAX_ZOOM disables clustering (solo DOM)', () => {
    expect(groupsForVisible(project, towns, 9, temps, 'F')).toBeNull();
    expect(groupsForVisible(project, towns, 14, temps, 'F')).toBeNull();
  });
});
