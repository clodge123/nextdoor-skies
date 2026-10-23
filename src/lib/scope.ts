// W4-E1 ALL-FEED — URL state for the feed tabs (wave-4 session 4 decision:
// "Feed header tabs: Hot | Latest. Latest IS the all feed — global
// newest-first stream across every town. Deep-link ?scope= for shareable
// tab state.").
//
// SCHEME: the selected tab lives in the query parameter `?scope=` on the
// feed route:
//   /feed                 Hot tab (default — no param, canonical URL)
//   /feed?scope=latest    Latest tab (global newest-first stream)
//   /t/<slug>/feed        Hot tab, town-scoped
//   /t/<slug>/feed?scope=latest   Latest tab, town-scoped
// Rationale (same law as src/lib/panel.ts): a query param keeps the path
// space unambiguous (`/feed` is one page, the tab is transient state),
// deep links restore the tab on hard load, back/forward switch tabs, and
// no new route kinds fork the app.
//
// R17 determinism: pure string transforms, no clock/RNG.

export const SCOPE_PARAM = 'scope';

/** The two feed scopes (S4 brainstorm): Hot = engagement-curated,
 *  Latest = newest-first. */
export type FeedScope = 'hot' | 'latest';

/**
 * Parse the feed scope from a search string ("a=b", "?a=b", or a full
 * href). Absent/unrecognized => 'hot' (the canonical default tab). Pure.
 */
export function parseScope(search: string): FeedScope {
  const i = search.indexOf('?');
  const raw = i >= 0 ? search.slice(i + 1) : search;
  if (!raw) return 'hot';
  try {
    const v = new URLSearchParams(raw).get(SCOPE_PARAM);
    return v === 'latest' ? 'latest' : 'hot';
  } catch {
    return 'hot';
  }
}

/**
 * Feed href selecting `scope`, preserving every other query param (e.g.
 * ?panel= on the map, the ndsCenter test hook). Selecting the default tab
 * ('hot') REMOVES the param so the canonical URL stays clean. Pure.
 */
export function scopeHref(pathname: string, search: string, scope: FeedScope): string {
  const i = search.indexOf('?');
  const raw = i >= 0 ? search.slice(i + 1) : '';
  const params = new URLSearchParams(raw);
  if (scope === 'latest') params.set(SCOPE_PARAM, 'latest');
  else params.delete(SCOPE_PARAM);
  const q = params.toString();
  return q ? `${pathname}?${q}` : pathname;
}
